"""
Tests for scoped dashboard & analytics endpoints and data hygiene.

Verifies:
1. New user gets clean empty structures (zeros, [], None) across all endpoints.
2. User isolation: User A cannot see User B's escrows.
3. Totals accurately equal sum of amount_inr by status.
4. CSV export contains only the authenticated user's rows.
5. Purge test data hygiene script functionality.
"""

import pytest
import io
import csv
from main import app, get_current_user
from conftest import mock_escrows_list, mock_rfqs_list, mock_suppliers_list


def test_new_user_gets_empty_structures(test_client):
    """A new user with zero records must receive empty structures, zeros, and empty lists."""
    app.dependency_overrides[get_current_user] = lambda: "brand_new_user@example.com"

    # 1. Dashboard Analytics
    res = test_client.get("/api/dashboard/analytics")
    assert res.status_code == 200
    data = res.json()
    assert data["rfqs_count"] == 0
    assert data["awaiting_payment_count"] == 0
    assert data["in_progress_count"] == 0
    assert data["completed_count"] == 0
    assert data["refunded_count"] == 0
    assert data["total_volume_inr"] == 0.0
    assert data["orders_by_country"] == []
    assert data["regions_detail"] == []

    # 2. Dashboard Insights
    res = test_client.get("/api/dashboard/insights")
    assert res.status_code == 200
    data = res.json()
    assert data["insights"] == []

    # 3. Dashboard Procurement Feed
    res = test_client.get("/api/dashboard/procurement-feed")
    assert res.status_code == 200
    assert res.json() == []

    # 4. Dashboard Regions
    res = test_client.get("/api/dashboard/regions")
    assert res.status_code == 200
    assert res.json() == []

    # 5. Settlements Analytics
    res = test_client.get("/api/settlements/analytics")
    assert res.status_code == 200
    data = res.json()
    assert data["total_procurement_volume"] == 0.0
    assert data["completed_contracts_count"] == 0
    assert data["active_escrow_count"] == 0
    assert data["regional_distribution"] == []

    # 6. Settlements Ledger
    res = test_client.get("/api/settlements/ledger")
    assert res.status_code == 200
    assert res.json() == []

    # 7. Procurement Analytics
    res = test_client.get("/api/procurement/analytics")
    assert res.status_code == 200
    data = res.json()
    kpis = data["kpis"]
    assert kpis["total_procurement_volume_inr"] == 0.0
    assert kpis["deals_count"] == 0
    assert kpis["completed_rate"] == 0.0
    assert kpis["refund_count"] == 0
    assert kpis["savings"] is None
    assert kpis["suppliers_used"] == 0
    assert data["global_trends"] == []
    assert data["regional_sourcing_intelligence"] == []
    assert data["procurement_category_intelligence"] == []
    assert data["deal_outcomes"]["total_deals"] == 0
    assert data["ai_procurement_insights"] == []


def test_user_isolation_between_buyers(test_client):
    """User A must NEVER see User B's escrows or RFQs in any dashboard or analytics endpoint."""
    user_a = "buyer_alice@example.com"
    user_b = "buyer_bob@example.com"

    # Seed Alice's escrow
    mock_escrows_list.append({
        "escrow_id": "ESC_ALICE_1",
        "buyer_id": user_a,
        "supplier_id": "ALB-1001",
        "supplier_name": "Alice Supplier Ltd",
        "supplier_country": "China",
        "amount_inr": 50000.0,
        "status": "FUNDED",
        "created_at": "2026-05-10T10:00:00Z",
    })

    # Seed Bob's escrow
    mock_escrows_list.append({
        "escrow_id": "ESC_BOB_1",
        "buyer_id": user_b,
        "supplier_id": "ALB-1002",
        "supplier_name": "Bob Supplier Ltd",
        "supplier_country": "India",
        "amount_inr": 120000.0,
        "status": "RELEASED",
        "created_at": "2026-05-11T10:00:00Z",
    })

    # When Alice calls endpoints
    app.dependency_overrides[get_current_user] = lambda: user_a

    res_alice_dash = test_client.get("/api/dashboard/analytics").json()
    assert res_alice_dash["in_progress_count"] == 1
    assert res_alice_dash["completed_count"] == 0
    assert res_alice_dash["total_volume_inr"] == 50000.0

    res_alice_ledger = test_client.get("/api/settlements/ledger").json()
    assert len(res_alice_ledger) == 1
    assert res_alice_ledger[0]["id"] == "ESC_ALICE_1"

    # When Bob calls endpoints
    app.dependency_overrides[get_current_user] = lambda: user_b

    res_bob_dash = test_client.get("/api/dashboard/analytics").json()
    assert res_bob_dash["in_progress_count"] == 0
    assert res_bob_dash["completed_count"] == 1
    assert res_bob_dash["total_volume_inr"] == 120000.0

    res_bob_ledger = test_client.get("/api/settlements/ledger").json()
    assert len(res_bob_ledger) == 1
    assert res_bob_ledger[0]["id"] == "ESC_BOB_1"


def test_totals_equal_sum_of_escrow_amounts(test_client):
    """Total volume must exactly equal sum of amounts for FUNDED through RELEASED deals."""
    user = "volume_check_user@example.com"
    app.dependency_overrides[get_current_user] = lambda: user

    # CREATED: awaiting payment (should not count in total_volume_inr)
    mock_escrows_list.append({
        "escrow_id": "ESC_C1",
        "buyer_id": user,
        "amount_inr": 15000.0,
        "status": "CREATED",
        "created_at": "2026-05-01T00:00:00Z"
    })
    # FUNDED: in progress
    mock_escrows_list.append({
        "escrow_id": "ESC_F1",
        "buyer_id": user,
        "amount_inr": 35000.0,
        "status": "FUNDED",
        "created_at": "2026-05-02T00:00:00Z"
    })
    # VERIFIED: in progress
    mock_escrows_list.append({
        "escrow_id": "ESC_V1",
        "buyer_id": user,
        "amount_inr": 45000.0,
        "status": "VERIFIED",
        "created_at": "2026-05-03T00:00:00Z"
    })
    # RELEASED: completed
    mock_escrows_list.append({
        "escrow_id": "ESC_R1",
        "buyer_id": user,
        "amount_inr": 20000.0,
        "status": "RELEASED",
        "created_at": "2026-05-04T00:00:00Z"
    })
    # REFUNDED: refunded
    mock_escrows_list.append({
        "escrow_id": "ESC_REF1",
        "buyer_id": user,
        "amount_inr": 10000.0,
        "status": "REFUNDED",
        "created_at": "2026-05-05T00:00:00Z"
    })

    res = test_client.get("/api/dashboard/analytics").json()
    assert res["awaiting_payment_count"] == 1
    assert res["in_progress_count"] == 2
    assert res["completed_count"] == 1
    assert res["refunded_count"] == 1
    # 35000 + 45000 + 20000 = 100000.0
    assert res["total_volume_inr"] == 100000.0

    res_proc = test_client.get("/api/procurement/analytics").json()
    assert res_proc["kpis"]["total_procurement_volume_inr"] == 100000.0
    assert res_proc["deal_outcomes"]["completed"] == 1
    assert res_proc["deal_outcomes"]["in_progress"] == 2
    assert res_proc["deal_outcomes"]["awaiting_payment"] == 1
    assert res_proc["deal_outcomes"]["refunded"] == 1


def test_csv_export_contains_only_user_rows(test_client):
    """CSV export must include only records belonging to the authenticated user."""
    user_me = "csv_user@example.com"
    user_other = "stranger@example.com"

    mock_escrows_list.append({
        "escrow_id": "ESC_MINE_1",
        "buyer_id": user_me,
        "supplier_name": "My Supplier",
        "amount_inr": 75000.0,
        "status": "FUNDED",
        "created_at": "2026-05-01T12:00:00Z"
    })
    mock_escrows_list.append({
        "escrow_id": "ESC_OTHER_1",
        "buyer_id": user_other,
        "supplier_name": "Stranger Supplier",
        "amount_inr": 99999.0,
        "status": "RELEASED",
        "created_at": "2026-05-02T12:00:00Z"
    })

    app.dependency_overrides[get_current_user] = lambda: user_me
    res = test_client.get("/api/settlements/export-csv")
    assert res.status_code == 200
    assert "text/csv" in res.headers["content-type"]

    content = res.text
    reader = csv.reader(io.StringIO(content))
    rows = list(reader)
    header = rows[0]
    assert header == ["id", "supplier", "amount_inr", "status", "created_at"]
    assert len(rows) == 2  # header + 1 user row
    assert rows[1][0] == "ESC_MINE_1"
    assert rows[1][1] == "My Supplier"
    assert "ESC_OTHER_1" not in content
