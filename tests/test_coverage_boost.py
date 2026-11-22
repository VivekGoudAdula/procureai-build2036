"""
Additional unit tests targeting backend services and helper modules.
"""
import os
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from fastapi.testclient import TestClient

from main import app
from services.alibaba_procurement_service import AlibabaProcurementService
from services.email_service import EmailService
from services.llm_service import chat_json
import services.escrow_service as escrow_service

client = TestClient(app)


# --- alibaba_procurement_service.py (direct method coverage) ---

def test_alibaba_detect_category_and_metadata():
    service = AlibabaProcurementService()
    assert service._detect_category("industrial pump valve") == "industrial"
    assert service._detect_category("cotton shirt apparel") == "apparel"
    assert service._detect_category("laptop electronics") == "electronics"
    assert service._detect_category("surgical mask medical") == "medical"
    assert service._detect_category("office supplies") == "general"
    meta = service._get_category_metadata("industrial")
    assert "regions" in meta
    assert service._get_category_metadata("unknown_cat")["risk_profile"] == "Medium"


def test_alibaba_fetch_without_api_key():
    service = AlibabaProcurementService()
    service.rapidapi_key = None
    assert service._fetch_alibaba_search("query") == []


@patch("services.alibaba_procurement_service.requests.get")
def test_alibaba_fetch_api_error_returns_empty(mock_get):
    mock_get.side_effect = Exception("network failure")
    service = AlibabaProcurementService()
    service.rapidapi_key = "test_key"
    assert service._fetch_alibaba_search("query") == []


def test_alibaba_normalize_and_enrich():
    service = AlibabaProcurementService()
    raw = {
        "item": {"itemId": "123", "title": "Valve"},
        "company": {"companyName": "Zhejiang Valve Co Ltd", "companyAddress": {"country": "China"}}
    }
    enriched = service._normalize_and_enrich(raw, "industrial")
    assert enriched["name"] == "Zhejiang Valve Co Ltd"
    assert enriched["country"] == "China"


# --- escrow_service.py ---

def test_escrow_service_invalid_amount():
    with pytest.raises(Exception):
        escrow_service.create_and_fund_escrow("buyer_1", "supp_1", -10.0)


# --- email_service.py ---

def _unmock_email(monkeypatch):
    import conftest as _ct
    if hasattr(_ct, "_original_send_procurement_inquiry"):
        monkeypatch.setattr(EmailService, "send_procurement_inquiry", _ct._original_send_procurement_inquiry)

def test_email_service_dry_run_mode(monkeypatch):
    _unmock_email(monkeypatch)
    monkeypatch.setenv("EMAIL_DRY_RUN", "true")
    svc = EmailService()
    res = svc.send_procurement_inquiry("Supplier", "supplier@example.com", "Subject", "Body")
    assert res["status"] == "dry_run"


def test_email_service_unconfigured_smtp(monkeypatch):
    _unmock_email(monkeypatch)
    monkeypatch.setenv("SMTP_EMAIL", "")
    monkeypatch.setenv("SMTP_PASSWORD", "")
    monkeypatch.setenv("EMAIL_DRY_RUN", "false")
    svc = EmailService()
    res = svc.send_procurement_inquiry("Supplier", "supplier@example.com", "Subject", "Body")
    assert res["status"] == "dry_run"


# --- llm_service.py ---

def test_llm_service_no_api_key(monkeypatch):
    monkeypatch.delenv("GROQ_API_KEY", raising=False)
    res = chat_json("system", "user")
    assert res is None


# --- database password migration ---

def test_db_password_migration():
    from conftest import mock_users_list
    mock_users_list.append({"email": "legacy@example.com", "password": "plaintextpass"})
    from database.db import migrate_plaintext_passwords
    migrate_plaintext_passwords()
    user = next(u for u in mock_users_list if u["email"] == "legacy@example.com")
    assert user["password"].startswith("$2")
