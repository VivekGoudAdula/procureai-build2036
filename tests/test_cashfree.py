"""
Unit tests for Cashfree Payment Gateway integration (Sandbox Escrow Funding).
"""

from unittest.mock import MagicMock
from main import app, get_current_user


def test_initiate_commitment_leaves_status_created(test_client):
    """Verify that initiate-commitment creates an escrow in CREATED status without funding."""
    app.dependency_overrides[get_current_user] = lambda: "buyer_test@example.com"
    payload = {
        "supplier_id": "SUPP-CF-1",
        "amount_inr": 25000.0,
        "promised_delivery_days": 10,
    }
    res = test_client.post("/api/procurement/initiate-commitment", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "CREATED"
    assert data["escrow_status"] == "created"
    assert data["amount_inr"] == 25000.0
    assert data["payment_status"] == "PENDING"
    assert data["cashfree_order_id"] is None


def test_missing_cashfree_keys_returns_503(test_client, monkeypatch):
    """Verify missing Cashfree credentials return 503 Payments not configured."""
    monkeypatch.setenv("CASHFREE_APP_ID", "")
    monkeypatch.setenv("CASHFREE_SECRET_KEY", "")

    app.dependency_overrides[get_current_user] = lambda: "buyer_test@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-CF-2", "amount_inr": 5000.0},
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]

    # create-order -> 503
    create_res = test_client.post(
        "/api/payments/cashfree/create-order",
        json={"escrow_id": escrow_id, "customer_phone": "9876543210"},
    )
    assert create_res.status_code == 503
    assert "Payments not configured" in create_res.json()["detail"]

    # verify -> 503
    verify_res = test_client.post(
        "/api/payments/cashfree/verify",
        json={"escrow_id": escrow_id},
    )
    assert verify_res.status_code == 503
    assert "Payments not configured" in verify_res.json()["detail"]


def test_create_order_non_owner_forbidden(test_client, monkeypatch):
    """Verify non-owner receives 403 Forbidden when creating a payment order."""
    monkeypatch.setenv("CASHFREE_APP_ID", "CF_MOCK_APP_ID")
    monkeypatch.setenv("CASHFREE_SECRET_KEY", "CF_MOCK_SECRET_KEY")

    # Create escrow as buyer1
    app.dependency_overrides[get_current_user] = lambda: "buyer1@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-CF-3", "amount_inr": 12000.0},
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]

    # Attempt create-order as buyer2
    app.dependency_overrides[get_current_user] = lambda: "buyer2@example.com"
    res = test_client.post(
        "/api/payments/cashfree/create-order",
        json={"escrow_id": escrow_id, "customer_phone": "9876543210"},
    )
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]


def test_create_order_and_verify_funds_when_paid(test_client, monkeypatch):
    """Verify successful end-to-end Cashfree sandbox payment flow: CREATED -> FUNDED."""
    monkeypatch.setenv("CASHFREE_APP_ID", "CF_MOCK_APP_ID")
    monkeypatch.setenv("CASHFREE_SECRET_KEY", "CF_MOCK_SECRET_KEY")
    monkeypatch.setenv("CASHFREE_ENV", "sandbox")

    app.dependency_overrides[get_current_user] = lambda: "buyer_verified@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-CF-4", "amount_inr": 15000.0},
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]

    expected_order_id = f"CF_{escrow_id}"

    # Mock Cashfree POST /orders response
    mock_post_resp = MagicMock()
    mock_post_resp.status_code = 200
    mock_post_resp.json.return_value = {
        "order_id": expected_order_id,
        "payment_session_id": "session_cf_mock_12345",
        "order_status": "ACTIVE",
        "order_amount": 15000.0,
    }
    monkeypatch.setattr("requests.post", lambda *args, **kwargs: mock_post_resp)

    # 1. Create order
    create_res = test_client.post(
        "/api/payments/cashfree/create-order",
        json={"escrow_id": escrow_id, "customer_phone": "9876543210"},
    )
    assert create_res.status_code == 200
    order_data = create_res.json()
    assert order_data["payment_session_id"] == "session_cf_mock_12345"
    assert order_data["cashfree_order_id"] == expected_order_id
    assert order_data["amount_inr"] == 15000.0

    # 2. Mock Cashfree GET /orders/{order_id} returning PAID
    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.json.return_value = {
        "order_id": expected_order_id,
        "order_status": "PAID",
        "order_amount": 15000.0,
    }
    monkeypatch.setattr("requests.get", lambda *args, **kwargs: mock_get_resp)

    # 3. Verify order -> Transitions to FUNDED
    verify_res = test_client.post(
        "/api/payments/cashfree/verify",
        json={"escrow_id": escrow_id},
    )
    assert verify_res.status_code == 200
    vdata = verify_res.json()
    assert vdata["funded"] is True
    assert vdata["status"] == "FUNDED"
    assert vdata["escrow"]["status"] == "FUNDED"
    assert vdata["escrow"]["cashfree_order_id"] == expected_order_id
    assert vdata["escrow"]["payment_status"] == "PAID"

    # Wording check: "Payment received via Cashfree (sandbox)"
    history_notes = [h["note"] for h in vdata["escrow"]["history"]]
    assert any("Payment received via Cashfree (sandbox)" in note for note in history_notes)

    # 4. Idempotent check: calling verify again returns status: FUNDED
    second_verify = test_client.post(
        "/api/payments/cashfree/verify",
        json={"escrow_id": escrow_id},
    )
    assert second_verify.status_code == 200
    assert second_verify.json()["funded"] is True
    assert second_verify.json()["status"] == "FUNDED"


def test_verify_amount_mismatch_does_not_fund(test_client, monkeypatch):
    """Verify amount mismatch from Cashfree leaves escrow in CREATED status without funding."""
    monkeypatch.setenv("CASHFREE_APP_ID", "CF_MOCK_APP_ID")
    monkeypatch.setenv("CASHFREE_SECRET_KEY", "CF_MOCK_SECRET_KEY")

    app.dependency_overrides[get_current_user] = lambda: "buyer_mismatch@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-CF-5", "amount_inr": 20000.0},
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]
    order_id = f"CF_{escrow_id}"

    # Mock order creation
    mock_post_resp = MagicMock()
    mock_post_resp.status_code = 200
    mock_post_resp.json.return_value = {
        "order_id": order_id,
        "payment_session_id": "session_mismatch_abc",
        "order_status": "ACTIVE",
        "order_amount": 20000.0,
    }
    monkeypatch.setattr("requests.post", lambda *args, **kwargs: mock_post_resp)

    test_client.post(
        "/api/payments/cashfree/create-order",
        json={"escrow_id": escrow_id, "customer_phone": "9812345678"},
    )

    # Mock GET returning PAID but with DIFFERENT amount (e.g. 5000 instead of 20000)
    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.json.return_value = {
        "order_id": order_id,
        "order_status": "PAID",
        "order_amount": 5000.0,
    }
    monkeypatch.setattr("requests.get", lambda *args, **kwargs: mock_get_resp)

    verify_res = test_client.post(
        "/api/payments/cashfree/verify",
        json={"escrow_id": escrow_id},
    )
    assert verify_res.status_code == 200
    vdata = verify_res.json()
    assert vdata["funded"] is False
    assert vdata["status"] == "CREATED"


def test_verify_active_or_failed_status_leaves_created(test_client, monkeypatch):
    """Verify pending/active/expired Cashfree order leaves escrow in CREATED status."""
    monkeypatch.setenv("CASHFREE_APP_ID", "CF_MOCK_APP_ID")
    monkeypatch.setenv("CASHFREE_SECRET_KEY", "CF_MOCK_SECRET_KEY")

    app.dependency_overrides[get_current_user] = lambda: "buyer_pending@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-CF-6", "amount_inr": 1000.0},
    )
    escrow_id = init_res.json()["escrow_id"]
    order_id = f"CF_{escrow_id}"

    mock_post_resp = MagicMock()
    mock_post_resp.status_code = 200
    mock_post_resp.json.return_value = {
        "order_id": order_id,
        "payment_session_id": "session_active_xyz",
        "order_status": "ACTIVE",
        "order_amount": 1000.0,
    }
    monkeypatch.setattr("requests.post", lambda *args, **kwargs: mock_post_resp)

    test_client.post(
        "/api/payments/cashfree/create-order",
        json={"escrow_id": escrow_id, "customer_phone": "9123456780"},
    )

    # Cashfree reports ACTIVE (user closed modal before completing payment)
    mock_get_resp = MagicMock()
    mock_get_resp.status_code = 200
    mock_get_resp.json.return_value = {
        "order_id": order_id,
        "order_status": "ACTIVE",
        "order_amount": 1000.0,
    }
    monkeypatch.setattr("requests.get", lambda *args, **kwargs: mock_get_resp)

    verify_res = test_client.post(
        "/api/payments/cashfree/verify",
        json={"escrow_id": escrow_id},
    )
    assert verify_res.status_code == 200
    vdata = verify_res.json()
    assert vdata["funded"] is False
    assert vdata["status"] == "CREATED"
