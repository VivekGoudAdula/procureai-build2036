import sys
import os

# Set testing mode before importing backend components to disable slowapi rate limits
os.environ["TESTING"] = "True"
os.environ.setdefault("JWT_SECRET_KEY", "test_jwt_secret_key_1234567890")

import copy
from unittest.mock import MagicMock
import pytest

# Add backend directory to sys.path to enable imports of main and services
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)
database_path = os.path.join(backend_path, "database")
if database_path not in sys.path:
    sys.path.insert(0, database_path)
ai_path = os.path.join(backend_path, "ai")
if ai_path not in sys.path:
    sys.path.insert(0, ai_path)

# main import moved to the bottom of the file to allow mock registrations first

# In-memory storage for collections
mock_users_list = []
mock_escrows_list = []
mock_suppliers_list = []
mock_rfqs_list = []
mock_proofs_list = []

class MockCollection:
    def __init__(self, data_list):
        self.data_list = data_list

    def find(self, query=None, projection=None):
        return [copy.deepcopy(x) for x in self.data_list]

    def find_one(self, query=None, projection=None):
        if not query:
            return copy.deepcopy(self.data_list[0]) if self.data_list else None
        
        def match_item(item, q):
            for k, v in q.items():
                if k == "$or":
                    if not any(match_item(item, sub) for sub in v):
                        return False
                elif item.get(k) != v and str(item.get(k)) != str(v):
                    return False
            return True

        for item in self.data_list:
            if match_item(item, query):
                return copy.deepcopy(item)
        return None

    def delete_many(self, query):
        self.data_list.clear()
        return MagicMock()

    def insert_one(self, document):
        self.data_list.append(copy.deepcopy(document))
        res = MagicMock()
        res.inserted_id = "mock_id"
        return res

    def insert_many(self, documents):
        for doc in documents:
            self.data_list.append(copy.deepcopy(doc))
        return MagicMock()

    def replace_one(self, filter_query, replacement, upsert=False):
        tx_id = filter_query.get("transaction_id") or filter_query.get("escrow_id")
        for i, item in enumerate(self.data_list):
            if (tx_id and (item.get("transaction_id") == tx_id or item.get("escrow_id") == tx_id)) or item.get("escrow_id") == filter_query.get("escrow_id"):
                self.data_list[i] = copy.deepcopy(replacement)
                return MagicMock()
        if upsert:
            self.data_list.append(copy.deepcopy(replacement))
        return MagicMock()

    def update_one(self, filter_query, update, upsert=False):
        def match_item(item, q):
            for k, v in q.items():
                if k == "$or":
                    if not any(match_item(item, sub) for sub in v):
                        return False
                elif item.get(k) != v and str(item.get(k)) != str(v):
                    return False
            return True

        for i, item in enumerate(self.data_list):
            if match_item(item, filter_query):
                if "$set" in update:
                    self.data_list[i].update(copy.deepcopy(update["$set"]))
                if "$push" in update:
                    for pk, pv in update["$push"].items():
                        self.data_list[i].setdefault(pk, []).append(copy.deepcopy(pv))
                if "$inc" in update:
                    for ik, iv in update["$inc"].items():
                        self.data_list[i][ik] = self.data_list[i].get(ik, 0) + iv
                res = MagicMock()
                res.matched_count = 1
                res.modified_count = 1
                return res
        if upsert and "$set" in update:
            new_doc = copy.deepcopy(filter_query)
            new_doc.update(update["$set"])
            self.data_list.append(new_doc)
            res = MagicMock()
            res.matched_count = 0
            res.modified_count = 1
            return res
        res = MagicMock()
        res.matched_count = 0
        res.modified_count = 0
        return res

    def create_index(self, *args, **kwargs):
        pass

# Instantiate mock collections
mock_users_collection = MockCollection(mock_users_list)
mock_escrows_collection = MockCollection(mock_escrows_list)
mock_suppliers_collection = MockCollection(mock_suppliers_list)
mock_rfqs_collection = MockCollection(mock_rfqs_list)
mock_proofs_collection = MockCollection(mock_proofs_list)

# Mock pymongo before importing main
mock_pymongo = MagicMock()
mock_client = MagicMock()
mock_db = MagicMock()

mock_pymongo.MongoClient.return_value = mock_client
mock_client.__getitem__.return_value = mock_db

def get_collection_mock(name):
    if name == "users":
        return mock_users_collection
    elif name == "escrows":
        return mock_escrows_collection
    elif name == "suppliers":
        return mock_suppliers_collection
    elif name == "rfqs":
        return mock_rfqs_collection
    elif name in ["delivery_proofs", "proofs"]:
        return mock_proofs_collection
    return MagicMock()

mock_db.__getitem__.side_effect = get_collection_mock

# Inject the mocked pymongo module into sys.modules
sys.modules['pymongo'] = mock_pymongo

@pytest.fixture(autouse=True)
def mock_external_dependencies(monkeypatch):
    """
    Autouse fixture to mock external service calls (like email sending and external APIs)
    to keep unit tests isolated, fast, and stable.
    """
    
    import conftest as _ct
    # Mock SMTP email sending to avoid hanging or authenticating during tests
    from services.email_service import EmailService as _EmailService
    if not hasattr(_ct, "_original_send_procurement_inquiry"):
        _ct._original_send_procurement_inquiry = _EmailService.send_procurement_inquiry
    monkeypatch.setattr(
        "services.email_service.EmailService.send_procurement_inquiry",
        lambda self, name, email, subject, body: {"status": "sent", "provider": "smtp_mock"},
    )

    # Mock AlibabaProcurementService run_intelligence to prevent 429 rate limit errors in unit tests
    from services.alibaba_procurement_service import AlibabaProcurementService
    _original_run_intelligence = AlibabaProcurementService.run_intelligence
    _ct._original_run_intelligence = _original_run_intelligence
    def mock_run_intelligence(self, request):
        return {
            "suppliers": generate_conftest_suppliers()[:10],
            "recommended_supplier": generate_conftest_suppliers()[0],
            "rejected_suppliers": [],
            "procurement_analysis": {"total_scanned": 10, "eligible_count": 10},
            "logs": []
        }
    monkeypatch.setattr(AlibabaProcurementService, "run_intelligence", mock_run_intelligence)

    # Reset in-memory database lists between tests
    mock_users_list.clear()
    mock_escrows_list.clear()
    mock_suppliers_list.clear()
    mock_rfqs_list.clear()
    
    # Mock main's reference to database loading suppliers
    monkeypatch.setattr("db.get_cached_suppliers", lambda product_name=None: mock_suppliers_list)
    monkeypatch.setattr("db.get_alibaba_suppliers", lambda product_name=None: mock_suppliers_list)
    
    # Pre-populate mock suppliers to ensure we have a realistic list for test runs
    mock_suppliers_list.extend(generate_conftest_suppliers())


def generate_conftest_suppliers():
    import random
    import hashlib
    regions = ["China", "Vietnam", "India", "Turkey", "Bangladesh"]
    categories = ["apparel", "electronics", "industrial", "medical", "general"]
    products = {
        "industrial": ["Industrial Components", "Steel Rods", "Cement", "Plywood", "Valves", "Ball Bearings"],
        "apparel": ["Cotton Shirts", "Polyester Jackets", "T-Shirts Bulk", "Knitted Fabrics", "Premium Hides"],
        "electronics": ["Laptop", "Smartphones", "TV", "Server Rack", "Solid State Drive"],
        "medical": ["Surgical Masks", "Gloves", "Medical Gowns"],
        "general": ["Office Chairs", "Cardboard Packaging", "Plastic Shells"]
    }
    
    suppliers = []
    rng = random.Random(42)
    for i in range(1, 135):
        cat = rng.choice(categories)
        prod = rng.choice(products[cat])
        region = rng.choice(regions)
        rel = rng.uniform(0.7, 0.99)
        base_price = round(rng.uniform(5.0, 1500.0), 2)
        s_id = f"ALB-{1000 + i}"
        suppliers.append({
            "id": s_id,
            "name": f"Alibaba Global {prod} Partner {i}",
            "category": cat,
            "product": prod,
            "reliability": rel,
            "address": "DLF Cyber City, Gurgaon, Haryana, India",
            "endpoint": f"/supplier/{s_id}/respond",
            "base_price": base_price,
            "reliability_score": int(rel * 100),
            "rating": round(rel * 5, 1),
            "delivery_days": rng.randint(2, 15),
            "success_rate": max(0, min(100, int(rel * 100) + rng.randint(-3, 1))),
            "total_deals": 10 + i % 5,
            "successful_deals": 9 + i % 5,
            "failed_deals": 1,
            "on_time_deliveries": 8 + i % 5,
            "late_deliveries": 2,
            "country": region,
            "region": region,
            "moq": rng.choice([100, 250, 500, 1000]),
            "lead_time_days": rng.randint(5, 20),
            "negotiated_price": round(base_price * 0.85, 2)
        })
    return suppliers

# Global FastAPI dependency overrides for standard test isolation
# This is placed at the end to ensure all mock modules (pymongo) are registered in sys.modules first.
from main import app, get_current_user
app.dependency_overrides[get_current_user] = lambda: "test@example.com"


@pytest.fixture
def test_client():
    from fastapi.testclient import TestClient
    return TestClient(app)


def pytest_sessionfinish(session, exitstatus):
    """Embed full test inventory into htmlcov/ after coverage HTML is generated."""
    if exitstatus != 0:
        return
    htmlcov = os.path.join(os.path.dirname(__file__), "..", "htmlcov")
    if not os.path.isdir(htmlcov):
        return
    try:
        import subprocess
        script = os.path.join(os.path.dirname(__file__), "..", "scripts", "enhance_coverage_html.py")
        if os.path.isfile(script):
            subprocess.run([sys.executable, script], cwd=os.path.join(os.path.dirname(__file__), ".."), check=False)
    except Exception:
        pass

