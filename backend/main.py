from fastapi import FastAPI, HTTPException, File, UploadFile, Form, Depends, Request, status, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import Optional, Any, Union, List, Dict
import os
import re
import hashlib
from datetime import datetime, timedelta, timezone
import time
import random
import bcrypt
import jwt
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv, find_dotenv

# Load .env file
load_dotenv(find_dotenv())
from ai.ai_agent import select_best_supplier, run_agent_competition
from services.escrow_service import (
    create_escrow as create_escrow_record,
    fund_escrow,
    create_and_fund_escrow,
    get_escrow,
    transition_escrow,
)
from services import cashfree_service
from services.alibaba_procurement_service import AlibabaProcurementService
from services.multilingual_negotiation_service import MultilingualNegotiationService
from services.procurement_message_engine import ProcurementMessageEngine
from services.translation_service import TranslationService
from services.email_service import EmailService
from services.negotiation_intelligence import NegotiationIntelligenceEngine
from services.dashboard_analytics import DashboardAnalyticsService
from services.procurement_insights import ProcurementInsightsService
from services.settlement_analytics import SettlementAnalyticsService
from services.procurement_analytics_engine import ProcurementAnalyticsEngine

# Rate Limiting setup using slowapi
is_testing = os.getenv("TESTING", "False").lower() == "true"
limiter = Limiter(key_func=get_remote_address, enabled=not is_testing)

app = FastAPI(title="ProcureAI Backend - Autonomous Agentic Commerce Platform")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Services initialization
procurement_engine = AlibabaProcurementService()
negotiation_engine = MultilingualNegotiationService()
message_engine = ProcurementMessageEngine()
translation_service = TranslationService()
email_service = EmailService()
negotiation_intelligence = NegotiationIntelligenceEngine()
dashboard_analytics = DashboardAnalyticsService()
procurement_insights = ProcurementInsightsService()
settlement_analytics = SettlementAnalyticsService()
procurement_analytics_engine = ProcurementAnalyticsEngine()

# CORS setup for frontend connection
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
allowed_origins = [origin.strip().rstrip("/") for origin in allowed_origins_env.split(",") if origin.strip()]
if not allowed_origins:
    # Safe fallbacks for local development
    allowed_origins = ["http://localhost:3000", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for delivery proofs
UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
if not os.path.exists(UPLOAD_DIR):
    os.makedirs(UPLOAD_DIR)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

# JWT Configuration
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise RuntimeError(
        "JWT_SECRET_KEY environment variable is missing. Set JWT_SECRET_KEY in your environment before starting the application."
    )
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Generates a secure JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    return encoded_jwt

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    """FastAPI security dependency to validate JWT access tokens."""
    token = credentials.credentials
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return email
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

from database.db import (
    users_collection,
    suppliers_collection,
    escrows_collection,
    get_cached_suppliers,
    persist_suppliers_from_intelligence,
    supplier_ratings_collection,
    chat_messages_collection,
    audit_logs_collection,
    rfqs_collection,
)
from services.audit_service import log_event, get_audit_logs, get_audit_stats

def load_db():
    users = list(users_collection.find({}, {"_id": 0}))
    suppliers = get_cached_suppliers()
    return {"users": users, "suppliers": suppliers}

def save_db(data):
    if "users" in data:
        users_collection.delete_many({})
        if data["users"]:
            users_collection.insert_many(data["users"])
    # Local supplier DB removed; reputation updates will be kept in-memory or computed dynamically.

# Models
class User(BaseModel):
    email: str
    password: str

class ProcurementPolicy(BaseModel):
    max_budget: float | None = None
    min_reliability: float | None = None
    max_delivery_days: int | None = None
    min_success_rate: float | None = None
    require_on_chain_verified: bool = False

class SupplierRequest(BaseModel):
    productName: str
    quantity: int
    budget: float
    policy: ProcurementPolicy | None = None

class ProcurementIntelligenceRequest(BaseModel):
    product_name: str
    quantity: int
    budget: float
    lead_time_days: int | None = None
    shipping_region: str | None = None
    quality_level: str | None = None
    procurement_policy: dict | None = None

class EscrowRequest(BaseModel):
    amount_inr: float = 0.0
    supplier_id: Any
    promised_delivery_days: int = 7
    amount: float | None = None

class ConfirmDeliveryRequest(BaseModel):
    transaction_id: str

class SupplierNegotiationRequest(BaseModel):
    product: str
    quantity: int
    budget: float
    round: int

class VerifyDeliveryRequest(BaseModel):
    escrow_id: str

class SupplierRatingRequest(BaseModel):
    transaction_id: str
    supplier_id: str
    buyer_id: str
    rating: int
    review: str



class HumanSelectSupplierRequest(BaseModel):
    supplier_id: str | int
    session_id: str

class MultilingualNegotiationRequest(BaseModel):
    """Single-round multilingual negotiation request."""
    buyer_message: str
    supplier_language: str
    product: str
    round_number: int | None = None

class FullNegotiationRequest(BaseModel):
    """Full 3-round multilingual negotiation request."""
    buyer_message: str
    supplier_language: str
    product: str

class NegotiationIntelligenceRequest(BaseModel):
    """Negotiation Intelligence extraction request."""
    supplier_message: str
    supplier_metadata: Optional[dict] = None
    procurement_context: Optional[dict] = None



class ProcurementInquiryRequest(BaseModel):
    product: str
    quantity: Any
    budget: Any
    lead_time: Any
    requirements: Any
    destination_country: Optional[str] = "Global"
    shipping_preference: Optional[str] = "EXW / FOB"

class SendInquiryRequest(BaseModel):
    supplier_name: str
    supplier_email: str
    supplier_region: str
    original_message: str
    translated_message: Optional[str] = None
    procurement_context: Optional[dict] = None

class SendInquiryResponse(BaseModel):
    status: str
    message: str
    email_status: dict
    translation_details: dict
    supplier_reply_simulation: Optional[dict] = None

class ProcurementInquiryResponse(BaseModel):
    message: str
    metadata: dict
    logs: list[str]

class ChatMessageRequest(BaseModel):
    buyer_id: str
    supplier_id: str
    original_message: str
    source_language: str = "en"
    target_language: str = "zh"

class ChatMessageResponse(BaseModel):
    message_id: str
    status: str
    message: str

def update_supplier_reputation(supplier_id: Any, delivered_on_time: bool):
    db = load_db()
    suppliers = db.get("suppliers", [])
    supplier = next((s for s in suppliers if str(s["id"]) == str(supplier_id)), None)
    
    if not supplier:
        return
    
    supplier["total_deals"] = supplier.get("total_deals", 0) + 1
    supplier["successful_deals"] = supplier.get("successful_deals", 0) + 1
    
    if delivered_on_time:
        supplier["on_time_deliveries"] = supplier.get("on_time_deliveries", 0) + 1
    else:
        supplier["late_deliveries"] = supplier.get("late_deliveries", 0) + 1
        
    # Recalculate metrics
    total = supplier["total_deals"]
    success_rate = (supplier["successful_deals"] / total) * 100
    on_time_rate = (supplier["on_time_deliveries"] / total) * 100
    
    reliability_score = (success_rate * 0.6) + (on_time_rate * 0.4)
    reliability_score = max(0, min(100, reliability_score))
    
    rating = round((reliability_score / 100) * 5, 1)
    
    supplier["reliability_score"] = int(reliability_score)
    supplier["success_rate"] = int(success_rate)
    supplier["rating"] = rating
    supplier["last_updated"] = datetime.now().isoformat()
    
    save_db(db)
    print(f"Updated reputation for supplier {supplier_id}")

# --- Endpoints ---

@app.get("/api/procurement/analytics")
async def get_procurement_analytics(current_user: str = Depends(get_current_user)):
    try:
        return procurement_analytics_engine.calculate_procurement_intelligence()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/analytics")
async def get_dashboard_analytics(current_user: str = Depends(get_current_user)):
    try:
        return dashboard_analytics.calculate_analytics()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/insights")
async def get_dashboard_insights(current_user: str = Depends(get_current_user)):
    try:
        res = procurement_insights.generate_insights()
        return {
            "insights": res["insights"],
            "signals": res["signals"],
            "scorecard": res["scorecard"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/procurement-feed")
async def get_dashboard_feed(current_user: str = Depends(get_current_user)):
    try:
        res = procurement_insights.generate_insights()
        return res["procurement_feed"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/dashboard/regions")
async def get_dashboard_regions(current_user: str = Depends(get_current_user)):
    try:
        res = dashboard_analytics.calculate_analytics()
        return res["regions_detail"]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settlements/analytics")
async def get_settlements_analytics(current_user: str = Depends(get_current_user)):
    try:
        return settlement_analytics.calculate_settlements_telemetry()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/settlements/ledger")
async def get_settlements_ledger(current_user: str = Depends(get_current_user)):
    try:
        return settlement_analytics.compile_settlement_ledger()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/api/procurement/intelligence")
async def get_procurement_intelligence(req: ProcurementIntelligenceRequest, current_user: str = Depends(get_current_user)):
    """
    Generate AI-powered supplier intelligence.
    
    ProcureAI maintains complete procurement auditability.
    Every AI intelligence generation event is logged for transparency and AI decision tracking.
    """
    try:
        result = procurement_engine.run_intelligence(req.dict())
        persist_suppliers_from_intelligence(result, req.product_name)
        
        # Log AI intelligence generation event for audit trail
        log_event(
            user_id=current_user,
            user_email=current_user,
            action="SUPPLIER_INTELLIGENCE_GENERATED",
            module="AI",
            entity_type="product",
            entity_id=req.product_name,
            details={
                "product_name": req.product_name,
                "quantity": req.quantity,
                "budget": req.budget,
                "suppliers_found": len(result.get("suppliers", []))
            }
        )
        
        return result
    except Exception as e:
        print(f"[ProcureAI] Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/login")
@limiter.limit("5/minute")
async def login(request: Request, user: User):
    """
    Authenticate user and return JWT token.
    
    ProcureAI maintains complete procurement auditability.
    Every login event is logged for security and compliance monitoring.
    """
    users = list(users_collection.find({}, {"_id": 0}))
    
    # Locate the user and verify their password
    found_user = next((u for u in users if u["email"] == user.email), None)
    if not found_user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    pw_hash = found_user.get("password", "")
    valid_password = False
    
    try:
        valid_password = bcrypt.checkpw(user.password.encode("utf-8"), pw_hash.encode("utf-8"))
    except Exception:
        valid_password = False
        
    if valid_password:
        # Get user role (default to 'buyer' if not set)
        user_role = found_user.get("role", "buyer")
        
        access_token = create_access_token(data={"sub": user.email})
        
        # Log login event for audit trail
        client_host = request.client.host if request.client else "unknown"
        log_event(
            user_id=user.email,
            user_email=user.email,
            action="LOGIN",
            module="Authentication",
            entity_type="user",
            entity_id=user.email,
            details={"role": user_role},
            ip_address=client_host
        )
        
        return {
            "message": "Login successful",
            "email": user.email,
            "role": user_role,
            "access_token": access_token,
            "token_type": "bearer"
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/api/agent-competition")
@limiter.limit("30/minute")
def agent_competition_api(request: Request, req: SupplierRequest, current_user: str = Depends(get_current_user)):
    policy_dict = req.policy.dict() if req.policy else None
    result = run_agent_competition(req.productName, req.quantity, req.budget, policy_dict)
    return result

@app.post("/api/select-supplier")
@limiter.limit("30/minute")
async def select_supplier_api(request: Request, req: SupplierRequest, current_user: str = Depends(get_current_user)):
    """
    Select best supplier using AI agent competition.
    
    ProcureAI maintains complete procurement auditability.
    Every supplier selection event is logged for transparency and accountability.
    """
    try:
        policy_dict = req.policy.dict() if req.policy else None
        result = select_best_supplier(req.productName, req.quantity, req.budget, policy_dict)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        print(f"Error in select_supplier_api: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
    
    if result.get("status") == "no_supplier_found":
        return result
    
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    
    # Map backend fields to frontend expectations robustly (supports both snake_case and camelCase)
    winner = result.get("winner") or result.get("selected_supplier") or result.get("selectedSupplier") or {}
    winner_id = winner.get("id")
    winner_name = winner.get("name")
    
    winner_unit_price = winner.get("unit_price") or winner.get("price") or winner.get("base_price", 0)
    winner_final_price = result.get("final_price") or winner.get("finalPrice") or round(winner_unit_price * req.quantity, 2)
    winner_reason = result.get("reasoning") or winner.get("reason") or winner.get("reasoning") or ""
    
    raw_suppliers = result.get("suppliers") or result.get("supplier_list") or result.get("scored_results") or []
    mapped_suppliers = []
    for s in raw_suppliers:
        mapped_suppliers.append({
            "id": s.get("id"),
            "name": s.get("name"),
            "price": s.get("price") or s.get("negotiated_price") or s.get("base_price", 0),
            "rating": s.get("rating") or round((s.get("reliability_score", 85) / 20), 1),
            "deliveryTime": f"{s.get('delivery_days') or s.get('delivery', 5)} days",
            "reliability": s.get("reliability_score") or s.get("reliability", 90),
            "success_rate": s.get("success_rate", 90),
            "score": s.get("score", 0)
        })
    
    # Log supplier selection event for audit trail
    if winner_id:
        log_event(
            user_id=current_user,
            user_email=current_user,
            action="SUPPLIER_SELECTED",
            module="Procurement",
            entity_type="supplier",
            entity_id=str(winner_id),
            details={
                "supplier_name": winner_name,
                "product": req.productName,
                "quantity": req.quantity,
                "final_price": winner_final_price,
                "reasoning": winner_reason
            }
        )
        
    return {
        "deal": result.get("deal"),
        "rounds": result.get("rounds"),
        "finalDecision": winner,
        "suppliers": mapped_suppliers,
        "negotiationLogs": result.get("negotiationLogs") or result.get("negotiation_logs") or [],
        "selectedSupplier": {
            "id": winner_id,
            "name": winner_name,
            "finalPrice": winner_final_price,
            "reasoning": winner_reason,
            "unit_price": winner_unit_price,
            "reliability": winner.get("reliability_score") or winner.get("reliability", 90),
            "deliveryTime": f"{(winner.get('delivery_days') or winner.get('delivery', 5))} days"
        },
        "policy_applied": result.get("policy_applied", False),
        "filtered_out_count": result.get("filtered_out_count", 0),
        "rejection_reasons": result.get("rejection_reasons", [])
    }

@app.post("/api/procurement/select-supplier")
@limiter.limit("30/minute")
async def human_select_supplier(request: Request, req: HumanSelectSupplierRequest, current_user: str = Depends(get_current_user)):
    print(f"[PROCURE-AI] Human procurement approval received.")
    print(f"[PROCURE-AI] Supplier partnership authorized.")
    print(f"[PROCURE-AI] Negotiation lifecycle finalized.")
    print(f"[PROCURE-AI] Preparing procurement commitment...")
    
    return {
        "status": "APPROVED",
        "selected_supplier": {"id": req.supplier_id},
        "procurement_commitment_ready": True
    }

@app.post("/api/procurement/initiate-commitment")
@limiter.limit("20/minute")
async def create_escrow(request: Request, req: EscrowRequest, current_user: str = Depends(get_current_user)):
    """
    Create simulated escrow for procurement transaction in CREATED state.
    Funding is completed separately via Cashfree sandbox payment.
    """
    amount = req.amount_inr if req.amount_inr else (req.amount or 0.0)
    escrow_record = create_escrow_record(
        buyer_id=current_user,
        supplier_id=req.supplier_id,
        amount_inr=amount,
        promised_delivery_days=req.promised_delivery_days,
    )
    
    log_event(
        user_id=current_user,
        user_email=current_user,
        action="ESCROW_CREATED",
        module="Escrow",
        entity_type="escrow",
        entity_id=escrow_record["escrow_id"],
        details={
            "escrow_id": escrow_record["escrow_id"],
            "amount_inr": amount,
            "supplier_id": str(req.supplier_id),
            "promised_delivery_days": req.promised_delivery_days,
        }
    )
    return escrow_record


# ---------------------------------------------------------
# Cashfree Payment Gateway Endpoints (Sandbox Escrow Funding)
# ---------------------------------------------------------

class CashfreeCreateOrderRequest(BaseModel):
    escrow_id: str
    customer_phone: str


class CashfreeVerifyRequest(BaseModel):
    escrow_id: str


@app.post("/api/payments/cashfree/create-order")
@limiter.limit("30/minute")
async def cashfree_create_order(
    request: Request,
    req: CashfreeCreateOrderRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Creates a Cashfree payment session for an escrow record in CREATED state.
    Only the owner of the escrow can create a payment order.
    """
    if not cashfree_service.is_cashfree_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )

    escrow = get_escrow(req.escrow_id)
    if not escrow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escrow '{req.escrow_id}' not found.",
        )

    if escrow.get("buyer_id") != current_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not the owner of this escrow.",
        )

    if escrow.get("status") != "CREATED":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot create payment order for escrow in state '{escrow.get('status')}'. Only 'CREATED' escrows can be funded.",
        )

    # Validate phone: 10 Indian digits
    raw_phone = req.customer_phone.strip()
    digits_only = re.sub(r"\D", "", raw_phone)
    if len(digits_only) == 12 and digits_only.startswith("91"):
        digits_only = digits_only[2:]
    if len(digits_only) != 10 or digits_only[0] not in "6789":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Invalid Indian phone number. Please enter a valid 10-digit number starting with 6, 7, 8, or 9.",
        )

    buyer_doc = users_collection.find_one({"email": current_user})
    buyer_name = (buyer_doc.get("name") if buyer_doc and buyer_doc.get("name") else current_user)

    customer = {
        "customer_id": current_user.replace("@", "_").replace(".", "_"),
        "customer_name": buyer_name,
        "customer_email": current_user,
        "customer_phone": digits_only,
    }

    cf_order = cashfree_service.create_order(escrow, customer)
    order_id = cf_order["order_id"]

    escrows_collection.update_one(
        {"escrow_id": escrow["escrow_id"]},
        {
            "$set": {
                "cashfree_order_id": order_id,
                "payment_status": "PAYMENT_INITIATED",
                "customer_phone": digits_only,
            },
            "$inc": {"order_attempt_count": 1},
        },
    )

    log_event(
        user_id=current_user,
        user_email=current_user,
        action="CASHFREE_ORDER_CREATED",
        module="Payments",
        entity_type="escrow",
        entity_id=escrow["escrow_id"],
        details={
            "escrow_id": escrow["escrow_id"],
            "cashfree_order_id": order_id,
            "amount_inr": escrow.get("amount_inr", escrow.get("amount")),
        },
    )

    return {
        "payment_session_id": cf_order.get("payment_session_id"),
        "cashfree_order_id": order_id,
        "amount_inr": escrow.get("amount_inr", escrow.get("amount")),
    }


@app.post("/api/payments/cashfree/verify")
@limiter.limit("30/minute")
async def cashfree_verify_order(
    request: Request,
    req: CashfreeVerifyRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Verifies Cashfree order status. If PAID and matching amount, transitions escrow to FUNDED.
    Idempotent: returns current record if already FUNDED.
    """
    if not cashfree_service.is_cashfree_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payments not configured",
        )

    escrow = get_escrow(req.escrow_id)
    if not escrow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Escrow '{req.escrow_id}' not found.",
        )

    if escrow.get("buyer_id") != current_user:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: You are not the owner of this escrow.",
        )

    # Idempotent check: if already funded or further along
    if escrow.get("status") in ["FUNDED", "PROOF_UPLOADED", "VERIFIED", "RELEASED"]:
        return {
            "status": escrow.get("status"),
            "funded": True,
            "escrow": escrow,
            "message": "Escrow already funded.",
        }

    cashfree_order_id = escrow.get("cashfree_order_id")
    if not cashfree_order_id:
        return {
            "status": escrow.get("status", "CREATED"),
            "funded": False,
            "detail": "No Cashfree order initiated for this escrow.",
        }

    cf_order = cashfree_service.get_order(cashfree_order_id)
    order_status = cf_order.get("order_status")
    order_amount = float(cf_order.get("order_amount", 0.0))
    order_id = cf_order.get("order_id")

    expected_amount = float(escrow.get("amount_inr", escrow.get("amount", 0.0)))

    # Strict match: PAID + matching amount + matching order_id
    if (
        order_status == "PAID"
        and abs(order_amount - expected_amount) < 0.01
        and order_id == cashfree_order_id
    ):
        updated_escrow = fund_escrow(
            escrow_id=escrow["escrow_id"],
            cashfree_order_id=cashfree_order_id,
            paid_amount=order_amount,
            actor=current_user,
        )

        log_event(
            user_id=current_user,
            user_email=current_user,
            action="ESCROW_FUNDED_CASHFREE",
            module="Payments",
            entity_type="escrow",
            entity_id=escrow["escrow_id"],
            details={
                "escrow_id": escrow["escrow_id"],
                "cashfree_order_id": cashfree_order_id,
                "paid_amount": order_amount,
            },
        )

        return {
            "status": "FUNDED",
            "funded": True,
            "escrow": updated_escrow,
            "message": "Payment verified. Escrow transitioned to FUNDED.",
        }
    else:
        return {
            "status": escrow.get("status", "CREATED"),
            "funded": False,
            "order_status": order_status,
            "detail": (
                "Order amount mismatch"
                if order_status == "PAID"
                else f"Payment not completed (Cashfree status: {order_status})"
            ),
        }

@app.post("/api/procurement/release-settlement")
@limiter.limit("20/minute")
async def confirm_delivery(request: Request, req: ConfirmDeliveryRequest, current_user: str = Depends(get_current_user)):
    """
    Release escrow settlement after delivery verification.
    Only the buyer/owner of the escrow may release settlement.
    """
    escrow = get_escrow(req.transaction_id)
    if not escrow:
        raise HTTPException(status_code=404, detail=f"Escrow '{req.transaction_id}' not found.")
    if escrow.get("buyer_id") and escrow.get("buyer_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You are not the owner of this escrow.")

    record = transition_escrow(
        escrow_id=req.transaction_id,
        target_status="RELEASED",
        actor=current_user,
        note="Settlement initiated (simulated payout).",
    )
    
    log_event(
        user_id=current_user,
        user_email=current_user,
        action="ESCROW_RELEASED",
        module="Escrow",
        entity_type="escrow",
        entity_id=record.get("escrow_id", req.transaction_id),
        details={
            "escrow_id": record.get("escrow_id"),
            "amount_inr": record.get("amount_inr", record.get("amount")),
            "status": "RELEASED",
        }
    )
    
    # Update Reputation
    supplier_id = record.get("supplier_id")
    if supplier_id:
        promised_days = record.get("promised_delivery_days", 7)
        created_at = record.get("timestamp", time.time())
        proof = record.get("delivery_proof")
        if proof and "submitted_at" in proof:
             try:
                 submitted_at_dt = datetime.fromisoformat(proof["submitted_at"])
                 created_at_dt = datetime.fromtimestamp(created_at)
                 actual_days = (submitted_at_dt - created_at_dt).days
             except Exception:
                 actual_days = 0
        else:
             actual_days = 0
             
        on_time = actual_days <= promised_days
        update_supplier_reputation(supplier_id, on_time)

    return record


@app.post("/api/submit-delivery-proof")
@limiter.limit("20/minute")
async def submit_delivery_proof(
    request: Request,
    escrow_id: str = Form(...),
    proof_type: str = Form(...),  # "invoice_file" | "timestamp" | "tracking_id"
    file: UploadFile = File(None),
    value: str = Form(None),
    current_user: str = Depends(get_current_user)
):
    """
    Submits delivery proof for an escrow record.
    Restricted to the escrow owner.
    Files are stored in MongoDB (proofs collection) as base64, max 5 MB, JPG/PNG/PDF only.
    """
    escrow = get_escrow(escrow_id)
    if not escrow:
        raise HTTPException(status_code=404, detail=f"Escrow '{escrow_id}' not found.")
    if escrow.get("buyer_id") and escrow.get("buyer_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You are not the owner of this escrow.")

    file_url = None
    if proof_type == "invoice_file":
        if not file:
            raise HTTPException(status_code=400, detail="Invoice file is required")
        
        ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else ""
        allowed_exts = ["jpg", "jpeg", "png", "pdf"]
        allowed_mimes = ["image/jpeg", "image/png", "application/pdf"]

        if ext not in allowed_exts or file.content_type not in allowed_mimes:
            raise HTTPException(status_code=400, detail="Invalid file type. Only PNG, JPEG, and PDF file types are allowed")

        file_bytes = await file.read()
        max_size = 5 * 1024 * 1024  # 5 MB
        if len(file_bytes) > max_size:
            raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 5 MB")

        import base64
        b64_data = base64.b64encode(file_bytes).decode("utf-8")
        primary_id = escrow.get("escrow_id", escrow_id)

        proof_doc = {
            "escrow_id": primary_id,
            "filename": file.filename,
            "content_type": file.content_type,
            "size_bytes": len(file_bytes),
            "file_data": b64_data,
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "uploaded_by": current_user,
        }
        from database.db import proofs_collection
        proofs_collection.replace_one(
            {"escrow_id": primary_id},
            proof_doc,
            upsert=True
        )

        file_url = f"/api/procurement/proof/{primary_id}"
        proof_value = file.filename
    else:
        proof_value = value if value else datetime.now(timezone.utc).isoformat()

    proof_data = {
        "type": proof_type,
        "value": proof_value,
        "file_path": file_url,
        "submitted_at": datetime.now(timezone.utc).isoformat()
    }

    record = transition_escrow(
        escrow_id=escrow_id,
        target_status="PROOF_UPLOADED",
        actor=current_user,
        note=f"Delivery proof ({proof_type}) uploaded.",
        metadata={"delivery_proof": proof_data}
    )
    return record


@app.get("/api/procurement/proof/{escrow_id}")
async def get_proof_file(escrow_id: str, current_user: str = Depends(get_current_user)):
    """
    Retrieves the delivery proof document from MongoDB storage.
    Restricted to authorized parties (escrow owner or supplier).
    """
    escrow = get_escrow(escrow_id)
    if not escrow:
        raise HTTPException(status_code=404, detail="Escrow not found.")
    if escrow.get("buyer_id") and escrow.get("buyer_id") != current_user and escrow.get("supplier_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You are not authorized to view this proof.")

    primary_id = escrow.get("escrow_id", escrow_id)
    from database.db import proofs_collection
    proof = proofs_collection.find_one({"escrow_id": primary_id})
    if not proof or "file_data" not in proof:
        raise HTTPException(status_code=404, detail="Proof file not found.")

    import base64
    file_bytes = base64.b64decode(proof["file_data"])
    return Response(
        content=file_bytes,
        media_type=proof.get("content_type", "application/octet-stream"),
        headers={"Content-Disposition": f'inline; filename="{proof.get("filename", "proof")}"'}
    )


class AuditProofRequest(BaseModel):
    escrow_id: str


@app.post("/api/procurement/audit-proof")
@limiter.limit("20/minute")
async def audit_delivery_proof(
    request: Request,
    req: AuditProofRequest,
    current_user: str = Depends(get_current_user)
):
    """
    Performs an automated review check using Groq LLM against the uploaded proof and order parameters.
    Returns extracted fields and detected mismatches. If Groq is unavailable, gracefully returns
    'Automated check unavailable; buyer confirms manually'.
    """
    escrow = get_escrow(req.escrow_id)
    if not escrow:
        raise HTTPException(status_code=404, detail=f"Escrow '{req.escrow_id}' not found.")
    if escrow.get("buyer_id") and escrow.get("buyer_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You are not the owner of this escrow.")

    proof_data = escrow.get("delivery_proof")
    if not proof_data:
        raise HTTPException(status_code=400, detail="No delivery proof uploaded for this escrow.")

    expected_amount = float(escrow.get("amount_inr", escrow.get("amount", 0.0)))
    expected_supplier_id = escrow.get("supplier_id")
    
    from database.db import proofs_collection, suppliers_collection
    supplier_doc = suppliers_collection.find_one({"id": expected_supplier_id}) if expected_supplier_id else None
    expected_supplier_name = supplier_doc.get("name") if supplier_doc else escrow.get("supplier_name", expected_supplier_id or "")

    extracted_text = ""
    primary_id = escrow.get("escrow_id", req.escrow_id)
    proof_record = proofs_collection.find_one({"escrow_id": primary_id})
    if proof_record and "file_data" in proof_record:
        import base64
        file_bytes = base64.b64decode(proof_record["file_data"])
        content_type = proof_record.get("content_type", "")
        if "pdf" in content_type:
            try:
                import io, pypdf
                reader = pypdf.PdfReader(io.BytesIO(file_bytes))
                extracted_text = " ".join([page.extract_text() or "" for page in reader.pages]).strip()
            except Exception as e:
                print(f"[AuditProof] PDF extraction error: {e}")
        if not extracted_text:
            extracted_text = f"Document filename: {proof_record.get('filename')}, size: {proof_record.get('size_bytes')} bytes, type: {content_type}."
    else:
        extracted_text = f"Proof type: {proof_data.get('type')}, value: {proof_data.get('value')}, submitted at: {proof_data.get('submitted_at')}."

    from services.llm_service import chat_json
    system_prompt = (
        "You are an automated invoice review auditor for a B2B procurement system. "
        "Analyze the provided document text or proof description. "
        "You must return a valid JSON object strictly matching this schema:\n"
        "{\n"
        '  "looks_like_invoice": true,\n'
        '  "extracted": {\n'
        '    "invoice_no": "string or null",\n'
        '    "date": "string or null",\n'
        '    "amount": number or null,\n'
        '    "supplier_name": "string or null"\n'
        '  }\n'
        "}\n"
        "Set looks_like_invoice to false if the document does not look like a commercial invoice or delivery receipt. "
        "If specific fields cannot be found, set their values to null."
    )
    user_prompt = f"Order Expected Amount: ₹{expected_amount}\nOrder Expected Supplier: {expected_supplier_name}\n\nDocument Content:\n{extracted_text[:3000]}"

    llm_res = chat_json(system_prompt, user_prompt)
    if not llm_res or not isinstance(llm_res, dict):
        return {
            "status": "unavailable",
            "looks_like_invoice": False,
            "extracted": {
                "invoice_no": None,
                "date": None,
                "amount": None,
                "supplier_name": None,
            },
            "mismatches": [],
            "message": "Automated check unavailable; buyer confirms manually"
        }

    looks_like_invoice = bool(llm_res.get("looks_like_invoice", False))
    extracted = llm_res.get("extracted", {}) or {}
    mismatches = []

    if not looks_like_invoice:
        mismatches.append("Document does not appear to be a standard commercial invoice or bill of lading.")

    ext_amount = extracted.get("amount")
    if ext_amount is not None:
        try:
            ext_amt_float = float(ext_amount)
            if abs(ext_amt_float - expected_amount) > 1.0:
                mismatches.append(f"Amount mismatch: invoice states ₹{ext_amt_float:,.2f}, expected ₹{expected_amount:,.2f}")
        except (ValueError, TypeError):
            pass

    ext_supplier = extracted.get("supplier_name")
    if ext_supplier and expected_supplier_name:
        if expected_supplier_name.lower() not in str(ext_supplier).lower() and str(ext_supplier).lower() not in expected_supplier_name.lower():
            mismatches.append(f"Supplier name mismatch: invoice mentions '{ext_supplier}', expected '{expected_supplier_name}'")

    return {
        "status": "completed",
        "looks_like_invoice": looks_like_invoice,
        "extracted": {
            "invoice_no": extracted.get("invoice_no"),
            "date": extracted.get("date"),
            "amount": extracted.get("amount"),
            "supplier_name": extracted.get("supplier_name"),
        },
        "mismatches": mismatches,
        "message": "The buyer reviews the uploaded proof. An automated check highlights mismatches with the order."
    }


@app.post("/api/procurement/verify-delivery")
@limiter.limit("20/minute")
async def verify_delivery(request: Request, req: VerifyDeliveryRequest, current_user: str = Depends(get_current_user)):
    """
    Verify delivery proof before escrow release.
    Restricted to the buyer/owner of the escrow.
    """
    escrow = get_escrow(req.escrow_id)
    if not escrow:
        raise HTTPException(status_code=404, detail=f"Escrow '{req.escrow_id}' not found.")
    if escrow.get("buyer_id") and escrow.get("buyer_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You are not the owner of this escrow.")

    record = transition_escrow(
        escrow_id=req.escrow_id,
        target_status="VERIFIED",
        actor=current_user,
        note="Delivery proof verified by buyer.",
    )
    
    log_event(
        user_id=current_user,
        user_email=current_user,
        action="ESCROW_VERIFIED",
        module="Escrow",
        entity_type="escrow",
        entity_id=req.escrow_id,
        details={
            "status": "VERIFIED",
            "supplier_id": str(record.get("supplier_id"))
        }
    )
    return record

class UpdateStatusRequest(BaseModel):
    transaction_id: str
    status: str

@app.post("/api/update-escrow-status")
@limiter.limit("20/minute")
async def update_escrow_status(request: Request, req: UpdateStatusRequest, current_user: str = Depends(get_current_user)):
    record = transition_escrow(
        escrow_id=req.transaction_id,
        target_status=req.status.upper(),
        actor=current_user,
        note=f"Status updated via update endpoint to {req.status.upper()}",
    )
    return record

@app.get("/api/get-transaction/{tx_id}")
@limiter.limit("20/minute")
async def get_transaction(request: Request, tx_id: str, current_user: str = Depends(get_current_user)):
    record = get_escrow(tx_id)
    if not record:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return record

@app.post("/api/signup")
@limiter.limit("5/minute")
async def signup(request: Request, user: User):
    """
    Register a new user account.
    
    ProcureAI maintains complete procurement auditability.
    Every registration event is logged for security and compliance monitoring.
    """
    db = load_db()
    users = db.setdefault("users", [])
    if any(u["email"] == user.email for u in users):
        raise HTTPException(status_code=400, detail="User already exists")
    
    hashed_password = bcrypt.hashpw(user.password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Default role is 'buyer' for new registrations
    user_doc = {
        "email": user.email, 
        "password": hashed_password,
        "role": "buyer",
        "created_at": datetime.now(timezone.utc)
    }
    users.append(user_doc)
    save_db(db)
    
    # Log registration event for audit trail
    client_host = request.client.host if request.client else "unknown"
    log_event(
        user_id=user.email,
        user_email=user.email,
        action="REGISTRATION",
        module="Authentication",
        entity_type="user",
        entity_id=user.email,
        details={"role": "buyer"},
        ip_address=client_host
    )
    
    return {"message": "User registered successfully"}

@app.get("/api/suppliers")
@limiter.limit("30/minute")
async def get_suppliers(request: Request, current_user: str = Depends(get_current_user)):
    db = load_db()
    return db.get("suppliers", [])

@app.get("/api/suppliers/{supplier_id}")
@limiter.limit("30/minute")
async def get_supplier(request: Request, supplier_id: str, current_user: str = Depends(get_current_user)):
    db = load_db()
    suppliers = db.get("suppliers", [])
    supplier = next((s for s in suppliers if str(s["id"]) == str(supplier_id)), None)
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier

class UpdateReputationRequest(BaseModel):
    supplier_id: Any
    delivered_on_time: bool

@app.post("/api/update-reputation")
async def update_reputation_endpoint(req: UpdateReputationRequest, current_user: str = Depends(get_current_user)):
    update_supplier_reputation(req.supplier_id, req.delivered_on_time)
    return {"message": "Reputation updated"}

# --- Supplier Rating Endpoints ---

@app.post("/api/ratings")
@limiter.limit("20/minute")
async def create_supplier_rating(request: Request, req: SupplierRatingRequest, current_user: str = Depends(get_current_user)):
    """
    Submit a supplier rating after successful escrow release.
    
    ProcureAI maintains complete procurement auditability.
    Every supplier rating event is logged for reputation tracking and quality assurance.
    
    Future Recommendation Score:
    Recommendation Score = AI Supplier Intelligence Score + Supplier Reputation Score
    This rating data will later be used by supplier ranking and recommendation modules.
    """
    # Validation
    if req.rating < 1 or req.rating > 5:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 5")
    
    if not req.transaction_id:
        raise HTTPException(status_code=400, detail="transaction_id is required")
    
    if not req.supplier_id:
        raise HTTPException(status_code=400, detail="supplier_id is required")
    
    if not req.buyer_id:
        raise HTTPException(status_code=400, detail="buyer_id is required")
    
    # Check if rating already exists for this transaction
    existing_rating = supplier_ratings_collection.find_one({"transaction_id": req.transaction_id})
    
    if existing_rating:
        # Update existing rating
        supplier_ratings_collection.update_one(
            {"transaction_id": req.transaction_id},
            {
                "$set": {
                    "rating": req.rating,
                    "review": req.review,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        action = "updated"
    else:
        # Create new rating document with unique rating_id
        import uuid
        rating_doc = {
            "rating_id": str(uuid.uuid4()),
            "transaction_id": req.transaction_id,
            "supplier_id": req.supplier_id,
            "buyer_id": req.buyer_id,
            "rating": req.rating,
            "review": req.review,
            "created_at": datetime.now(timezone.utc)
        }
        supplier_ratings_collection.insert_one(rating_doc)
        action = "created"
    
    # Log supplier rating event for audit trail
    log_event(
        user_id=current_user,
        user_email=current_user,
        action="SUPPLIER_RATED",
        module="Ratings",
        entity_type="supplier",
        entity_id=req.supplier_id,
        details={
            "transaction_id": req.transaction_id,
            "rating": req.rating,
            "review": req.review
        }
    )
    
    return {"message": f"Rating {action} successfully"}

@app.get("/api/ratings/supplier/{supplier_id}")
@limiter.limit("30/minute")
async def get_supplier_ratings(request: Request, supplier_id: str, current_user: str = Depends(get_current_user)):
    """
    Get average rating and reviews for a supplier.
    
    Future Recommendation Score:
    Recommendation Score = AI Supplier Intelligence Score + Supplier Reputation Score
    This rating data will later be used by supplier ranking and recommendation modules.
    """
    ratings = list(supplier_ratings_collection.find({"supplier_id": supplier_id}, {"_id": 0}))
    
    if not ratings:
        return {
            "average_rating": 0,
            "total_reviews": 0,
            "reviews": []
        }
    
    total_reviews = len(ratings)


# --- Admin Dashboard Endpoints ---

@app.get("/api/admin/stats")
@limiter.limit("30/minute")
async def get_admin_stats(request: Request, current_user: str = Depends(get_current_user)):
    """
    Get platform statistics for admin dashboard.
    
    ProcureAI maintains complete procurement auditability.
    Admin dashboard provides comprehensive platform oversight and compliance monitoring.
    """
    try:
        # Check if user is admin
        user = users_collection.find_one({"email": current_user})
        if not user or user.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        
        # Get platform statistics
        total_users = users_collection.count_documents({})
        total_suppliers = suppliers_collection.count_documents({})
        total_transactions = escrows_collection.count_documents({})
        total_escrows = escrows_collection.count_documents({})
        total_settlements = escrows_collection.count_documents({"escrow_status": "released"})
        
        # Get audit statistics
        audit_stats = get_audit_stats()
        
        # Calculate payment stats
        escrows_created = escrows_collection.count_documents({})
        escrows_released = escrows_collection.count_documents({"escrow_status": "released"})
        escrows_verified = escrows_collection.count_documents({"escrow_status": "verified"})
        escrows_in_progress = escrows_collection.count_documents({"escrow_status": {"$in": ["funded", "created"]}})
        failed_transactions = escrows_collection.count_documents({"escrow_status": "failed"})
        
        # Calculate total payment amount from escrows
        total_payment_amount = 0
        for escrow in escrows_collection.find({"escrow_status": {"$ne": "failed"}}):
            if escrow.get("amount"):
                total_payment_amount += float(escrow["amount"])
        
        # Calculate supplier stats from audit logs
        supplier_selection_logs = list(audit_logs_collection.find({"action": "SUPPLIER_SELECTED"}))
        total_suppliers_selected = len(supplier_selection_logs)
        
        # Get unique suppliers
        unique_suppliers = set()
        total_procurement_value = 0
        for log in supplier_selection_logs:
            if log.get("details", {}).get("supplier_id"):
                unique_suppliers.add(log["details"]["supplier_id"])
            if log.get("details", {}).get("final_price"):
                total_procurement_value += float(log["details"]["final_price"])
        
        return {
            "total_users": total_users,
            "total_suppliers": total_suppliers,
            "total_procurement_transactions": total_transactions,
            "total_escrows": total_escrows,
            "total_settlements": total_settlements,
            "total_audit_logs": audit_stats["total_audit_logs"],
            "recent_activity": audit_stats["recent_activity"],
            "module_counts": audit_stats["module_counts"],
            "payment_stats": {
                "total_escrows_created": escrows_created,
                "total_escrows_released": escrows_released,
                "total_escrows_verified": escrows_verified,
                "total_escrows_in_progress": escrows_in_progress,
                "total_payment_amount": total_payment_amount,
                "failed_transactions": failed_transactions
            },
            "supplier_stats": {
                "total_suppliers_selected": total_suppliers_selected,
                "unique_suppliers_count": len(unique_suppliers),
                "total_procurement_value": total_procurement_value
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Admin Stats] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Error fetching admin stats: {str(e)}")


@app.get("/api/admin/audit-logs")
@limiter.limit("30/minute")
async def get_admin_audit_logs(
    request: Request,
    limit: int = 100,
    skip: int = 0,
    module: Optional[str] = None,
    action: Optional[str] = None,
    current_user: str = Depends(get_current_user)
):
    """
    Get audit logs for admin dashboard with optional filtering.
    
    ProcureAI maintains complete procurement auditability.
    Admin can view all platform activities for compliance and security monitoring.
    """
    # Check if user is admin
    user = users_collection.find_one({"email": current_user})
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    
    logs = get_audit_logs(
        limit=limit,
        skip=skip,
        module=module,
        action=action
    )
    
    return {"logs": logs, "total": len(logs)}


@app.get("/api/ratings/supplier/{supplier_id}")
@limiter.limit("30/minute")
async def get_supplier_ratings(request: Request, supplier_id: str, current_user: str = Depends(get_current_user)):
    """
    Get average rating and reviews for a supplier.
    
    Future Recommendation Score:
    Recommendation Score = AI Supplier Intelligence Score + Supplier Reputation Score
    This rating data will later be used by supplier ranking and recommendation modules.
    """
    ratings = list(supplier_ratings_collection.find({"supplier_id": supplier_id}, {"_id": 0}))
    
    if not ratings:
        return {
            "average_rating": 0,
            "total_reviews": 0,
            "reviews": []
        }
    
    total_reviews = len(ratings)
    average_rating = sum(r["rating"] for r in ratings) / total_reviews
    
    return {
        "average_rating": round(average_rating, 1),
        "total_reviews": total_reviews,
        "reviews": ratings
    }

# --- Multilingual Procurement Chat Endpoints ---

@app.post("/api/chat/send")
@limiter.limit("30/minute")
async def send_chat_message(request: Request, req: ChatMessageRequest, current_user: str = Depends(get_current_user)):
    """
    Send a chat message to a supplier with automatic translation.
    
    ProcureAI maintains complete procurement auditability.
    Every chat message event is logged for communication tracking and compliance.
    For hackathon MVP: Simulates supplier reply after 2-3 seconds.
    """
    try:
        # Generate message ID
        message_id = f"msg_{int(time.time() * 1000)}"
        
        # Translate the message using existing translation service
        target_language_name = req.target_language.upper() if req.target_language != "zh" else "Chinese"
        translated_message = translation_service.translate_message(req.original_message, target_language_name)
        
        # Store buyer message in MongoDB
        buyer_message_doc = {
            "message_id": message_id,
            "buyer_id": req.buyer_id,
            "supplier_id": req.supplier_id,
            "sender": "buyer",
            "original_text": req.original_message,
            "translated_text": translated_message,
            "source_language": req.source_language,
            "target_language": req.target_language,
            "created_at": datetime.now(timezone.utc)
        }
        chat_messages_collection.insert_one(buyer_message_doc)
        
        # Log chat message event for audit trail
        log_event(
            user_id=current_user,
            user_email=current_user,
            action="MESSAGE_SENT",
            module="Chat",
            entity_type="message",
            entity_id=message_id,
            details={
                "supplier_id": req.supplier_id,
                "source_language": req.source_language,
                "target_language": req.target_language
            }
        )
        
        # Simulate supplier reply (Hackathon MVP - no real supplier login)
        # Generate simulated supplier reply using existing translation flow
        supplier_reply = translation_service.simulate_supplier_reply(target_language_name)
        
        # Store supplier message in MongoDB
        supplier_message_id = f"msg_{int(time.time() * 1000) + 1}"
        supplier_message_doc = {
            "message_id": supplier_message_id,
            "buyer_id": req.buyer_id,
            "supplier_id": req.supplier_id,
            "sender": "supplier",
            "original_text": supplier_reply["native_reply"],
            "translated_text": supplier_reply["translated_reply"],
            "source_language": req.target_language,
            "target_language": req.source_language,
            "created_at": datetime.now(timezone.utc)
        }
        chat_messages_collection.insert_one(supplier_message_doc)
        
        return {
            "message_id": message_id,
            "status": "sent",
            "message": "Message sent successfully",
            "buyer_message": {
                "message_id": message_id,
                "original_text": req.original_message,
                "translated_text": translated_message,
                "source_language": req.source_language,
                "target_language": req.target_language
            },
            "supplier_reply": {
                "message_id": supplier_message_id,
                "original_text": supplier_reply["native_reply"],
                "translated_text": supplier_reply["translated_reply"],
                "source_language": req.target_language,
                "target_language": req.source_language,
                "analysis": supplier_reply["analysis"]
            }
        }
    except Exception as e:
        print(f"[ProcureAI] Send Chat Message Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/{supplier_id}")
@limiter.limit("30/minute")
async def get_chat_history(request: Request, supplier_id: str, current_user: str = Depends(get_current_user)):
    """
    Get conversation history for a specific supplier.
    """
    try:
        buyer_id = current_user  # Use authenticated user email as buyer_id
        
        # Fetch all messages for this buyer-supplier pair
        messages = list(chat_messages_collection.find(
            {"buyer_id": buyer_id, "supplier_id": supplier_id},
            {"_id": 0}
        ).sort("created_at", 1))
        
        return {
            "buyer_id": buyer_id,
            "supplier_id": supplier_id,
            "messages": messages,
            "total_messages": len(messages)
        }
    except Exception as e:
        print(f"[ProcureAI] Get Chat History Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# --- Supplier Agent Endpoint ---

@app.post("/supplier/{supplier_id}/respond")
@limiter.limit("30/minute")
async def supplier_respond(request: Request, supplier_id: str, req: SupplierNegotiationRequest, current_user: str = Depends(get_current_user)):
    db = load_db()
    suppliers = db.get("suppliers", [])
    supplier = next((s for s in suppliers if str(s["id"]) == str(supplier_id)), None)
    
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    
    base_price = supplier.get("base_price", 100.0)
    reliability = supplier.get("reliability", 0.8)
    
    # 3. SUPPLIER AGENT LOGIC
    # Round 1 -> 5%, Round 2 -> 10%, Round 3 -> 15%
    if req.round == 1:
        discount_percent = 0.05
    elif req.round == 2:
        discount_percent = 0.10
    else:
        discount_percent = 0.15
        
    # Factor reliability into pricing slightly (e.g. higher reliability = slightly less discount)
    reliability_impact = (1.0 - reliability) * 0.05
    final_discount = discount_percent + reliability_impact
    
    offer_price = round(base_price * (1 - final_discount), 2)
    
    messages = [
        "We are happy to collaborate on this order.",
        "We can offer a discounted rate for bulk purchase.",
        "Our best pricing comes with immediate escrow settlement.",
        "Considering our high reliability, this is our best offer.",
        "We hope to establish a long-term partnership with your procurement network."
    ]
    
    message = random.choice(messages)
    if req.round == 3:
        message = f"This is our final offer of ${offer_price} per unit. We cannot go lower."
    elif req.round == 2:
        message = f"We have revised our quote to ${offer_price} after further internal review."
        
    return {
        "supplier_id": supplier_id,
        "offer_price": offer_price,
        "message": message,
        "confidence": reliability
    }

# --- Multilingual AI Negotiation Endpoints ---

@app.post("/api/negotiation/multilingual")
@limiter.limit("30/minute")
async def multilingual_negotiation(request: Request, req: MultilingualNegotiationRequest, current_user: str = Depends(get_current_user)):
    """
    Single-round multilingual procurement negotiation.
    Translates buyer message, simulates supplier response, and returns AI analysis.
    """
    try:
        result = negotiation_engine.run_negotiation(
            buyer_message=req.buyer_message,
            supplier_language=req.supplier_language,
            product=req.product,
            round_number=req.round_number
        )
        return result
    except Exception as e:
        print(f"[ProcureAI] Multilingual Negotiation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/negotiation/multilingual/full")
@limiter.limit("30/minute")
async def full_multilingual_negotiation(request: Request, req: FullNegotiationRequest, current_user: str = Depends(get_current_user)):
    """
    Full 3-round multilingual procurement negotiation sequence.
    Returns all negotiation rounds with cumulative AI analysis and procurement recommendation.
    """
    try:
        result = negotiation_engine.run_full_negotiation(
            buyer_message=req.buyer_message,
            supplier_language=req.supplier_language,
            product=req.product
        )
        return result
    except Exception as e:
        print(f"[ProcureAI] Full Negotiation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/negotiation/languages")
@limiter.limit("30/minute")
async def get_supported_languages(request: Request, current_user: str = Depends(get_current_user)):
    """Return the list of supported supplier languages for multilingual negotiation."""
    return negotiation_engine.get_supported_languages()


@app.post("/api/negotiation/intelligence")
@limiter.limit("30/minute")
async def get_negotiation_intelligence(request: Request, req: NegotiationIntelligenceRequest, current_user: str = Depends(get_current_user)):
    """
    Extracts structured procurement intelligence from supplier communication.
    """
    try:
        result = negotiation_intelligence.extract_negotiation_intelligence(
            supplier_message=req.supplier_message,
            supplier_metadata=req.supplier_metadata,
            procurement_context=req.procurement_context
        )
        return result
    except Exception as e:
        print(f"[ProcureAI] Negotiation Intelligence Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/procurement/generate-inquiry", response_model=ProcurementInquiryResponse)
@limiter.limit("30/minute")
async def generate_procurement_inquiry(request: Request, req: ProcurementInquiryRequest, current_user: str = Depends(get_current_user)):
    """
    AI Procurement Message Engine endpoint.
    Transforms raw buyer intent into a professional inquiry.
    """
    try:
        result = message_engine.generate_inquiry(req.dict())
        return result
    except Exception as e:
        print(f"[ProcureAI] Inquiry Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/procurement/send-inquiry", response_model=SendInquiryResponse)
@limiter.limit("30/minute")
async def send_procurement_inquiry(request: Request, req: SendInquiryRequest, current_user: str = Depends(get_current_user)):
    """
    Sends a translated procurement inquiry to a supplier and simulates their response.
    """
    try:
        # 1. Detect language if not provided
        target_lang = translation_service.detect_language(req.supplier_region)
        
        # 2. Translate message if not provided
        translated_msg = req.translated_message or translation_service.translate_message(req.original_message, target_lang)
        
        # 3. Generate HTML template
        html_body = email_service.generate_html_template(req.supplier_name, translated_msg)
        
        # 4. Send Email (REAL SMTP if configured)
        subject = f"Procurement Inquiry — ProcureAI Global Sourcing Network"
        email_result = email_service.send_procurement_inquiry(
            req.supplier_name, 
            req.supplier_email, 
            subject, 
            html_body
        )
        
        # 5. Simulate Supplier Reply (MVP)
        simulation = translation_service.simulate_supplier_reply(target_lang)
        
        return {
            "status": "success",
            "message": "Procurement inquiry transmitted successfully.",
            "email_status": email_result,
            "translation_details": {
                "detected_language": target_lang,
                "translated_message": translated_msg,
                "confidence": 0.98
            },
            "supplier_reply_simulation": simulation
        }
    except Exception as e:
        print(f"[ProcureAI] Send Inquiry Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


from services.rfq_pdf_service import build_rfq_pdf, generate_rfq_number

class GenerateRFQRequest(BaseModel):
    supplier_id: Optional[str] = None
    supplier_name: Optional[str] = None
    supplier_email: Optional[str] = None
    supplier_region: Optional[str] = "Global"
    product: Optional[str] = None
    product_name: Optional[str] = None
    quantity: Optional[Union[int, str]] = 1
    budget: Optional[Union[float, int, str]] = None
    budget_inr: Optional[Union[float, int, str]] = None
    unit_price: Optional[Union[float, int, str]] = 0.0
    lead_time: Optional[str] = "30 Days"
    delivery_location: Optional[str] = "India"
    custom_requirements: Optional[str] = ""
    incoterms: Optional[str] = "FOB / EXW"
    payment_terms: Optional[str] = "100% Escrow on Delivery"


@app.post("/api/procurement/rfq/generate")
@limiter.limit("30/minute")
async def generate_rfq(request: Request, req: GenerateRFQRequest, current_user: str = Depends(get_current_user)):
    """
    Builds an RFQ PDF, stores it in the MongoDB rfqs collection, and returns rfq_id and filename.
    """
    try:
        supplier_name = req.supplier_name or "Selected Supplier"
        supplier_id = str(req.supplier_id or supplier_name)
        product = req.product or req.product_name or "Goods"
        quantity = req.quantity or 1
        budget = req.budget if req.budget is not None else (req.budget_inr if req.budget_inr is not None else 0.0)

        # Check supplier email if provided or lookup
        supplier_email = req.supplier_email
        if not supplier_email or not supplier_email.strip():
            s_doc = suppliers_collection.find_one({"id": supplier_id}) or suppliers_collection.find_one({"name": supplier_name})
            if s_doc and s_doc.get("email"):
                supplier_email = s_doc["email"]

        if not supplier_email or not supplier_email.strip():
            raise HTTPException(status_code=422, detail="Supplier email not available")

        # Fetch real buyer details
        buyer_doc = users_collection.find_one({"email": current_user})
        buyer_name = buyer_doc.get("name") if buyer_doc and buyer_doc.get("name") else current_user

        rfq_id = generate_rfq_number()
        created_at_dt = datetime.now(timezone.utc)

        pdf_bytes = build_rfq_pdf({
            "rfq_id": rfq_id,
            "created_at": created_at_dt,
            "buyer_id": current_user,
            "buyer_name": buyer_name,
            "buyer_email": current_user,
            "supplier_id": supplier_id,
            "supplier_name": supplier_name,
            "supplier_email": supplier_email,
            "product": product,
            "quantity": quantity,
            "budget": budget,
            "lead_time": req.lead_time or "30 Days",
            "delivery_location": req.delivery_location or "India",
            "custom_requirements": req.custom_requirements or "",
        })

        rfq_doc = {
            "rfq_id": rfq_id,
            "buyer_id": current_user,
            "supplier_id": str(supplier_id),
            "supplier_name": supplier_name,
            "supplier_email": supplier_email,
            "product": product,
            "quantity": quantity,
            "budget": budget,
            "lead_time": req.lead_time or "30 Days",
            "delivery_location": req.delivery_location or "India",
            "custom_requirements": req.custom_requirements or "",
            "pdf_bytes": pdf_bytes,
            "created_at": created_at_dt.isoformat(),
            "status": "generated"
        }
        rfqs_collection.insert_one(rfq_doc)

        log_event(
            user_id=current_user,
            user_email=current_user,
            action="GENERATE_RFQ",
            module="Procurement",
            entity_type="rfq",
            entity_id=rfq_id,
            details={"rfq_id": rfq_id, "supplier_id": supplier_id, "product": product}
        )

        return {
            "rfq_id": rfq_id,
            "filename": f"{rfq_id}.pdf"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ProcureAI] Generate RFQ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/procurement/rfq/{rfq_id}/pdf")
@limiter.limit("60/minute")
async def get_rfq_pdf(request: Request, rfq_id: str, current_user: str = Depends(get_current_user)):
    """
    Returns the stored RFQ PDF. Accessible only to the RFQ owner (buyer_id).
    """
    rfq = rfqs_collection.find_one({"rfq_id": rfq_id})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    if rfq.get("buyer_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this RFQ")

    pdf_bytes = rfq.get("pdf_bytes")
    if not pdf_bytes:
        raise HTTPException(status_code=404, detail="RFQ PDF data missing")

    from fastapi.responses import Response
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{rfq_id}.pdf"'}
    )


@app.post("/api/procurement/rfq/{rfq_id}/send")
@limiter.limit("30/minute")
async def send_rfq(request: Request, rfq_id: str, current_user: str = Depends(get_current_user)):
    """
    Dispatches the RFQ PDF to the supplier via EmailService.
    Owner-only. Respects EMAIL_DRY_RUN and EMAIL_OVERRIDE_TO.
    """
    rfq = rfqs_collection.find_one({"rfq_id": rfq_id})
    if not rfq:
        raise HTTPException(status_code=404, detail="RFQ not found")
    if rfq.get("buyer_id") != current_user:
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this RFQ")

    supplier_email = rfq.get("supplier_email")
    if not supplier_email or not supplier_email.strip():
        s_doc = suppliers_collection.find_one({"id": rfq.get("supplier_id")}) or suppliers_collection.find_one({"name": rfq.get("supplier_name")})
        if s_doc and s_doc.get("email"):
            supplier_email = s_doc["email"]

    if not supplier_email or not supplier_email.strip():
        raise HTTPException(status_code=422, detail="Supplier email not available")

    buyer_doc = users_collection.find_one({"email": current_user})
    buyer_name = buyer_doc.get("name") if buyer_doc and buyer_doc.get("name") else current_user
    supplier_name = rfq.get("supplier_name", "Supplier")

    subject = f"Request for Quotation {rfq_id}"
    body_html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
            <h2 style="color: #0f172a; margin-top: 0;">Request for Quotation</h2>
            <p>Dear {supplier_name},</p>
            <p>Please find attached our formal Request for Quotation (Reference: <strong>{rfq_id}</strong>) for <strong>{rfq.get('product')}</strong> ({rfq.get('quantity')} units).</p>
            <p>Kindly review the specifications, terms, and delivery parameters detailed in the attached PDF and reply before the submission deadline.</p>
            <p>Regards,<br/><strong>{buyer_name}</strong><br/>ProcureAI B2B Sourcing Network</p>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin-top: 24px;" />
            <p style="font-size: 11px; color: #94a3b8;">Automated communication generated via ProcureAI Sourcing Engine.</p>
        </div>
    </body>
    </html>
    """

    attachments = [
        {
            "filename": f"{rfq_id}.pdf",
            "content": bytes(rfq["pdf_bytes"])
        }
    ]

    send_result = email_service.send_raw_email(
        recipient_email=supplier_email,
        subject=subject,
        body_html=body_html,
        attachments=attachments
    )

    send_timestamp = datetime.now(timezone.utc).isoformat()
    rfqs_collection.update_one(
        {"rfq_id": rfq_id},
        {
            "$set": {
                "status": "sent" if send_result.get("status") == "success" else send_result.get("status", "sent"),
                "sent_at": send_timestamp,
                "send_result": send_result
            }
        }
    )

    log_event(
        user_id=current_user,
        user_email=current_user,
        action="SEND_RFQ",
        module="Procurement",
        entity_type="rfq",
        entity_id=rfq_id,
        details={
            "rfq_id": rfq_id,
            "supplier_id": rfq.get("supplier_id"),
            "supplier_email": supplier_email,
            "status": send_result.get("status")
        }
    )

    return {
        "status": send_result.get("status", "success"),
        "message": send_result.get("message", "RFQ dispatched successfully"),
        "rfq_id": rfq_id,
        "email_status": send_result
    }


# --- Forgot Password & Change Password Endpoints ---

# In-memory OTP storage (for MVP - should use Redis/database in production)
otp_storage = {}

class SendOTPRequest(BaseModel):
    email: str

class VerifyOTPRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    email: str
    otp: str
    new_password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/forgot-password/send-otp")
@limiter.limit("5/minute")
async def send_otp(request: Request, req: SendOTPRequest):
    """
    Send OTP to user's email for password reset.
    
    ProcureAI maintains complete procurement auditability.
    Every OTP request is logged for security monitoring.
    """
    # Check if user exists
    users = list(users_collection.find({}, {"_id": 0}))
    user = next((u for u in users if u["email"] == req.email), None)
    
    if not user:
        # For security, don't reveal if email exists or not
        return {"message": "If the email exists, an OTP has been sent"}
    
    # Generate 6-digit OTP
    otp = str(random.randint(100000, 999999))
    
    # Store OTP with 10-minute expiry
    otp_storage[req.email] = {
        "otp": otp,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=10)
    }
    
    # Log OTP request for audit trail
    client_host = request.client.host if request.client else "unknown"
    log_event(
        user_id=req.email,
        user_email=req.email,
        action="PASSWORD_RESET_OTP_REQUEST",
        module="Authentication",
        entity_type="user",
        entity_id=req.email,
        ip_address=client_host
    )
    
    # Send email with OTP
    try:
        subject = "ProcureAI Password Reset OTP"
        body = f"""
        <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center;">
                <h1 style="color: white; margin: 0;">ProcureAI</h1>
            </div>
            <div style="padding: 30px; background-color: #f9f9f9;">
                <h2 style="color: #333;">Password Reset Request</h2>
                <p style="color: #666;">You have requested to reset your password. Use the following OTP to proceed:</p>
                <div style="background: white; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
                    <span style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px;">{otp}</span>
                </div>
                <p style="color: #666;">This OTP will expire in 10 minutes.</p>
                <p style="color: #999; font-size: 12px;">If you did not request this password reset, please ignore this email.</p>
            </div>
        </body>
        </html>
        """
        email_service.send_raw_email(req.email, subject, body)
        return {"message": "OTP sent successfully"}
    except Exception as e:
        print(f"Error sending OTP email: {e}")
        # For demo purposes, return OTP in response (remove in production)
        return {"message": "OTP sent successfully", "otp": otp}

@app.post("/api/forgot-password/verify-otp")
@limiter.limit("10/minute")
async def verify_otp(request: Request, req: VerifyOTPRequest):
    """
    Verify OTP for password reset.
    
    ProcureAI maintains complete procurement auditability.
    Every OTP verification is logged for security monitoring.
    """
    if req.email not in otp_storage:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    stored_otp = otp_storage[req.email]
    
    # Check if OTP expired
    if datetime.now(timezone.utc) > stored_otp["expires_at"]:
        del otp_storage[req.email]
        raise HTTPException(status_code=400, detail="OTP has expired")
    
    # Verify OTP
    if stored_otp["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Log OTP verification for audit trail
    client_host = request.client.host if request.client else "unknown"
    log_event(
        user_id=req.email,
        user_email=req.email,
        action="PASSWORD_RESET_OTP_VERIFIED",
        module="Authentication",
        entity_type="user",
        entity_id=req.email,
        ip_address=client_host
    )
    
    return {"message": "OTP verified successfully"}

@app.post("/api/forgot-password/reset-password")
@limiter.limit("5/minute")
async def reset_password(request: Request, req: ResetPasswordRequest):
    """
    Reset password using verified OTP.
    
    ProcureAI maintains complete procurement auditability.
    Every password reset is logged for security monitoring.
    """
    # Verify OTP again
    if req.email not in otp_storage:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")
    
    stored_otp = otp_storage[req.email]
    
    if datetime.now(timezone.utc) > stored_otp["expires_at"]:
        del otp_storage[req.email]
        raise HTTPException(status_code=400, detail="OTP has expired")
    
    if stored_otp["otp"] != req.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    # Update password
    users = list(users_collection.find({}, {"_id": 0}))
    user = next((u for u in users if u["email"] == req.email), None)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Hash new password
    hashed_password = bcrypt.hashpw(req.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Update in database
    users_collection.update_one(
        {"email": req.email},
        {"$set": {"password": hashed_password}}
    )
    
    # Clear OTP
    del otp_storage[req.email]
    
    # Log password reset for audit trail
    client_host = request.client.host if request.client else "unknown"
    log_event(
        user_id=req.email,
        user_email=req.email,
        action="PASSWORD_RESET",
        module="Authentication",
        entity_type="user",
        entity_id=req.email,
        ip_address=client_host
    )
    
    return {"message": "Password reset successfully"}

@app.post("/api/change-password")
@limiter.limit("5/minute")
async def change_password(request: Request, req: ChangePasswordRequest, current_user: str = Depends(get_current_user)):
    """
    Change password for authenticated user.
    
    ProcureAI maintains complete procurement auditability.
    Every password change is logged for security monitoring.
    """
    # Get user
    users = list(users_collection.find({}, {"_id": 0}))
    user = next((u for u in users if u["email"] == current_user), None)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Verify current password
    try:
        valid_password = bcrypt.checkpw(req.current_password.encode("utf-8"), user["password"].encode("utf-8"))
    except Exception:
        valid_password = False
    
    if not valid_password:
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Hash new password
    hashed_password = bcrypt.hashpw(req.new_password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    
    # Update in database
    users_collection.update_one(
        {"email": current_user},
        {"$set": {"password": hashed_password}}
    )
    
    # Log password change for audit trail
    client_host = request.client.host if request.client else "unknown"
    log_event(
        user_id=current_user,
        user_email=current_user,
        action="PASSWORD_CHANGED",
        module="Authentication",
        entity_type="user",
        entity_id=current_user,
        ip_address=client_host
    )
    
    return {"message": "Password changed successfully"}

@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint for deployment platforms and monitoring."""
    return {
        "status": "healthy",
        "service": "ProcureAI",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    # Enable reload by default in dev mode, but disable it in production environments
    app_env = os.getenv("APP_ENV", "development").lower()
    if app_env == "production":
        reload_mode = False
    else:
        reload_mode = os.getenv("RELOAD", "True").lower() == "true"
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=reload_mode)
