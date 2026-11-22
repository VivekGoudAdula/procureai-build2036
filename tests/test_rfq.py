"""
Unit tests for RFQ PDF generation and distribution endpoints.
Validates:
- Valid PDF generation (starts with %PDF)
- Authorization and access control (owner vs non-owner 403)
- Dry-run dispatch when SMTP is unconfigured or in dry-run mode
- Validation error (422) when supplier email is unavailable
"""

import pytest
from fastapi.testclient import TestClient
from main import app, get_current_user
from services.rfq_pdf_service import build_rfq_pdf


@pytest.fixture
def test_client():
    return TestClient(app)


def test_build_rfq_pdf_starts_with_pdf_header():
    """Verify that build_rfq_pdf generates valid PDF bytes starting with %PDF."""
    pdf_bytes = build_rfq_pdf({
        "product": "Industrial Flanges",
        "quantity": 1000,
        "budget": 500000,
        "buyer_name": "Procurement Head",
        "buyer_email": "buyer1@example.com",
        "supplier_name": "Bharat Heavy Steel",
        "supplier_email": "contact@bharatsteel.example",
        "lead_time": "15 Days",
        "delivery_location": "Pune, Maharashtra",
        "custom_requirements": "Material grade SS316, ultrasonic tested"
    })
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000


def test_generate_rfq_success(test_client):
    """Verify POST /api/procurement/rfq/generate builds and stores RFQ."""
    app.dependency_overrides[get_current_user] = lambda: "buyer1@example.com"
    payload = {
        "supplier_id": "SUP-999",
        "supplier_name": "Gujarat Textiles Ltd",
        "supplier_email": "sales@gujarattextiles.example",
        "product": "Organic Cotton Yarn",
        "quantity": 2500,
        "budget": 750000,
        "lead_time": "20 Days",
        "delivery_location": "Surat, Gujarat",
        "custom_requirements": "Count 40s Combed, GOTS Certified"
    }

    res = test_client.post("/api/procurement/rfq/generate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "rfq_id" in data
    assert data["rfq_id"].startswith("RFQ-")
    assert data["filename"] == f"{data['rfq_id']}.pdf"

    # Fetch PDF as owner
    pdf_res = test_client.get(f"/api/procurement/rfq/{data['rfq_id']}/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF")


def test_get_rfq_pdf_non_owner_forbidden(test_client):
    """Verify non-owner receives 403 Forbidden when accessing another buyer's RFQ PDF."""
    app.dependency_overrides[get_current_user] = lambda: "buyer1@example.com"
    payload = {
        "supplier_id": "SUP-101",
        "supplier_name": "Bangalore Precision Tools",
        "supplier_email": "info@bangaloreprecision.example",
        "product": "Carbide End Mills",
        "quantity": 100,
        "budget": 120000
    }
    gen_res = test_client.post("/api/procurement/rfq/generate", json=payload)
    assert gen_res.status_code == 200
    rfq_id = gen_res.json()["rfq_id"]

    # Non-owner access attempt
    app.dependency_overrides[get_current_user] = lambda: "buyer2@example.com"
    res = test_client.get(f"/api/procurement/rfq/{rfq_id}/pdf")
    assert res.status_code == 403
    assert "Forbidden" in res.json()["detail"]


def test_send_rfq_dry_run_and_non_owner(test_client, monkeypatch):
    """Verify sending RFQ returns dry_run status when unconfigured, and blocks non-owner."""
    monkeypatch.setenv("EMAIL_DRY_RUN", "true")
    monkeypatch.setenv("SMTP_EMAIL", "")
    monkeypatch.setenv("SMTP_PASSWORD", "")

    app.dependency_overrides[get_current_user] = lambda: "buyer1@example.com"
    payload = {
        "supplier_id": "SUP-202",
        "supplier_name": "Maharashtra Pharma Pack",
        "supplier_email": "rfq@mahapharma.example",
        "product": "Amber Glass Vials 10ml",
        "quantity": 50000,
        "budget": 450000
    }
    gen_res = test_client.post("/api/procurement/rfq/generate", json=payload)
    assert gen_res.status_code == 200
    rfq_id = gen_res.json()["rfq_id"]

    # Non-owner attempt to send -> 403
    app.dependency_overrides[get_current_user] = lambda: "buyer2@example.com"
    forbidden_send = test_client.post(f"/api/procurement/rfq/{rfq_id}/send")
    assert forbidden_send.status_code == 403

    # Owner send -> 200 with status: dry_run
    app.dependency_overrides[get_current_user] = lambda: "buyer1@example.com"
    send_res = test_client.post(f"/api/procurement/rfq/{rfq_id}/send")
    assert send_res.status_code == 200
    data = send_res.json()
    assert data["status"] == "dry_run"
    assert "dry run" in data["message"].lower() or "dry-run" in data["message"].lower() or data["email_status"]["status"] == "dry_run"


def test_missing_supplier_email_gives_422(test_client):
    """Verify missing supplier email returns 422 with 'Supplier email not available'."""
    app.dependency_overrides[get_current_user] = lambda: "buyer1@example.com"
    payload = {
        "supplier_id": "NON_EXISTENT_SUPPLIER_WITHOUT_EMAIL",
        "supplier_name": "Anonymous Vendor",
        "supplier_email": "",
        "product": "Generic Widgets",
        "quantity": 10,
        "budget": 5000
    }
    res = test_client.post("/api/procurement/rfq/generate", json=payload)
    assert res.status_code == 422
    assert "Supplier email not available" in res.json()["detail"]
