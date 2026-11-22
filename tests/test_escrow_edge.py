import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_double_release_prevention():
    """
    Verifies that trying to release a settlement for an escrow that is already
    released returns HTTP 409 Conflict.
    """
    # 1. Create escrow
    initiate_payload = {
        "supplier_id": "ALB-1005",
        "amount_inr": 20000.0,
        "promised_delivery_days": 5
    }
    create_res = client.post("/api/procurement/initiate-commitment", json=initiate_payload)
    assert create_res.status_code == 200
    escrow_id = create_res.json()["escrow_id"]

    from services.escrow_service import fund_escrow
    fund_escrow(escrow_id, f"CF_{escrow_id}", 20000.0, "test@example.com")

    # 2. Upload proof
    proof_res = client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "timestamp", "value": "2026-06-04"}
    )
    assert proof_res.status_code == 200

    # 3. Verify delivery
    verify_res = client.post("/api/procurement/verify-delivery", json={"escrow_id": escrow_id})
    assert verify_res.status_code == 200

    # 4. First release succeeds
    release_res = client.post("/api/procurement/release-settlement", json={"transaction_id": escrow_id})
    assert release_res.status_code == 200

    # 5. Second release attempt returns 409 Conflict
    second_release = client.post("/api/procurement/release-settlement", json={"transaction_id": escrow_id})
    assert second_release.status_code == 409
    assert "Invalid escrow state transition" in second_release.json()["detail"]

def test_invalid_escrow_id():
    """
    Verifies that calling verify-delivery, release-settlement, or submit-delivery-proof
    with an invalid or non-existent escrow ID returns HTTP 404.
    """
    invalid_id = "non_existent_escrow_id_123"

    # Test release-settlement
    payload_release = {"transaction_id": invalid_id}
    response_release = client.post("/api/procurement/release-settlement", json=payload_release)
    assert response_release.status_code == 404
    assert "not found" in response_release.json()["detail"].lower()

    # Test verify-delivery
    payload_verify = {"escrow_id": invalid_id}
    response_verify = client.post("/api/procurement/verify-delivery", json=payload_verify)
    assert response_verify.status_code == 404
    assert "not found" in response_verify.json()["detail"].lower()

    # Test submit-delivery-proof
    response_proof = client.post(
        "/api/submit-delivery-proof",
        data={
            "escrow_id": invalid_id,
            "proof_type": "timestamp",
            "value": "2026-06-04"
        }
    )
    assert response_proof.status_code == 404
    assert "not found" in response_proof.json()["detail"].lower()

def test_release_without_verification():
    """
    Verifies that trying to release an escrow settlement that has not been
    verified returns HTTP 409 Conflict.
    """
    initiate_payload = {
        "supplier_id": "ALB-1006",
        "amount_inr": 12000.0,
        "promised_delivery_days": 3
    }
    create_res = client.post("/api/procurement/initiate-commitment", json=initiate_payload)
    assert create_res.status_code == 200
    escrow_id = create_res.json()["escrow_id"]

    # Releasing directly without proof and verification must fail with 409
    response = client.post("/api/procurement/release-settlement", json={"transaction_id": escrow_id})
    assert response.status_code == 409
    assert "Invalid escrow state transition" in response.json()["detail"]

def test_unknown_transaction():
    """
    Verifies that querying an unknown transaction ID returns HTTP 404.
    """
    response_get = client.get("/api/get-transaction/non_existent_tx_999")
    assert response_get.status_code == 404
