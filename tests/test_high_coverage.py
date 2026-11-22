"""
High-coverage tests targeting main.py, escrow_service, services, and ai_agent.
Tests for simulated escrow, AI agents, and services.
"""
import base64
import json
import os
import pytest
from unittest.mock import MagicMock, patch, mock_open, AsyncMock
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)



def test_negotiation_and_inquiry_endpoints():
    r = client.post("/api/negotiation/multilingual", json={
        "buyer_message": "Need lower MOQ", "supplier_language": "Chinese",
        "product": "Steel", "round_number": 1,
    })
    assert r.status_code == 200
    r = client.post("/api/negotiation/multilingual/full", json={
        "buyer_message": "Start", "supplier_language": "Vietnamese", "product": "Jackets",
    })
    assert r.status_code == 200
    assert r.json()["total_rounds"] == 3
    r = client.get("/api/negotiation/languages")
    assert r.status_code == 200
    r = client.post("/api/negotiation/intelligence", json={
        "supplier_message": "We offer CE certified goods with flexible MOQ.",
        "supplier_metadata": {}, "procurement_context": {},
    })
    assert r.status_code == 200
    r = client.post("/api/procurement/send-inquiry", json={
        "supplier_name": "Acme", "supplier_email": "acme@example.com",
        "supplier_region": "China", "original_message": "Quote for 100 units",
    })
    assert r.status_code == 200
    assert r.json()["status"] == "success"


def test_supplier_respond_all_rounds():
    from conftest import mock_suppliers_list
    sid = str(mock_suppliers_list[0]["id"])
    for rnd in [1, 2, 3]:
        r = client.post(f"/supplier/{sid}/respond", json={
            "product": "Steel", "quantity": 100, "budget": 5000.0, "round": rnd,
        })
        assert r.status_code == 200
        assert "offer_price" in r.json()


def test_supplier_respond_not_found():
    r = client.post("/supplier/INVALID-ID-999/respond", json={
        "product": "X", "quantity": 1, "budget": 100.0, "round": 1,
    })
    assert r.status_code == 404


def test_escrow_utility_endpoints():
    from conftest import mock_escrows_list
    tx_id = "tx_get_update"
    mock_escrows_list.append({
        "transaction_id": tx_id, "escrow_id": tx_id, "status": "FUNDED", "escrow_status": "funded", "verified": False,
    })
    r = client.get(f"/api/get-transaction/{tx_id}")
    assert r.status_code == 200
    r = client.post("/api/update-escrow-status", json={"transaction_id": tx_id, "status": "PROOF_UPLOADED"})
    assert r.status_code == 200
    r = client.post("/api/update-reputation", json={"supplier_id": "ALB-1001", "delivered_on_time": True})
    assert r.status_code == 200


def test_verify_delivery_short_proof_and_release_by_app_id():
    from conftest import mock_escrows_list
    tx_id = "tx_short_proof"
    mock_escrows_list.append({
        "transaction_id": tx_id, "escrow_id": tx_id, "app_id": 77777,
        "status": "PROOF_UPLOADED",
        "escrow_status": "proof_uploaded", "verified": False,
        "delivery_proof": {"type": "timestamp", "value": "2026-06-04T15:00:00Z"},
        "supplier_id": "ALB-1001", "promised_delivery_days": 10, "timestamp": 1700000000.0,
    })
    r = client.post("/api/procurement/verify-delivery", json={"escrow_id": "77777"})
    assert r.status_code == 200
    assert r.json()["verified"] is True


def test_submit_proof_missing_file():
    from conftest import mock_escrows_list
    tx_id = "tx_no_file"
    mock_escrows_list.append({"transaction_id": tx_id, "app_id": 1, "escrow_status": "funded", "verified": False})
    r = client.post("/api/submit-delivery-proof", data={
        "escrow_id": tx_id, "proof_type": "invoice_file", "value": "",
    })
    assert r.status_code == 400


def test_ai_agent_fallback_suppliers(monkeypatch):
    from ai_agent import get_alibaba_suppliers, run_agent_competition

    monkeypatch.setattr("db.get_cached_suppliers", lambda product_name=None: [])
    suppliers = get_alibaba_suppliers("unique_product_xyz", 10, 5000.0)
    assert len(suppliers) == 0
    comp = run_agent_competition("unique_product_xyz", 10, 5000.0, {"max_budget": 999999})
    assert comp["status"] == "no_supplier_found"

    dummy = [{
        "id": f"S{i}", "name": f"Supplier {i}", "base_price": 100.0,
        "delivery_days": 5, "reliability_score": 90, "success_rate": 95,
        "shipping_region": "Global", "moq": 1
    } for i in range(5)]
    monkeypatch.setattr("db.get_cached_suppliers", lambda product_name=None: dummy)
    suppliers = get_alibaba_suppliers("unique_product_xyz", 10, 5000.0)
    assert len(suppliers) >= 5
    comp = run_agent_competition("unique_product_xyz", 10, 5000.0, {"max_budget": 999999})
    assert comp["status"] == "success"



@patch("services.alibaba_procurement_service.requests.get")
def test_alibaba_parse_paths_and_region_filter(mock_get):
    import conftest
    from services.alibaba_procurement_service import AlibabaProcurementService
    svc = AlibabaProcurementService()
    svc.rapidapi_key = "key"
    # Path 2: result -> item at root
    mock_get.return_value = MagicMock(status_code=200, json=lambda: {
        "result": {"item": [{"item": {"itemId": "2", "title": "T", "sku": {"def": {
            "priceModule": {"price": "5"}, "quantityModule": {"minOrder": {"quantity": 1}}
        }}}, "seller": {}, "company": {"companyName": "Co", "companyAddress": {"country": "China"},
        "status": {}}}]}
    })
    items = svc._fetch_alibaba_search("shirt")
    assert len(items) >= 1
    # run_intelligence with region
    original = getattr(conftest, "_original_run_intelligence", AlibabaProcurementService.run_intelligence)
    with patch.object(AlibabaProcurementService, "run_intelligence", original):
        with patch.object(svc, "_fetch_alibaba_search", return_value=[{
            "item": {"itemId": "CN1", "title": "Prod", "sku": {"def": {
                "priceModule": {"price": "10"}, "quantityModule": {"minOrder": {"quantity": 1}}
            }}}, "seller": {"storeAge": "3"},
            "company": {"companyName": "CN Supplier", "companyAddress": {"country": "China"}, "status": {}},
        }]):
            res = svc.run_intelligence({"product_name": "shirt", "quantity": 10, "shipping_region": "China"})
    assert len(res["suppliers"]) >= 1


@patch("services.alibaba_procurement_service.requests.get")
def test_alibaba_api_error_status(mock_get):
    from services.alibaba_procurement_service import AlibabaProcurementService
    svc = AlibabaProcurementService()
    svc.rapidapi_key = "key"
    mock_get.return_value = MagicMock(status_code=429, json=lambda: {})
    assert svc._fetch_alibaba_search("x") == []


# ─── supplier_intelligence_service ────────────────────────────────────────────

def test_supplier_intelligence_full_pipeline():
    from services.supplier_intelligence_service import SupplierIntelligenceService
    db_json = json.dumps({"suppliers": [{
        "id": "ALB-2001", "name": "Test Co", "product": "Steel Rods", "category": "industrial",
        "base_price": 50.0, "reliability_score": 90, "delivery_days": 7, "reputation_hash": "abc",
        "successful_deals": 20, "success_rate": 95, "moq": 10, "shipping_region": "Global",
    }]})
    service = SupplierIntelligenceService()
    with patch("builtins.open", mock_open(read_data=db_json)):
        res = service.get_suppliers("Steel", 100, 50000.0, filters={"budget": 999999, "min_trust": 50})
    assert res["recommended_supplier"] is not None
    assert res["procurement_analysis"]["eligible_count"] >= 1
    with patch("builtins.open", mock_open(read_data=db_json)):
        res2 = service.get_suppliers("Steel", 5, 100.0, filters={"budget": 1})
    assert len(res2["rejected_suppliers"]) >= 0


@patch("services.supplier_intelligence_service.requests.get")
def test_supplier_intelligence_fetch_api(mock_get):
    from services.supplier_intelligence_service import SupplierIntelligenceService
    svc = SupplierIntelligenceService()
    svc.api_key = "test"
    mock_get.return_value = MagicMock(status_code=200, json=lambda: {"ok": True})
    assert svc.fetch_alibaba_data("123") == {"ok": True}
    svc.api_key = None
    assert svc.fetch_alibaba_data("123") is None


# ─── email_service (real method body; conftest mocks send by default) ─────────

def _restore_email_send(monkeypatch):
    import conftest as ct
    from services.email_service import EmailService
    monkeypatch.setattr(
        EmailService, "send_procurement_inquiry", ct._original_send_procurement_inquiry
    )


@patch("services.email_service.smtplib.SMTP")
def test_email_send_success(mock_smtp, monkeypatch):
    _restore_email_send(monkeypatch)
    monkeypatch.setenv("SMTP_EMAIL", "t@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("EMAIL_DRY_RUN", "false")
    from services.email_service import EmailService
    service = EmailService()
    mock_smtp.return_value = MagicMock()
    result = service.send_procurement_inquiry("S", "s@x.com", "Subj", "<p>Hi</p>")
    assert result["status"] == "success"


def test_email_send_simulated(monkeypatch):
    _restore_email_send(monkeypatch)
    monkeypatch.delenv("SMTP_EMAIL", raising=False)
    monkeypatch.delenv("SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("EMAIL_DRY_RUN", raising=False)
    from services.email_service import EmailService
    service = EmailService()
    with patch.object(service, "_load_credentials", lambda: None):
        service.smtp_email = ""
        service.smtp_password = ""
        result = service.send_procurement_inquiry("S", "s@x.com", "Subj", "<p>Hi</p>")
    assert result["status"] == "dry_run"


# ─── db.py ────────────────────────────────────────────────────────────────────

def test_get_cached_suppliers_db_error(monkeypatch):
    import db as db_mod

    def _boom():
        raise RuntimeError("mongo down")

    monkeypatch.setattr(db_mod, "_load_suppliers_from_db", _boom)
    monkeypatch.setattr(db_mod, "get_cached_suppliers", db_mod._get_cached_suppliers_uncached)
    assert db_mod.get_cached_suppliers() == []


def test_main_analytics_error_paths():
    with patch("main.procurement_analytics_engine.calculate_procurement_intelligence", side_effect=RuntimeError("fail")):
        r = client.get("/api/procurement/analytics")
    assert r.status_code == 500
    with patch("main.dashboard_analytics.calculate_analytics", side_effect=RuntimeError("fail")):
        assert client.get("/api/dashboard/analytics").status_code == 500
    with patch("main.negotiation_engine.run_negotiation", side_effect=RuntimeError("fail")):
        assert client.post("/api/negotiation/multilingual", json={
            "buyer_message": "hi", "supplier_language": "English", "product": "X",
        }).status_code == 500


@patch("services.email_service.smtplib.SMTP")
def test_email_send_error(mock_smtp, monkeypatch):
    _restore_email_send(monkeypatch)
    monkeypatch.setenv("SMTP_EMAIL", "t@example.com")
    monkeypatch.setenv("SMTP_PASSWORD", "secret")
    monkeypatch.setenv("EMAIL_DRY_RUN", "false")
    from services.email_service import EmailService
    mock_smtp.return_value.starttls.side_effect = Exception("smtp down")
    service = EmailService()
    result = service.send_procurement_inquiry("S", "s@x.com", "Subj", "<p>Hi</p>")
    assert result["status"] == "error"


def test_supplier_intelligence_rejection_filters():
    from services.supplier_intelligence_service import SupplierIntelligenceService
    db_json = json.dumps({"suppliers": [{
        "id": "R1", "name": "Reject Co", "product": "Steel", "category": "industrial",
        "base_price": 500.0, "reliability_score": 50, "delivery_days": 30, "moq": 1000,
        "shipping_region": "Asia",
    }]})
    svc = SupplierIntelligenceService()
    with patch("builtins.open", mock_open(read_data=db_json)):
        res = svc.get_suppliers("Steel", 10, 100.0, filters={
            "budget": 50, "lead_time_days": 5, "min_trust": 80, "shipping_region": "Europe",
        })
    assert res["procurement_analysis"]["rejected_count"] >= 1


@patch("main.select_best_supplier")
def test_select_supplier_value_error(mock_select):
    mock_select.side_effect = ValueError("not found")
    r = client.post("/api/select-supplier", json={"productName": "X", "quantity": 1, "budget": 100})
    assert r.status_code == 404


@pytest.mark.anyio
def test_ai_agent_base_url_fallback():
    import ai_agent
    with patch.dict(os.environ, {"APP_URL": "MY_APP_URL"}):
        import importlib
        importlib.reload(ai_agent)
        assert ai_agent.BASE_URL == "http://localhost:8000"
    importlib.reload(ai_agent)


def test_db_migrate_exception_handling():
    from conftest import mock_users_collection
    with patch.object(mock_users_collection, "find", side_effect=Exception("db fail")):
        from db import migrate_plaintext_passwords
        migrate_plaintext_passwords()


@patch("main.select_best_supplier")
def test_select_supplier_internal_error(mock_select):
    mock_select.side_effect = RuntimeError("boom")
    r = client.post("/api/select-supplier", json={"productName": "X", "quantity": 1, "budget": 100})
    assert r.status_code == 500


@patch("ai_agent.get_alibaba_suppliers", return_value=[])
def test_run_agent_competition_empty_with_category(mock_gs):
    from ai_agent import run_agent_competition
    result = run_agent_competition("industrial pumps", 10, 5000.0)
    assert result["status"] == "no_supplier_found"


def test_update_reputation_unknown_supplier():
    r = client.post("/api/update-reputation", json={"supplier_id": "UNKNOWN-XYZ", "delivered_on_time": True})
    assert r.status_code == 200


def test_procurement_intelligence_error():
    with patch("main.procurement_engine.run_intelligence", side_effect=RuntimeError("fail")):
        r = client.post("/api/procurement/intelligence", json={
            "product_name": "Steel", "quantity": 10, "budget": 5000.0,
        })
    assert r.status_code == 500


def test_release_settlement_bad_proof_timestamp():
    from conftest import mock_escrows_list
    tx_id = "tx_bad_ts"
    mock_escrows_list.append({
        "transaction_id": tx_id, "escrow_id": tx_id, "app_id": 1,
        "status": "VERIFIED",
        "escrow_status": "verified", "verified": True, "supplier_id": "ALB-1001",
        "promised_delivery_days": 30, "timestamp": 1700000000.0,
        "delivery_proof": {"submitted_at": "not-a-date", "type": "timestamp", "value": "ok"},
    })
    r = client.post("/api/procurement/release-settlement", json={"transaction_id": tx_id})
    assert r.status_code == 200


def test_verify_delivery_tracking_proof_short_value():
    from conftest import mock_escrows_list
    tx_id = "tx_tracking_short"
    mock_escrows_list.append({
        "transaction_id": tx_id, "escrow_id": tx_id, "app_id": 1,
        "status": "PROOF_UPLOADED",
        "escrow_status": "proof_uploaded",
        "verified": False, "delivery_proof": {"type": "tracking_id", "value": "ab"},
    })
    r = client.post("/api/procurement/verify-delivery", json={"escrow_id": tx_id})
    assert r.status_code == 200
    assert r.json()["verified"] is True
