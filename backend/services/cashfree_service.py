"""
Cashfree Payment Gateway Integration Service for ProcureAI Escrow Funding.

Provides sandbox and production order creation and verification via Cashfree PG API.
Uses direct HTTP requests (no third-party SDK required).
"""

import os
import logging
from typing import Dict, Any, Optional
import requests
from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

CASHFREE_APP_ID = os.getenv("CASHFREE_APP_ID", "")
CASHFREE_SECRET_KEY = os.getenv("CASHFREE_SECRET_KEY", "")
CASHFREE_ENV = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

CASHFREE_API_VERSION = "2025-01-01"
REQUEST_TIMEOUT = 15  # seconds


def is_cashfree_configured() -> bool:
    """Check if Cashfree API credentials are set."""
    app_id = os.getenv("CASHFREE_APP_ID", "").strip()
    secret_key = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    return bool(app_id and secret_key)


def get_base_url() -> str:
    """Return Cashfree PG API base URL based on environment."""
    env = os.getenv("CASHFREE_ENV", "sandbox").strip().lower()
    if env == "production" or env == "prod":
        return "https://api.cashfree.com/pg"
    return "https://sandbox.cashfree.com/pg"


def _get_headers() -> Dict[str, str]:
    """Build request headers with sanitized credentials."""
    app_id = os.getenv("CASHFREE_APP_ID", "").strip()
    secret_key = os.getenv("CASHFREE_SECRET_KEY", "").strip()
    if not app_id or not secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )
    return {
        "x-client-id": app_id,
        "x-client-secret": secret_key,
        "x-api-version": CASHFREE_API_VERSION,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def create_order(escrow: Dict[str, Any], customer: Dict[str, Any]) -> Dict[str, Any]:
    """
    Creates an order on Cashfree Payment Gateway for an escrow record in CREATED state.
    
    Args:
        escrow: Dict containing escrow_id, amount_inr (or amount)
        customer: Dict containing customer_id, customer_name, customer_email, customer_phone
        
    Returns:
        Dict with order_id, payment_session_id, order_status, order_amount
    """
    if not is_cashfree_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )

    escrow_id = str(escrow.get("escrow_id") or escrow.get("transaction_id") or "")
    if not escrow_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing escrow_id in escrow record",
        )

    # Derive fresh order_id. Cashfree requires unique order_ids.
    attempt = escrow.get("order_attempt_count", 0)
    if attempt == 0 and not escrow.get("cashfree_order_id"):
        order_id = f"CF_{escrow_id}"
    else:
        order_id = f"CF_{escrow_id}_{attempt + 1}"

    # Calculate amount in INR with 2 decimals
    raw_amount = escrow.get("amount_inr", escrow.get("amount", 0.0))
    try:
        order_amount = round(float(raw_amount), 2)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid escrow amount: {raw_amount}",
        )

    if order_amount <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order amount must be greater than zero.",
        )

    # Clean phone (Indian 10-digit)
    phone = str(customer.get("customer_phone", "")).strip()

    frontend_base = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    return_url = f"{frontend_base}/procurement?order_id={{order_id}}"

    payload = {
        "order_id": order_id,
        "order_amount": order_amount,
        "order_currency": "INR",
        "customer_details": {
            "customer_id": str(customer.get("customer_id") or "CUST_DEFAULT"),
            "customer_name": str(customer.get("customer_name") or "ProcureAI Buyer"),
            "customer_email": str(customer.get("customer_email") or "buyer@example.com"),
            "customer_phone": phone,
        },
        "order_meta": {
            "return_url": return_url,
        },
    }

    base_url = get_base_url()
    url = f"{base_url}/orders"
    headers = _get_headers()

    try:
        logger.info(f"[Cashfree] Creating order for escrow {escrow_id} with order_id {order_id} (amount: ₹{order_amount})")
        resp = requests.post(url, json=payload, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        logger.error(f"[Cashfree] Connection failed while creating order for {escrow_id}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment gateway unreachable. Please retry shortly.",
        )

    if resp.status_code not in [200, 201]:
        logger.error(f"[Cashfree] Order creation error: HTTP {resp.status_code} - {resp.text}")
        error_msg = "Failed to create payment session"
        try:
            err_json = resp.json()
            error_msg = err_json.get("message", error_msg)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST if resp.status_code < 500 else status.HTTP_502_BAD_GATEWAY,
            detail=f"Cashfree error: {error_msg}",
        )

    data = resp.json()
    return {
        "order_id": data.get("order_id", order_id),
        "payment_session_id": data.get("payment_session_id"),
        "order_status": data.get("order_status"),
        "order_amount": data.get("order_amount", order_amount),
        "order_currency": data.get("order_currency", "INR"),
    }


def get_order(order_id: str) -> Dict[str, Any]:
    """
    Fetches the latest order status and details from Cashfree.
    
    Args:
        order_id: Cashfree order identifier
        
    Returns:
        Dict representing Cashfree order details
    """
    if not is_cashfree_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )

    base_url = get_base_url()
    url = f"{base_url}/orders/{order_id}"
    headers = _get_headers()

    try:
        logger.info(f"[Cashfree] Fetching order status for {order_id}")
        resp = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
    except requests.RequestException as e:
        logger.error(f"[Cashfree] Connection failed while fetching order {order_id}: {type(e).__name__}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Payment gateway unreachable. Please retry shortly.",
        )

    if resp.status_code == 404:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Cashfree order '{order_id}' not found.",
        )

    if resp.status_code != 200:
        logger.error(f"[Cashfree] Get order error: HTTP {resp.status_code} - {resp.text}")
        error_msg = "Failed to fetch payment status"
        try:
            err_json = resp.json()
            error_msg = err_json.get("message", error_msg)
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Cashfree error: {error_msg}",
        )

    return resp.json()
