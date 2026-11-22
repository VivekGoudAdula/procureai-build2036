import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_full_escrow_lifecycle():
    """
    Tests the complete simulated state machine flow:
    1. Escrow Creation & Funding (/api/procurement/initiate-commitment) -> CREATED -> FUNDED
    2. Submit Delivery Proof (/api/submit-delivery-proof) -> PROOF_UPLOADED
    3. Verify Delivery (/api/procurement/verify-delivery) -> VERIFIED
    4. Confirm Delivery / Release Settlement (/api/procurement/release-settlement) -> RELEASED
    """
    
    # 1. ESCROW CREATION
    initiate_payload = {
        "supplier_id": "ALB-1001",
        "amount_inr": 50000.0,
        "promised_delivery_days": 5
    }
    
    create_response = client.post("/api/procurement/initiate-commitment", json=initiate_payload)
    assert create_response.status_code == 200
    
    escrow_data = create_response.json()
    assert "escrow_id" in escrow_data
    assert escrow_data["status"] == "CREATED"
    assert escrow_data["provider"] == "cashfree"
    assert escrow_data["amount_inr"] == 50000.0
    assert len(escrow_data["history"]) == 1
    assert escrow_data["history"][0]["status"] == "CREATED"
    
    escrow_id = escrow_data["escrow_id"]
    from services.escrow_service import fund_escrow
    fund_escrow(escrow_id, f"CF_{escrow_id}", 50000.0, "test@example.com")
    
    # 2. SUBMIT DELIVERY PROOF
    proof_payload = {
        "escrow_id": escrow_id,
        "proof_type": "timestamp",
        "value": "2026-06-03T20:30:00Z"
    }
    
    proof_response = client.post("/api/submit-delivery-proof", data=proof_payload)
    assert proof_response.status_code == 200
    
    proof_data = proof_response.json()
    assert proof_data["status"] == "PROOF_UPLOADED"
    assert proof_data["delivery_proof"]["type"] == "timestamp"
    assert proof_data["delivery_proof"]["value"] == "2026-06-03T20:30:00Z"
    assert proof_data["history"][-1]["status"] == "PROOF_UPLOADED"
    
    # 3. VERIFY DELIVERY
    verify_payload = {
        "escrow_id": escrow_id
    }
    
    verify_response = client.post("/api/procurement/verify-delivery", json=verify_payload)
    assert verify_response.status_code == 200
    
    verify_data = verify_response.json()
    assert verify_data["status"] == "VERIFIED"
    assert verify_data["verified"] is True
    assert verify_data["history"][-1]["status"] == "VERIFIED"
    
    # 4. RELEASE SETTLEMENT
    release_payload = {
        "transaction_id": escrow_id
    }
    
    release_response = client.post("/api/procurement/release-settlement", json=release_payload)
    assert release_response.status_code == 200
    
    release_data = release_response.json()
    assert release_data["status"] == "RELEASED"
    assert release_data["verified"] is True
    assert release_data["history"][-1]["status"] == "RELEASED"

def test_release_before_verified_returns_409():
    """
    Verifies that trying to release settlement before proof is verified returns HTTP 409 Conflict.
    """
    # 1. Create an escrow (starts at FUNDED)
    initiate_payload = {
        "supplier_id": "ALB-1002",
        "amount_inr": 25000.0,
        "promised_delivery_days": 7
    }
    create_response = client.post("/api/procurement/initiate-commitment", json=initiate_payload)
    assert create_response.status_code == 200
    escrow_id = create_response.json()["escrow_id"]
    from services.escrow_service import fund_escrow
    fund_escrow(escrow_id, f"CF_{escrow_id}", 25000.0, "test@example.com")

    # 2. Attempt to release directly from FUNDED (skipping PROOF_UPLOADED and VERIFIED)
    release_response = client.post("/api/procurement/release-settlement", json={"transaction_id": escrow_id})
    assert release_response.status_code == 409
    assert "Invalid escrow state transition" in release_response.json()["detail"]

def test_invalid_transition_returns_409():
    """
    Verifies that arbitrary invalid state transitions return HTTP 409 Conflict.
    """
    initiate_payload = {
        "supplier_id": "ALB-1003",
        "amount_inr": 15000.0,
        "promised_delivery_days": 3
    }
    create_response = client.post("/api/procurement/initiate-commitment", json=initiate_payload)
    assert create_response.status_code == 200
    escrow_id = create_response.json()["escrow_id"]

    # Try transitioning from FUNDED directly to RELEASED via update endpoint
    update_response = client.post(
        "/api/update-escrow-status",
        json={"transaction_id": escrow_id, "status": "RELEASED"}
    )
    assert update_response.status_code == 409
    assert "Invalid escrow state transition" in update_response.json()["detail"]

def test_get_transaction():
    """
    Verifies that querying an escrow returns its full simulated record.
    """
    initiate_payload = {
        "supplier_id": "ALB-1004",
        "amount_inr": 10000.0,
        "promised_delivery_days": 4
    }
    create_response = client.post("/api/procurement/initiate-commitment", json=initiate_payload)
    assert create_response.status_code == 200
    escrow_id = create_response.json()["escrow_id"]

    get_response = client.get(f"/api/get-transaction/{escrow_id}")
    assert get_response.status_code == 200
    record = get_response.json()
    assert record["escrow_id"] == escrow_id
    assert record["amount_inr"] == 10000.0
    assert record["provider"] in ["cashfree", "simulated"]
