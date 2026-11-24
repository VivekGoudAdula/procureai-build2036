"""
Procurement Insights Service

Generates rule-based insights and real activity feed events derived strictly
from the authenticated user's escrows and RFQs.
All canned demo signals, synthetic scorecard formulas, and mock feed events are removed.
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from database.db import escrows_collection, rfqs_collection, suppliers_collection


class ProcurementInsightsService:
    """
    Computes rule-based procurement insights and activity feeds scoped by buyer_id.
    """

    def _get_supplier_name(self, supplier_id: str) -> str:
        """Looks up supplier name from MongoDB."""
        try:
            sup = suppliers_collection.find_one({"id": supplier_id}, {"_id": 0, "name": 1})
            if sup and sup.get("name"):
                return sup["name"]
            if str(supplier_id).isdigit():
                sup = suppliers_collection.find_one({"id": int(supplier_id)}, {"_id": 0, "name": 1})
                if sup and sup.get("name"):
                    return sup["name"]
        except Exception:
            pass
        return "Supplier"

    def generate_insights(self, buyer_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Generates at most 3 rule-based insights and chronological recent activity
        based exclusively on real transactions and RFQs.
        """
        query: Dict[str, Any] = {}
        if buyer_id is not None:
            if not buyer_id:
                return {
                    "insights": [],
                    "procurement_feed": [],
                    "signals": {},
                    "scorecard": {"score": 0, "max_score": 100, "metrics": []},
                }
            query = {
                "$or": [
                    {"buyer_id": buyer_id},
                    {"user_id": buyer_id},
                    {"buyer_email": buyer_id},
                    {"user_email": buyer_id},
                ]
            }

        escrows = list(escrows_collection.find(query, {"_id": 0}))
        rfqs = list(rfqs_collection.find(query, {"_id": 0}))

        # If no escrows and no RFQs, return clean empty structures
        if not escrows and not rfqs:
            return {
                "insights": [],
                "procurement_feed": [],
                "signals": {},
                "scorecard": {"score": 0, "max_score": 100, "metrics": []},
            }

        # --- Rule-Based Insights (At most 3) ---
        insights: List[str] = []

        # Rule 1: Average Deal Size
        funded_or_completed = [
            e for e in escrows
            if str(e.get("status") or e.get("escrow_status", "")).upper() in ["FUNDED", "PROOF_UPLOADED", "VERIFIED", "RELEASED", "LOCKED"]
        ]
        if funded_or_completed:
            total_val = sum(float(e.get("amount_inr", e.get("amount", 0.0))) for e in funded_or_completed)
            avg_val = total_val / len(funded_or_completed)
            insights.append(
                f"Your average deal is ₹{avg_val:,.2f} across {len(funded_or_completed)} secured commitment(s)."
            )

        # Rule 2: Deals waiting for actions
        awaiting_proof = [
            e for e in escrows
            if str(e.get("status") or e.get("escrow_status", "")).upper() in ["FUNDED", "LOCKED"]
        ]
        awaiting_payment = [
            e for e in escrows
            if str(e.get("status") or e.get("escrow_status", "")).upper() == "CREATED"
        ]
        if awaiting_proof:
            insights.append(
                f"{len(awaiting_proof)} deal(s) are awaiting supplier proof of delivery upload."
            )
        elif awaiting_payment:
            insights.append(
                f"{len(awaiting_payment)} deal(s) are initialized and awaiting escrow payment."
            )

        # Rule 3: Geographic Distribution
        country_counts: Dict[str, int] = {}
        for e in escrows:
            country = e.get("supplier_country") or "Global"
            country_counts[country] = country_counts.get(country, 0) + 1
        if country_counts:
            top_country, top_count = max(country_counts.items(), key=lambda x: x[1])
            insights.append(
                f"Most of your orders are with suppliers in {top_country} ({top_count} deal{'s' if top_count > 1 else ''})."
            )

        insights = insights[:3]

        # --- Chronological Activity Feed (Max 15) ---
        feed_items: List[Dict[str, Any]] = []

        for esc in escrows:
            escrow_id = esc.get("escrow_id") or esc.get("transaction_id") or "ESC"
            s_id = str(esc.get("supplier_id", ""))
            s_name = esc.get("supplier_name") or self._get_supplier_name(s_id)
            history = esc.get("history") or []

            for h in history:
                h_status = str(h.get("status", "")).upper()
                h_time = h.get("timestamp") or esc.get("created_at") or ""
                note = h.get("note") or ""

                if h_status == "CREATED":
                    title = f"Escrow commitment created - {s_name}"
                    event_type = "Escrow Created"
                elif h_status == "FUNDED":
                    title = f"Escrow funded via Cashfree (sandbox) - {s_name}"
                    event_type = "Escrow Funded"
                elif h_status == "PROOF_UPLOADED":
                    title = f"Delivery proof uploaded - {s_name}"
                    event_type = "Proof Submitted"
                elif h_status == "VERIFIED":
                    title = f"Delivery verified - {s_name}"
                    event_type = "Verified"
                elif h_status == "RELEASED":
                    title = f"Settlement released - {s_name}"
                    event_type = "Settlement"
                elif h_status == "REFUNDED":
                    title = f"Escrow refunded - {s_name}"
                    event_type = "Refunded"
                else:
                    title = f"Status updated to {h_status} - {s_name}"
                    event_type = "Update"

                feed_items.append({
                    "id": f"{escrow_id}_{h_status}_{len(feed_items)}",
                    "title": title,
                    "event": note or title,
                    "event_type": event_type,
                    "supplier": s_name,
                    "timestamp": h_time,
                })

        for rfq in rfqs:
            rfq_id = rfq.get("rfq_id") or "RFQ"
            s_name = rfq.get("supplier_name") or "Supplier"
            product = rfq.get("product") or "Procurement Package"
            status = rfq.get("status") or "sent"
            time_val = rfq.get("sent_at") or rfq.get("created_at") or ""

            feed_items.append({
                "id": f"rfq_{rfq_id}",
                "title": f"RFQ sent (dry run) - {product}",
                "event": f"RFQ document generated for {s_name} ({product})",
                "event_type": "RFQ Transmission",
                "supplier": s_name,
                "timestamp": str(time_val),
            })

        def _parse_time(item: Dict[str, Any]) -> str:
            return str(item.get("timestamp") or "")

        feed_items.sort(key=_parse_time, reverse=True)
        feed_items = feed_items[:15]

        return {
            "insights": insights,
            "procurement_feed": feed_items,
            "signals": {},
            "scorecard": {"score": 0, "max_score": 100, "metrics": []},
        }
