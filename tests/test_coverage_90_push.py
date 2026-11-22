"""Targeted tests to keep backend coverage high."""
import json
import os
import runpy
from unittest.mock import MagicMock, patch, mock_open, AsyncMock
import pytest


# --- services ---

def test_dashboard_load_json_error(tmp_path):
    from services.dashboard_analytics import DashboardAnalyticsService
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    svc = DashboardAnalyticsService()
    assert svc._load_json(str(bad), []) == []


@patch("db.get_alibaba_suppliers", return_value=[])
def test_dashboard_raw_suppliers_with_cache(mock_sup):
    from services.dashboard_analytics import DashboardAnalyticsService
    svc = DashboardAnalyticsService()
    cache_data = [{"id": "C1", "name": "Cached Supplier"}]
    with patch.object(svc, "_load_json", return_value=cache_data):
        result = svc.get_raw_suppliers()
    assert len(result) >= 1


@patch("services.alibaba_procurement_service.requests.get")
def test_alibaba_fetch_result_items_path(mock_get):
    from services.alibaba_procurement_service import AlibabaProcurementService
    svc = AlibabaProcurementService()
    svc.rapidapi_key = "k"
    entry = {
        "item": {"itemId": "A1", "title": "T",
                 "sku": {"def": {"priceModule": {"price": "1"},
                                 "quantityModule": {"minOrder": {"quantity": 1}}}}},
        "seller": {}, "company": {"companyName": "Co", "companyAddress": {"country": "CN"}, "status": {}},
    }
    mock_get.return_value = MagicMock(status_code=200, json=lambda: {"result": {"items": [entry]}})
    assert len(svc._fetch_alibaba_search("parts")) >= 1


@patch("services.alibaba_procurement_service.requests.get")
def test_alibaba_fetch_data_list_path(mock_get):
    from services.alibaba_procurement_service import AlibabaProcurementService
    svc = AlibabaProcurementService()
    svc.rapidapi_key = "k"
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {"data": [{"itemId": "B1", "seller": {}, "company": {}}]},
    )
    assert len(svc._fetch_alibaba_search("parts")) >= 1


@patch("services.alibaba_procurement_service.requests.get")
def test_alibaba_deep_recursive_search(mock_get):
    from services.alibaba_procurement_service import AlibabaProcurementService
    svc = AlibabaProcurementService()
    svc.rapidapi_key = "k"
    mock_get.return_value = MagicMock(
        status_code=200,
        json=lambda: {"wrapper": {"nested": [{"itemId": "D1", "seller": {}, "company": {}}]}},
    )
    items = svc._fetch_alibaba_search("gear")
    assert len(items) == 1


# --- main.py __main__ ---

def test_main_block_runs_uvicorn():
    main_path = os.path.join(os.path.dirname(__file__), "..", "backend", "main.py")
    with patch("uvicorn.run") as mock_run:
        with patch.dict(os.environ, {"APP_ENV": "production"}, clear=False):
            runpy.run_path(main_path, run_name="__main__")
    mock_run.assert_called_once()
