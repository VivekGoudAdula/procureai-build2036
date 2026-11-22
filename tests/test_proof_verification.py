"""
Unit tests for delivery proof upload, Groq audit validation, verification and release lifecycle.
"""

from unittest.mock import MagicMock
import io
import pytest
from main import app, get_current_user
from services.escrow_service import fund_escrow


def test_proof_rejected_wrong_file_type(test_client):
    """Verify proof upload is rejected if file type is not JPG, PNG, or PDF."""
    app.dependency_overrides[get_current_user] = lambda: "buyer_proof_test@example.com"
    
    # 1. Create escrow
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-P1", "amount_inr": 10000.0, "promised_delivery_days": 5}
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]

    # Fund escrow
    fund_escrow(escrow_id, f"CF_{escrow_id}", 10000.0, "buyer_proof_test@example.com")

    # 2. Upload invalid executable file
    exe_file = io.BytesIO(b"MZ\x90\x00\x03\x00\x00\x00executable content")
    res = test_client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "invoice_file"},
        files={"file": ("malicious.exe", exe_file, "application/x-msdownload")}
    )
    assert res.status_code == 400
    assert "file type" in res.json()["detail"].lower()

    # 3. Upload text file
    txt_file = io.BytesIO(b"Plain text invoice note")
    res_txt = test_client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "invoice_file"},
        files={"file": ("invoice.txt", txt_file, "text/plain")}
    )
    assert res_txt.status_code == 400
    assert "file type" in res_txt.json()["detail"].lower()


def test_proof_rejected_oversized_file(test_client):
    """Verify proof upload is rejected if file exceeds 5 MB."""
    app.dependency_overrides[get_current_user] = lambda: "buyer_size_test@example.com"
    
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-P2", "amount_inr": 12000.0}
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]
    fund_escrow(escrow_id, f"CF_{escrow_id}", 12000.0, "buyer_size_test@example.com")

    # Oversized payload (5.2 MB)
    large_pdf_data = b"%PDF-1.4 " + (b"0" * (5242880 + 100))
    res = test_client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "invoice_file"},
        files={"file": ("huge_invoice.pdf", io.BytesIO(large_pdf_data), "application/pdf")}
    )
    assert res.status_code == 400
    assert "exceeds maximum limit of 5 mb" in res.json()["detail"].lower()


def test_submit_and_verify_proof_non_owner_forbidden(test_client):
    """Verify non-owner receives 403 Forbidden for proof submit, verify, and release."""
    # Create as buyer_owner
    app.dependency_overrides[get_current_user] = lambda: "buyer_owner@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-P3", "amount_inr": 15000.0}
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]
    fund_escrow(escrow_id, f"CF_{escrow_id}", 15000.0, "buyer_owner@example.com")

    # Switch identity to attacker / intruder
    app.dependency_overrides[get_current_user] = lambda: "attacker@example.com"

    # 1. Intruder submit proof -> 403
    proof_res = test_client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "timestamp", "value": "2026-06-03T10:00:00Z"}
    )
    assert proof_res.status_code == 403
    assert "forbidden" in proof_res.json()["detail"].lower()

    # 2. Intruder verify delivery -> 403
    verify_res = test_client.post(
        "/api/procurement/verify-delivery",
        json={"escrow_id": escrow_id}
    )
    assert verify_res.status_code == 403
    assert "forbidden" in verify_res.json()["detail"].lower()

    # 3. Intruder release settlement -> 403
    release_res = test_client.post(
        "/api/procurement/release-settlement",
        json={"transaction_id": escrow_id}
    )
    assert release_res.status_code == 403
    assert "forbidden" in release_res.json()["detail"].lower()


def test_verify_before_proof_uploaded_returns_409(test_client):
    """Verify trying to verify delivery before proof upload returns HTTP 409 Conflict."""
    app.dependency_overrides[get_current_user] = lambda: "buyer_premature@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-P4", "amount_inr": 8000.0}
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]

    # In CREATED state -> 409
    res_created = test_client.post("/api/procurement/verify-delivery", json={"escrow_id": escrow_id})
    assert res_created.status_code == 409

    # In FUNDED state (no proof uploaded) -> 409
    fund_escrow(escrow_id, f"CF_{escrow_id}", 8000.0, "buyer_premature@example.com")
    res_funded = test_client.post("/api/procurement/verify-delivery", json={"escrow_id": escrow_id})
    assert res_funded.status_code == 409
    assert "invalid escrow state transition" in res_funded.json()["detail"].lower()


def test_audit_proof_with_and_without_llm(test_client, monkeypatch):
    """Verify automated audit returns extracted mismatches with Groq or handles missing LLM gracefully."""
    app.dependency_overrides[get_current_user] = lambda: "buyer_audit@example.com"
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "SUPP-P5", "amount_inr": 20000.0}
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]
    fund_escrow(escrow_id, f"CF_{escrow_id}", 20000.0, "buyer_audit@example.com")

    # Upload valid PDF
    valid_pdf = io.BytesIO(b"%PDF-1.4\n1 0 obj\n<< /Title (Invoice #101) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF")
    upload_res = test_client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "invoice_file"},
        files={"file": ("commercial_invoice.pdf", valid_pdf, "application/pdf")}
    )
    assert upload_res.status_code == 200

    # 1. When LLM is unavailable (returns None)
    monkeypatch.setattr("services.llm_service.chat_json", lambda sys, usr: None)
    audit_res_none = test_client.post("/api/procurement/audit-proof", json={"escrow_id": escrow_id})
    assert audit_res_none.status_code == 200
    data_none = audit_res_none.json()
    assert data_none["status"] == "unavailable"
    assert "Automated check unavailable; buyer confirms manually" in data_none["message"]

    # 2. When LLM returns parsed invoice with an amount mismatch
    mock_llm_output = {
        "looks_like_invoice": True,
        "extracted": {
            "invoice_no": "INV-2026-99",
            "date": "2026-06-03",
            "amount": 18500.0,  # Expected 20000.0
            "supplier_name": "Unrelated Supplier Corp"
        }
    }
    monkeypatch.setattr("services.llm_service.chat_json", lambda sys, usr: mock_llm_output)
    audit_res = test_client.post("/api/procurement/audit-proof", json={"escrow_id": escrow_id})
    assert audit_res.status_code == 200
    audit_data = audit_res.json()
    assert audit_data["status"] == "completed"
    assert audit_data["looks_like_invoice"] is True
    assert len(audit_data["mismatches"]) > 0
    assert any("Amount mismatch" in m for m in audit_data["mismatches"])


def test_full_lifecycle_reaches_released(test_client):
    """
    Test complete post-payment lifecycle:
    CREATED -> FUNDED -> PROOF_UPLOADED -> VERIFIED -> RELEASED.
    Confirms MongoDB storage of proof and complete history record.
    """
    app.dependency_overrides[get_current_user] = lambda: "buyer_lifecycle@example.com"
    
    # 1. CREATED
    init_res = test_client.post(
        "/api/procurement/initiate-commitment",
        json={"supplier_id": "ALB-1001", "amount_inr": 35000.0, "promised_delivery_days": 7}
    )
    assert init_res.status_code == 200
    escrow_id = init_res.json()["escrow_id"]
    assert init_res.json()["status"] == "CREATED"

    # 2. FUNDED
    fund_res = fund_escrow(escrow_id, f"CF_{escrow_id}", 35000.0, "buyer_lifecycle@example.com")
    assert fund_res["status"] == "FUNDED"

    # 3. PROOF_UPLOADED
    pdf_bytes = b"%PDF-1.4 valid proof document for delivery"
    proof_res = test_client.post(
        "/api/submit-delivery-proof",
        data={"escrow_id": escrow_id, "proof_type": "invoice_file"},
        files={"file": ("delivery_bill.pdf", io.BytesIO(pdf_bytes), "application/pdf")}
    )
    assert proof_res.status_code == 200
    assert proof_res.json()["status"] == "PROOF_UPLOADED"

    # Verify proof can be retrieved via endpoint
    get_proof_res = test_client.get(f"/api/procurement/proof/{escrow_id}")
    assert get_proof_res.status_code == 200
    assert get_proof_res.content == pdf_bytes
    assert get_proof_res.headers["content-type"] == "application/pdf"

    # 4. VERIFIED
    verify_res = test_client.post("/api/procurement/verify-delivery", json={"escrow_id": escrow_id})
    assert verify_res.status_code == 200
    assert verify_res.json()["status"] == "VERIFIED"

    # 5. RELEASED
    release_res = test_client.post("/api/procurement/release-settlement", json={"transaction_id": escrow_id})
    assert release_res.status_code == 200
    assert release_res.json()["status"] == "RELEASED"

    # 6. Re-fetch transaction and confirm timeline history
    tx_res = test_client.get(f"/api/get-transaction/{escrow_id}")
    assert tx_res.status_code == 200
    record = tx_res.json()
    assert record["status"] == "RELEASED"
    
    statuses_in_history = [h["status"] for h in record.get("history", [])]
    assert "CREATED" in statuses_in_history
    assert "FUNDED" in statuses_in_history
    assert "PROOF_UPLOADED" in statuses_in_history
    assert "VERIFIED" in statuses_in_history
    assert "RELEASED" in statuses_in_history
