"""
Simulated Escrow State Machine Service for ProcureAI.

Manages the procurement escrow lifecycle via a deterministic state machine
persisted in MongoDB, integrated with Cashfree Payment Gateway for sandbox funding.
"""

import time
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

# Valid state machine transitions
VALID_TRANSITIONS: Dict[str, List[str]] = {
    "CREATED": ["FUNDED", "CANCELLED"],
    "FUNDED": ["PROOF_UPLOADED", "REFUNDED", "CANCELLED"],
    "PROOF_UPLOADED": ["VERIFIED", "REFUNDED", "CANCELLED"],
    "VERIFIED": ["RELEASED", "REFUNDED"],
    "RELEASED": [],
    "REFUNDED": [],
    "CANCELLED": [],
}


def _get_escrows_collection():
    """Lazy collection loader to prevent circular imports."""
    from database.db import escrows_collection
    return escrows_collection


def get_escrow(escrow_id: str) -> Optional[Dict[str, Any]]:
    """
    Retrieves an escrow record by escrow_id or legacy transaction_id / app_id.
    """
    col = _get_escrows_collection()
    record = col.find_one({
        "$or": [
            {"escrow_id": escrow_id},
            {"transaction_id": escrow_id},
            {"app_id": escrow_id},
        ]
    }, {"_id": 0})
    return record


def create_escrow(
    buyer_id: str,
    supplier_id: str,
    amount_inr: float,
    promised_delivery_days: int = 7,
) -> Dict[str, Any]:
    """
    Initializes a new escrow agreement in CREATED state.
    Payment and funding must be completed separately via verified gateway.
    """
    if amount_inr <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Escrow amount must be greater than zero.",
        )

    now = datetime.now(timezone.utc).isoformat()
    escrow_id = f"ESC_{int(time.time())}_{uuid.uuid4().hex[:6].upper()}"

    history = [
        {
            "status": "CREATED",
            "timestamp": now,
            "actor": buyer_id,
            "note": f"Procurement commitment initialized for ₹{amount_inr:,.2f}",
        }
    ]

    record: Dict[str, Any] = {
        "escrow_id": escrow_id,
        "transaction_id": escrow_id,  # Maintained for API compatibility
        "supplier_id": str(supplier_id),
        "buyer_id": str(buyer_id),
        "amount_inr": float(amount_inr),
        "amount": float(amount_inr),  # Legacy API compatibility
        "status": "CREATED",
        "escrow_status": "created",  # Legacy API compatibility
        "provider": "cashfree",
        "cashfree_order_id": None,
        "payment_status": "PENDING",
        "paid_at": None,
        "order_attempt_count": 0,
        "promised_delivery_days": int(promised_delivery_days),
        "created_at": now,
        "updated_at": now,
        "timestamp": time.time(),
        "delivery_proof": None,
        "verified": False,
        "history": history,
    }

    col = _get_escrows_collection()
    col.insert_one(record)
    # Remove _id added in-place by pymongo
    record.pop("_id", None)
    return record


def fund_escrow(
    escrow_id: str,
    cashfree_order_id: str,
    paid_amount: float,
    actor: str,
) -> Dict[str, Any]:
    """
    Transitions an escrow record from CREATED to FUNDED upon confirmed Cashfree payment.
    Idempotent: if already FUNDED, returns the current record.
    """
    record = get_escrow(escrow_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escrow '{escrow_id}' not found.",
        )

    current_status = record.get("status", "CREATED").upper()
    if current_status == "FUNDED":
        return record

    if current_status != "CREATED":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot fund escrow in status '{current_status}'. Only 'CREATED' escrows can be funded.",
        )

    now = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "status": "FUNDED",
        "timestamp": now,
        "actor": actor,
        "note": f"Payment received via Cashfree (sandbox). Order ID: {cashfree_order_id}",
    }

    update_fields = {
        "status": "FUNDED",
        "escrow_status": "funded",
        "cashfree_order_id": cashfree_order_id,
        "payment_status": "PAID",
        "paid_at": now,
        "updated_at": now,
    }

    primary_id = record.get("escrow_id") or record.get("transaction_id") or escrow_id
    col = _get_escrows_collection()
    res = col.update_one(
        {
            "$or": [
                {"escrow_id": primary_id},
                {"transaction_id": primary_id},
                {"escrow_id": escrow_id},
                {"transaction_id": escrow_id},
                {"app_id": escrow_id},
            ],
            "status": "CREATED",
        },
        {
            "$set": update_fields,
            "$push": {"history": history_entry},
        },
    )

    if res.matched_count == 0:
        # Check if already transitioned concurrently
        refetched = get_escrow(escrow_id)
        if refetched and refetched.get("status") == "FUNDED":
            return refetched
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Failed to fund escrow '{escrow_id}': status may have changed concurrently.",
        )

    return get_escrow(escrow_id)


def create_and_fund_escrow(
    buyer_id: str,
    supplier_id: str,
    amount_inr: float,
    promised_delivery_days: int = 7,
) -> Dict[str, Any]:
    """
    Creates an escrow and transitions to FUNDED (retained for simulated test scenarios).
    """
    escrow = create_escrow(buyer_id, supplier_id, amount_inr, promised_delivery_days)
    return fund_escrow(
        escrow["escrow_id"],
        cashfree_order_id=f"CF_SIM_{escrow['escrow_id']}",
        paid_amount=amount_inr,
        actor=buyer_id,
    )


def transition_escrow(
    escrow_id: str,
    target_status: str,
    actor: str,
    note: str = "",
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Enforces valid state machine transitions atomically.
    Raises HTTP 409 Conflict if the requested transition is illegal or fails concurrency check.
    """
    record = get_escrow(escrow_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escrow '{escrow_id}' not found.",
        )

    current_status = record.get("status", "CREATED").upper()
    target_status_upper = target_status.upper()

    allowed_next = VALID_TRANSITIONS.get(current_status, [])
    if target_status_upper not in allowed_next:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Invalid escrow state transition from '{current_status}' to '{target_status_upper}'. "
                f"Allowed transitions from '{current_status}': {allowed_next if allowed_next else 'None (Terminal state)'}"
            ),
        )

    now = datetime.now(timezone.utc).isoformat()
    history_entry = {
        "status": target_status_upper,
        "timestamp": now,
        "actor": actor,
        "note": note or f"Escrow transitioned to {target_status_upper}",
    }

    update_fields: Dict[str, Any] = {
        "status": target_status_upper,
        "escrow_status": target_status_upper.lower(),
        "updated_at": now,
        "verified": target_status_upper in ["VERIFIED", "RELEASED"],
    }

    if metadata:
        if "delivery_proof" in metadata:
            update_fields["delivery_proof"] = metadata["delivery_proof"]
        if "settlement_reference" in metadata:
            update_fields["settlement_reference"] = metadata["settlement_reference"]

    primary_id = record.get("escrow_id") or record.get("transaction_id") or escrow_id
    col = _get_escrows_collection()
    res = col.update_one(
        {
            "$or": [
                {"escrow_id": primary_id},
                {"transaction_id": primary_id},
                {"escrow_id": escrow_id},
                {"transaction_id": escrow_id},
                {"app_id": escrow_id},
            ],
            "status": current_status,
        },
        {
            "$set": update_fields,
            "$push": {"history": history_entry},
        },
    )

    if res.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Concurrent modification detected on escrow '{escrow_id}'.",
        )

    return get_escrow(escrow_id)
