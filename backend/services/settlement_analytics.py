"""
Settlement Analytics Service

Provides real-time transactional compliance and settlement ledger data
filtered strictly by the authenticated user's buyer_id.
All hardcoded demo transactions and enterprise simulation multipliers have been removed.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from database.db import escrows_collection, suppliers_collection


class SettlementAnalyticsService:
    """
    Computes settlement ledger rows and transactional telemetry for a given buyer.
    """

    def _get_supplier_lookup(self) -> Dict[str, Dict[str, Any]]:
        """Maps supplier_id to supplier attributes (name, country, category)."""
        try:
            suppliers = list(suppliers_collection.find({}, {"_id": 0}))
            lookup: Dict[str, Dict[str, Any]] = {}
            for s in suppliers:
                s_id = str(s.get("id"))
                lookup[s_id] = {
                    "name": s.get("name") or "Global Supplier",
                    "country": s.get("country") or s.get("region") or "Unknown",
                    "category": s.get("category") or "Components",
                }
            return lookup
        except Exception:
            return {}

    def compile_settlement_ledger(self, buyer_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Builds the settlement ledger strictly from escrows in MongoDB.
        Returns an empty list for a new user with zero records.
        """
        query: Dict[str, Any] = {}
        if buyer_id is not None:
            if not buyer_id:
                return []
            query = {
                "$or": [
                    {"buyer_id": buyer_id},
                    {"user_id": buyer_id},
                    {"buyer_email": buyer_id},
                    {"user_email": buyer_id},
                ]
            }

        escrows = list(escrows_collection.find(query, {"_id": 0}))
        if not escrows:
            return []

        supplier_lookup = self._get_supplier_lookup()
        ledger_rows: List[Dict[str, Any]] = []

        status_display_map = {
            "CREATED": "Awaiting Payment",
            "FUNDED": "Escrow Secured",
            "PROOF_UPLOADED": "Awaiting Verification",
            "VERIFIED": "Delivery Verified",
            "RELEASED": "Settlement Released",
            "REFUNDED": "Refunded",
        }

        verification_status_map = {
            "CREATED": "Pending Gateway Payment",
            "FUNDED": "Awaiting Supplier Delivery Proof",
            "PROOF_UPLOADED": "Delivery Proof Under Review",
            "VERIFIED": "Receipt Verified",
            "RELEASED": "Released & Settled",
            "REFUNDED": "Funds Returned to Buyer",
        }

        def _get_sort_key(item: Dict[str, Any]) -> str:
            return str(item.get("created_at") or item.get("updated_at") or item.get("timestamp") or "")

        escrows.sort(key=_get_sort_key, reverse=True)

        for esc in escrows:
            escrow_id = esc.get("escrow_id") or esc.get("transaction_id") or "ESC"
            supplier_id = str(esc.get("supplier_id", ""))
            sup_info = supplier_lookup.get(supplier_id, {})

            supplier_name = esc.get("supplier_name") or sup_info.get("name") or "Supplier Partner"
            country = esc.get("supplier_country") or sup_info.get("country") or "Unknown"
            category = esc.get("product_category") or sup_info.get("category") or "General Goods"

            raw_status = str(esc.get("status") or esc.get("escrow_status", "CREATED")).upper()
            display_status = status_display_map.get(raw_status, raw_status.title())
            delivery_verification = verification_status_map.get(raw_status, "Awaiting Processing")

            created_raw = esc.get("created_at") or esc.get("timestamp")
            date_str = ""
            if created_raw:
                try:
                    date_str = str(created_raw)[:10]
                except Exception:
                    date_str = str(created_raw)

            amount_inr = float(esc.get("amount_inr", esc.get("amount", 0.0)))
            lead_time_days = esc.get("promised_delivery_days", 0)

            ledger_rows.append({
                "id": escrow_id,
                "supplier": supplier_name,
                "supplier_id": supplier_id,
                "category": category,
                "contract_value": round(amount_inr, 2),
                "status": display_status,
                "raw_status": raw_status,
                "delivery_verification": delivery_verification,
                "region": country,
                "date": date_str,
                "lead_time": f"{lead_time_days} days" if lead_time_days else "Not specified",
                "proof_of_delivery": esc.get("delivery_proof"),
                "cashfree_order_id": esc.get("cashfree_order_id"),
                "created_at": created_raw,
                "history": esc.get("history", []),
            })

        return ledger_rows

    def calculate_settlements_telemetry(self, buyer_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Computes aggregate metrics from the user's escrows.
        Returns zeros and empty lists if user has no escrows.
        """
        query: Dict[str, Any] = {}
        if buyer_id is not None:
            if not buyer_id:
                return {
                    "total_procurement_volume": 0.0,
                    "completed_contracts_count": 0,
                    "active_escrow_count": 0,
                    "refunded_count": 0,
                    "regional_distribution": [],
                    "audit_intelligence": [],
                    "savings_chart_data": [],
                    "avg_negotiation_savings": 0.0,
                }
            query = {"buyer_id": buyer_id}

        escrows = list(escrows_collection.find(query, {"_id": 0}))
        if not escrows:
            return {
                "total_procurement_volume": 0.0,
                "completed_contracts_count": 0,
                "active_escrow_count": 0,
                "refunded_count": 0,
                "regional_distribution": [],
                "audit_intelligence": [],
                "savings_chart_data": [],
                "avg_negotiation_savings": 0.0,
            }

        total_volume = 0.0
        completed_count = 0
        active_count = 0
        refunded_count = 0

        supplier_lookup = self._get_supplier_lookup()
        country_stats: Dict[str, Dict[str, Any]] = {}

        for esc in escrows:
            raw_status = str(esc.get("status") or esc.get("escrow_status", "CREATED")).upper()
            amt = float(esc.get("amount_inr", esc.get("amount", 0.0)))

            if raw_status in ["FUNDED", "PROOF_UPLOADED", "VERIFIED", "RELEASED"]:
                total_volume += amt

            if raw_status == "RELEASED":
                completed_count += 1
            elif raw_status in ["CREATED", "FUNDED", "PROOF_UPLOADED", "VERIFIED"]:
                active_count += 1
            elif raw_status == "REFUNDED":
                refunded_count += 1

            s_id = str(esc.get("supplier_id", ""))
            country = esc.get("supplier_country") or supplier_lookup.get(s_id, {}).get("country") or "Unknown"

            if country not in country_stats:
                country_stats[country] = {"contracts": 0, "total_inr": 0.0}
            country_stats[country]["contracts"] += 1
            country_stats[country]["total_inr"] += amt

        regional_distribution = [
            {
                "region": country,
                "contracts": d["contracts"],
                "total_inr": round(d["total_inr"], 2),
            }
            for country, d in country_stats.items()
        ]

        return {
            "total_procurement_volume": round(total_volume, 2),
            "completed_contracts_count": completed_count,
            "active_escrow_count": active_count,
            "refunded_count": refunded_count,
            "regional_distribution": regional_distribution,
            "audit_intelligence": [],
            "savings_chart_data": [],
            "avg_negotiation_savings": 0.0,
        }
