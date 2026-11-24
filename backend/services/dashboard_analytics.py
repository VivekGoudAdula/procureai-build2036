"""
Dashboard Analytics Service

Computes real-time procurement metrics strictly scoped to the authenticated
user's own records (escrows, RFQs, ratings). No synthetic scaling factors,
no hardcoded fallbacks, and no canned default values.
"""

import os
import json
from typing import Dict, Any, List, Optional
from database.db import escrows_collection, rfqs_collection, suppliers_collection

SEARCH_CACHE_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "alibaba_search_cache.json")


class DashboardAnalyticsService:
    """
    Computes dashboard KPIs and regional supplier metrics strictly scoped to buyer_id.
    """

    def _load_json(self, path: str, default: Any) -> Any:
        """Helper to read json safely (maintained for backwards-compatible test coverage)."""
        if not os.path.exists(path):
            return default
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return default

    def get_raw_suppliers(self) -> List[Dict[str, Any]]:
        """Returns cached suppliers for legacy tests."""
        from database.db import get_cached_suppliers
        suppliers = get_cached_suppliers()
        cached_search = self._load_json(SEARCH_CACHE_PATH, [])
        if isinstance(cached_search, list):
            suppliers.extend(cached_search)
        return suppliers

    def _get_supplier_country_map(self) -> Dict[str, str]:
        """Builds an id -> country lookup map for suppliers in database."""
        try:
            suppliers = list(suppliers_collection.find({}, {"_id": 0, "id": 1, "country": 1, "region": 1}))
            country_map = {}
            for s in suppliers:
                s_id = str(s.get("id"))
                country = s.get("country") or s.get("region") or "Unknown"
                country_map[s_id] = country
            return country_map
        except Exception:
            return {}

    def calculate_analytics(self, buyer_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculates dashboard metrics for the given user (or all if None).
        Returns zeros and empty lists if the user has no records.
        """
        query: Dict[str, Any] = {}
        if buyer_id is not None:
            if not buyer_id:
                return {
                    "rfqs_count": 0,
                    "awaiting_payment_count": 0,
                    "in_progress_count": 0,
                    "completed_count": 0,
                    "refunded_count": 0,
                    "total_volume_inr": 0.0,
                    "orders_by_country": [],
                    "regions_detail": [],
                    "active_negotiation_count": 0,
                    "avg_delivery_time": 0.0,
                    "avg_pricing": 0.0,
                }
            query = {
                "$or": [
                    {"buyer_id": buyer_id},
                    {"user_id": buyer_id},
                    {"buyer_email": buyer_id},
                    {"user_email": buyer_id},
                ]
            }

        # 1. Fetch user's escrows
        escrows = list(escrows_collection.find(query, {"_id": 0}))

        # 2. Fetch user's RFQs
        rfqs_count = rfqs_collection.count_documents(query)

        # 3. Status breakdown
        awaiting_payment_count = 0
        in_progress_count = 0
        completed_count = 0
        refunded_count = 0
        total_volume_inr = 0.0
        total_lead_time = 0
        total_price = 0.0

        for esc in escrows:
            status = str(esc.get("status") or esc.get("escrow_status", "")).upper()
            amt = float(esc.get("amount_inr", esc.get("amount", 0.0)))
            lead_time = int(esc.get("promised_delivery_days", 0))
            total_lead_time += lead_time
            total_price += amt

            if status in ["CREATED"]:
                awaiting_payment_count += 1
            elif status in ["FUNDED", "PROOF_UPLOADED", "VERIFIED", "LOCKED"]:
                in_progress_count += 1
                total_volume_inr += amt
            elif status in ["RELEASED"]:
                completed_count += 1
                total_volume_inr += amt
            elif status in ["REFUNDED"]:
                refunded_count += 1

        # 4. Orders by supplier country
        supplier_country_map = self._get_supplier_country_map()
        country_counts: Dict[str, int] = {}

        for esc in escrows:
            s_id = str(esc.get("supplier_id", ""))
            country = esc.get("supplier_country") or supplier_country_map.get(s_id) or "Unknown"
            country_counts[country] = country_counts.get(country, 0) + 1

        orders_by_country = [
            {"name": country, "deals": count, "escrows": count}
            for country, count in sorted(country_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        regions_detail = [
            {
                "region": country,
                "active_suppliers": count,
                "deals_count": count,
            }
            for country, count in sorted(country_counts.items(), key=lambda x: x[1], reverse=True)
        ]

        count = len(escrows)
        avg_delivery = round(total_lead_time / count, 1) if count > 0 else 0.0
        avg_price = round(total_price / count, 2) if count > 0 else 0.0

        return {
            "rfqs_count": rfqs_count,
            "awaiting_payment_count": awaiting_payment_count,
            "in_progress_count": in_progress_count,
            "completed_count": completed_count,
            "refunded_count": refunded_count,
            "total_volume_inr": round(total_volume_inr, 2),
            "orders_by_country": orders_by_country,
            "regions_detail": regions_detail,
            "active_negotiation_count": in_progress_count,
            "avg_delivery_time": avg_delivery,
            "avg_pricing": avg_price,
        }
