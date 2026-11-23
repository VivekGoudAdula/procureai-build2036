"""
Procurement Analytics Engine

Computes user-scoped procurement KPIs, regional distribution, monthly trends,
deal outcomes, and rule-based insights directly from the authenticated user's escrows.
All synthetic scaling, simulated trends, and canned strings are removed.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime
from database.db import escrows_collection, suppliers_collection


class ProcurementAnalyticsEngine:
    """
    Computes genuine analytics metrics scoped strictly to a single buyer_id.
    """

    def _get_supplier_lookup(self) -> Dict[str, Dict[str, Any]]:
        """Builds lookup for supplier country and category."""
        try:
            suppliers = list(suppliers_collection.find({}, {"_id": 0}))
            lookup: Dict[str, Dict[str, Any]] = {}
            for s in suppliers:
                s_id = str(s.get("id"))
                lookup[s_id] = {
                    "country": s.get("country") or s.get("region") or "Unknown",
                    "category": s.get("category") or "",
                    "name": s.get("name") or "Supplier",
                }
            return lookup
        except Exception:
            return {}

    def calculate_procurement_intelligence(self, buyer_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Calculates analytics strictly from records.
        Returns clean empty structures if buyer has no escrows.
        """
        query: Dict[str, Any] = {}
        if buyer_id is not None:
            if not buyer_id:
                return self._empty_analytics()
            query = {"buyer_id": buyer_id}

        escrows = list(escrows_collection.find(query, {"_id": 0}))
        if not escrows:
            return self._empty_analytics()

        supplier_lookup = self._get_supplier_lookup()

        # 1. KPIs
        total_procurement_volume_inr = 0.0
        deals_count = len(escrows)
        non_created_deals = 0
        completed_count = 0
        refund_count = 0
        in_progress_count = 0
        awaiting_payment_count = 0
        total_lead_time_days = 0

        # For savings calculation
        total_listed_amount = 0.0
        total_paid_amount = 0.0
        has_savings_data = False

        # Unique suppliers
        unique_supplier_ids = set()

        # Monthly aggregation
        monthly_map: Dict[str, Dict[str, Any]] = {}

        # Regional aggregation
        regional_map: Dict[str, Dict[str, Any]] = {}

        # Category aggregation (only if stored)
        category_map: Dict[str, Dict[str, Any]] = {}
        has_real_categories = False

        for esc in escrows:
            raw_status = str(esc.get("status") or esc.get("escrow_status", "CREATED")).upper()
            amt = float(esc.get("amount_inr", esc.get("amount", 0.0)))
            lead_time = int(esc.get("promised_delivery_days", 0))
            total_lead_time_days += lead_time

            s_id = str(esc.get("supplier_id", ""))
            if s_id:
                unique_supplier_ids.add(s_id)

            sup_info = supplier_lookup.get(s_id, {})
            country = esc.get("supplier_country") or sup_info.get("country") or "Unknown"
            cat = esc.get("product_category") or sup_info.get("category") or ""
            if cat and cat.lower() not in ["general", "components", ""]:
                has_real_categories = True

            # Status classification
            if raw_status in ["FUNDED", "PROOF_UPLOADED", "VERIFIED", "RELEASED", "LOCKED"]:
                total_procurement_volume_inr += amt

            if raw_status != "CREATED":
                non_created_deals += 1

            if raw_status == "RELEASED":
                completed_count += 1
            elif raw_status in ["FUNDED", "PROOF_UPLOADED", "VERIFIED", "LOCKED"]:
                in_progress_count += 1
            elif raw_status == "REFUNDED":
                refund_count += 1
            elif raw_status == "CREATED":
                awaiting_payment_count += 1

            # Savings check: only if escrows store both listed_unit_price_inr and negotiated_unit_price
            listed_price = esc.get("listed_unit_price_inr") or esc.get("listed_price")
            paid_price = esc.get("negotiated_unit_price") or esc.get("negotiated_price")
            if listed_price and paid_price:
                try:
                    l_val = float(listed_price)
                    p_val = float(paid_price)
                    if l_val > 0 and p_val > 0:
                        total_listed_amount += l_val
                        total_paid_amount += p_val
                        has_savings_data = True
                except (ValueError, TypeError):
                    pass

            # Monthly bucket
            created_raw = esc.get("created_at") or esc.get("timestamp") or ""
            month_key = "Recent"
            if len(str(created_raw)) >= 7:
                try:
                    dt = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
                    month_key = dt.strftime("%b %Y")
                except Exception:
                    month_key = str(created_raw)[:7]

            if month_key not in monthly_map:
                monthly_map[month_key] = {"month": month_key, "volume_inr": 0.0, "deals": 0}
            monthly_map[month_key]["volume_inr"] += amt
            monthly_map[month_key]["deals"] += 1

            # Regional bucket
            if country not in regional_map:
                regional_map[country] = {"deals": 0, "total_inr": 0.0, "lead_days": 0}
            regional_map[country]["deals"] += 1
            regional_map[country]["total_inr"] += amt
            regional_map[country]["lead_days"] += lead_time

            # Category bucket
            if cat:
                if cat not in category_map:
                    category_map[cat] = {"deals": 0, "total_inr": 0.0}
                category_map[cat]["deals"] += 1
                category_map[cat]["total_inr"] += amt

        # Completed rate: RELEASED / non-CREATED
        completed_rate = (
            round((completed_count / non_created_deals) * 100, 1)
            if non_created_deals > 0
            else 0.0
        )

        avg_lead_time = (
            round(total_lead_time_days / deals_count, 1)
            if deals_count > 0
            else 0.0
        )

        # Savings percentage vs listed price
        savings_pct_str: Optional[str] = None
        if has_savings_data and total_listed_amount > 0:
            pct = ((total_listed_amount - total_paid_amount) / total_listed_amount) * 100
            savings_pct_str = f"{pct:.1f}% vs listed price"

        # Monthly trends
        global_trends = [
            {
                "month": v["month"],
                "sourcing_volume": round(v["volume_inr"], 2),
                "deals_count": v["deals"],
            }
            for v in monthly_map.values()
        ]

        # Regional table (no trust rating column, real values only)
        regional_sourcing_intelligence = [
            {
                "region": country,
                "deals": data["deals"],
                "total_inr": round(data["total_inr"], 2),
                "avg_lead_time": f"{round(data['lead_days'] / data['deals'], 1)} days" if data["deals"] else "N/A",
            }
            for country, data in regional_map.items()
        ]

        # Category table (only if real product categories exist)
        category_intelligence = []
        if has_real_categories:
            category_intelligence = [
                {
                    "category": cat,
                    "deals_count": d["deals"],
                    "total_inr": round(d["total_inr"], 2),
                }
                for cat, d in category_map.items()
            ]

        # Deal outcomes
        deal_outcomes = {
            "completed": completed_count,
            "in_progress": in_progress_count,
            "awaiting_payment": awaiting_payment_count,
            "refunded": refund_count,
            "total_deals": deals_count,
        }

        # Rule-based insights (at most 3)
        rule_insights = []
        if total_procurement_volume_inr > 0 and non_created_deals > 0:
            avg_deal = total_procurement_volume_inr / non_created_deals
            rule_insights.append(f"Your average deal is ₹{avg_deal:,.2f}.")
        if in_progress_count > 0:
            rule_insights.append(f"{in_progress_count} deal(s) are currently in progress awaiting delivery/verification.")
        if regional_map:
            top_country, top_data = max(regional_map.items(), key=lambda x: x[1]["deals"])
            rule_insights.append(f"Most of your orders are from {top_country} ({top_data['deals']} order{'s' if top_data['deals'] > 1 else ''}).")

        return {
            "kpis": {
                "total_procurement_volume_inr": round(total_procurement_volume_inr, 2),
                "deals_count": deals_count,
                "completed_rate": completed_rate,
                "refund_count": refund_count,
                "avg_lead_time_days": avg_lead_time,
                "savings": savings_pct_str,
                "suppliers_used": len(unique_supplier_ids),
            },
            "global_trends": global_trends,
            "regional_sourcing_intelligence": regional_sourcing_intelligence,
            "procurement_category_intelligence": category_intelligence,
            "deal_outcomes": deal_outcomes,
            "ai_procurement_insights": rule_insights[:3],
        }

    def _empty_analytics(self) -> Dict[str, Any]:
        """Returns clean empty structure for users with zero transactions."""
        return {
            "kpis": {
                "total_procurement_volume_inr": 0.0,
                "deals_count": 0,
                "completed_rate": 0.0,
                "refund_count": 0,
                "avg_lead_time_days": 0.0,
                "savings": None,
                "suppliers_used": 0,
            },
            "global_trends": [],
            "regional_sourcing_intelligence": [],
            "procurement_category_intelligence": [],
            "deal_outcomes": {
                "completed": 0,
                "in_progress": 0,
                "awaiting_payment": 0,
                "refunded": 0,
                "total_deals": 0,
            },
            "ai_procurement_insights": [],
        }
