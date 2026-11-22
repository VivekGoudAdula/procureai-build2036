"""
RFQ PDF Generation Service
==========================
Generates enterprise-standard Request for Quotation (RFQ) PDF documents.
Formats Indian Rupee (₹) amounts, buyer/supplier parameters, and formal quotation request terms.
"""

import io
import os
import random
import string
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
)
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont


def _register_font() -> str:
    """
    Registers a TrueType font supporting the Indian Rupee symbol (₹) if available.
    Returns the font name to use ('Arial', 'NotoSans', or fallback 'Helvetica').
    """
    candidates = [
        ("NotoSans", os.path.join(os.path.dirname(os.path.dirname(__file__)), "assets", "fonts", "NotoSans-Regular.ttf")),
        ("Arial", "C:/Windows/Fonts/arial.ttf"),
        ("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
    ]

    for font_name, font_path in candidates:
        if os.path.exists(font_path):
            try:
                pdfmetrics.registerFont(TTFont(font_name, font_path))
                return font_name
            except Exception:
                continue

    return "Helvetica"


def format_indian_currency(amount: Any) -> str:
    """
    Formats numeric amounts using Indian numbering system (e.g. 1,00,000).
    """
    try:
        val = float(amount)
        int_val = int(abs(val))
        s = str(int_val)
        if len(s) <= 3:
            formatted = s
        else:
            last_three = s[-3:]
            remaining = s[:-3]
            groups = []
            while remaining:
                groups.append(remaining[-2:])
                remaining = remaining[:-2]
            groups.reverse()
            formatted = ",".join(groups) + "," + last_three
        sign = "-" if val < 0 else ""
        return f"{sign}{formatted}"
    except Exception:
        return str(amount)


def generate_rfq_number() -> str:
    """
    Generates a unique RFQ number: RFQ-YYYYMMDD-XXXX.
    """
    today_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"RFQ-{today_str}-{suffix}"


def build_rfq_pdf(data: Dict[str, Any]) -> bytes:
    """
    Constructs a Request for Quotation (RFQ) PDF from data dictionary.
    Returns the generated PDF as raw bytes.
    """
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40,
    )

    font_name = _register_font()
    currency_symbol = "₹ " if font_name != "Helvetica" else "Rs. "

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "RFQTitle",
        parent=styles["Heading1"],
        fontName=font_name,
        fontSize=20,
        leading=24,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=4,
    )
    subtitle_style = ParagraphStyle(
        "RFQSubtitle",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=10,
        leading=14,
        textColor=colors.HexColor("#64748b"),
    )
    section_heading = ParagraphStyle(
        "RFQSectionHeading",
        parent=styles["Heading2"],
        fontName=font_name,
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=10,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "RFQBody",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#334155"),
    )
    list_item_style = ParagraphStyle(
        "RFQListItem",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=9,
        leading=14,
        textColor=colors.HexColor("#334155"),
        leftIndent=14,
    )
    footer_style = ParagraphStyle(
        "RFQFooter",
        parent=styles["Normal"],
        fontName=font_name,
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#94a3b8"),
        alignment=1,  # Center
    )

    rfq_id = data.get("rfq_id") or generate_rfq_number()
    created_at = data.get("created_at") or datetime.now(timezone.utc)
    if isinstance(created_at, str):
        date_str = created_at[:10]
    else:
        date_str = created_at.strftime("%d %B %Y")

    reply_by_date = (datetime.now(timezone.utc) + timedelta(days=7)).strftime("%d %B %Y")

    buyer_name = data.get("buyer_name") or data.get("buyer_id") or "Authorized Buyer"
    buyer_email = data.get("buyer_email") or data.get("buyer_id") or "buyer@procureai.internal"
    supplier_name = data.get("supplier_name", "Prospective Supplier")

    story = []

    # 1. Header Banner
    story.append(Paragraph("REQUEST FOR QUOTATION (RFQ)", title_style))
    story.append(Paragraph(f"ProcureAI Enterprise B2B Sourcing Network  •  Reference: <b>{rfq_id}</b>", subtitle_style))
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#0f172a"), spaceAfter=14))

    # 2. Metadata: Buyer & Supplier Information
    meta_table_data = [
        [
            Paragraph("<b>ISSUED TO (SUPPLIER):</b>", body_style),
            Paragraph("<b>ISSUED BY (BUYER):</b>", body_style),
        ],
        [
            Paragraph(f"<b>{supplier_name}</b><br/>{data.get('supplier_email', '')}<br/>Region: {data.get('delivery_location') or data.get('supplier_region', 'India / Global')}", body_style),
            Paragraph(f"<b>{buyer_name}</b><br/>Email: {buyer_email}<br/>Platform: ProcureAI Verified Buyer", body_style),
        ],
        [
            Paragraph(f"<b>Date of Issue:</b> {date_str}", body_style),
            Paragraph(f"<b>Quotation Reply Due By:</b> <font color='#b91c1c'><b>{reply_by_date}</b></font>", body_style),
        ],
    ]
    meta_table = Table(meta_table_data, colWidths=[270, 270])
    meta_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#f8fafc")),
        ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#e2e8f0")),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#f1f5f9")),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # 3. Item Specification Table
    story.append(Paragraph("Procurement Specifications", section_heading))

    budget_raw = data.get("budget", 0)
    formatted_budget = f"{currency_symbol}{format_indian_currency(budget_raw)}"
    product_name = data.get("product") or data.get("product_name") or "Industrial Machinery & Components"
    if str(product_name).strip().lower() in ["goods", "unspecified material", "none", ""]:
        product_name = data.get("product_name") or "Industrial Machinery & Components"
    quantity = data.get("quantity", 1)
    lead_time = data.get("lead_time", "Standard")
    delivery_loc = data.get("delivery_location", "Domestic India (Ex-Works / Delivery at Place)")

    item_table_data = [
        ["Item / Product", "Quantity", "Target Budget", "Required Lead Time", "Delivery Location"],
        [
            Paragraph(str(product_name), body_style),
            Paragraph(f"{quantity:,} Units" if isinstance(quantity, int) else f"{quantity} Units", body_style),
            Paragraph(formatted_budget, body_style),
            Paragraph(str(lead_time), body_style),
            Paragraph(str(delivery_loc), body_style),
        ],
    ]
    item_table = Table(item_table_data, colWidths=[140, 75, 105, 100, 120])
    item_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0f172a")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), font_name),
        ("FONTSIZE", (0, 0), (-1, 0), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    story.append(item_table)
    story.append(Spacer(1, 14))

    # 4. Custom Requirements (if any)
    custom_req = data.get("custom_requirements")
    if custom_req and custom_req.strip():
        story.append(Paragraph("Technical & Custom Requirements", section_heading))
        story.append(Paragraph(custom_req.strip(), body_style))
        story.append(Spacer(1, 10))

    # 5. Formal Quote Request Checklist
    story.append(Paragraph("Quotation Submission Checklist", section_heading))
    checklist_items = [
        "1. <b>Unit Price & Volume Tiers:</b> Please specify base unit price (INR) and tiered volume discounts.",
        "2. <b>Minimum Order Quantity (MOQ):</b> Clarify production and shipment lot restrictions.",
        "3. <b>Production & Dispatch Lead Time:</b> Confirmed manufacturing timeline to arrival.",
        "4. <b>GST & Regulatory Compliance:</b> Applicable GST rate (%), HSN/SAC code, and tax breakdown.",
        "5. <b>Certifications:</b> Quality, safety, and regulatory compliance documents (e.g. ISO 9001, BIS, CE).",
        "6. <b>Payment & Settlement Terms:</b> Acceptance of escrow/milestone-backed settlement.",
        "7. <b>Quote Validity Period:</b> Quotation must remain valid for a minimum of 30 calendar days.",
    ]
    for item in checklist_items:
        story.append(Paragraph(item, list_item_style))
        story.append(Spacer(1, 3))

    story.append(Spacer(1, 16))
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceAfter=10))

    # 6. Legal / Instructions Footer
    story.append(
        Paragraph(
            f"Please submit quotation via ProcureAI portal or reply to <b>{buyer_email}</b> before <b>{reply_by_date}</b>.<br/>"
            "This document is an invitation to treat and does not constitute a binding purchase order until confirmed in contract.",
            body_style,
        )
    )
    story.append(Spacer(1, 12))
    story.append(Paragraph("Generated by ProcureAI — Autonomous B2B Sourcing & Escrow Infrastructure", footer_style))

    doc.build(story)
    return buffer.getvalue()
