import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from typing import Optional, List, Dict, Any
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

logger = logging.getLogger(__name__)


class EmailService:
    """
    Enterprise-grade SMTP email service for procurement inquiries.
    Supports dry-run mode and optional recipient overrides for staging.
    """

    def __init__(self):
        self._load_credentials()
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587

    def _load_credentials(self):
        load_dotenv(find_dotenv())
        self.smtp_email = os.getenv("SMTP_EMAIL", "").strip()
        self.smtp_password = os.getenv("SMTP_PASSWORD", "").strip()
        self.email_dry_run = os.getenv("EMAIL_DRY_RUN", "false").lower() in ("true", "1", "yes")
        self.email_override_to = os.getenv("EMAIL_OVERRIDE_TO", "").strip()

    def _resolve_recipient(self, intended_recipient: str) -> str:
        """Resolves target recipient, using override if configured."""
        if self.email_override_to:
            logger.info(
                f"[EmailService] EMAIL_OVERRIDE_TO active: redirecting from {intended_recipient} to {self.email_override_to}"
            )
            return self.email_override_to
        return intended_recipient

    def send_procurement_inquiry(
        self,
        supplier_name: str,
        supplier_email: str,
        subject: str,
        body_html: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ):
        """
        Sends a professional procurement inquiry via SMTP to the supplier.
        Returns a dry_run response when SMTP credentials are not configured or EMAIL_DRY_RUN is set.
        """
        self._load_credentials()
        target_recipient = self._resolve_recipient(supplier_email)

        if self.email_dry_run:
            logger.info(f"[EmailService] Dry run enabled. Simulated inquiry to {target_recipient} ({supplier_name})")
            return {
                "status": "dry_run",
                "message": f"EMAIL_DRY_RUN is active. Inquiry to {supplier_name} ({target_recipient}) logged as dry run.",
                "recipient": target_recipient,
            }

        if not self.smtp_email or not self.smtp_password:
            logger.info(f"[EmailService] SMTP credentials not set. Simulated inquiry to {target_recipient} ({supplier_name})")
            return {
                "status": "dry_run",
                "message": "SMTP credentials not configured. Email logged as dry run.",
                "recipient": target_recipient,
            }

        try:
            msg = MIMEMultipart()
            msg["From"] = self.smtp_email
            msg["To"] = target_recipient
            msg["Subject"] = f"{subject} [To: {supplier_name}]"
            msg.attach(MIMEText(body_html, "html"))

            if attachments:
                for att in attachments:
                    content = att.get("content", b"")
                    filename = att.get("filename", "attachment.pdf")
                    part = MIMEApplication(content, Name=filename)
                    part["Content-Disposition"] = f'attachment; filename="{filename}"'
                    msg.attach(part)

            server = smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=10)
            server.starttls()
            server.login(self.smtp_email, self.smtp_password)
            server.send_message(msg)
            server.quit()

            logger.info(f"[EmailService] Inquiry sent successfully to {target_recipient}")
            return {"status": "success", "message": f"Email sent to {target_recipient}"}
        except Exception as e:
            logger.error(f"[EmailService] Failed to send email to {target_recipient}: {e}")
            return {"status": "error", "message": str(e)}

    def send_raw_email(
        self,
        recipient_email: str,
        subject: str,
        body_html: str,
        attachments: Optional[List[Dict[str, Any]]] = None,
    ):
        """
        Sends a raw email with given subject and HTML body.
        Used for OTP emails, RFQs, and system notifications.
        """
        self._load_credentials()
        target_recipient = self._resolve_recipient(recipient_email)

        if self.email_dry_run:
            logger.info(f"[EmailService] Dry run enabled. Simulated raw email to {target_recipient}")
            return {
                "status": "dry_run",
                "message": f"EMAIL_DRY_RUN is active. Raw email to {target_recipient} logged as dry run.",
                "recipient": target_recipient,
            }

        if not self.smtp_email or not self.smtp_password:
            logger.info(f"[EmailService] SMTP credentials not set. Simulated raw email to {target_recipient}")
            return {
                "status": "dry_run",
                "message": "SMTP credentials not configured. Email logged as dry run.",
                "recipient": target_recipient,
            }

        try:
            msg = MIMEMultipart()
            msg["From"] = self.smtp_email
            msg["To"] = target_recipient
            msg["Subject"] = subject
            msg.attach(MIMEText(body_html, "html"))

            if attachments:
                for att in attachments:
                    content = att.get("content", b"")
                    filename = att.get("filename", "attachment.pdf")
                    part = MIMEApplication(content, Name=filename)
                    part["Content-Disposition"] = f'attachment; filename="{filename}"'
                    msg.attach(part)

            server = smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=10)
            server.starttls()
            server.login(self.smtp_email, self.smtp_password)
            server.send_message(msg)
            server.quit()

            logger.info(f"[EmailService] Email sent successfully to {target_recipient}")
            return {"status": "success", "message": f"Email sent to {target_recipient}"}
        except Exception as e:
            logger.error(f"[EmailService] Failed to send email to {target_recipient}: {e}")
            return {"status": "error", "message": str(e)}

    def generate_html_template(self, supplier_name: str, message: str) -> str:
        """
        Generates a professional HTML email template for procurement.
        """
        return f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; padding: 20px; border-radius: 8px;">
                <h2 style="color: #1a365d; border-bottom: 2px solid #1a365d; padding-bottom: 10px;">Procurement Inquiry — ProcureAI Global Sourcing Network</h2>
                <p>Dear {supplier_name},</p>
                <p>We are initiating a procurement sourcing discussion for the following requirements.</p>

                <div style="background-color: #f7fafc; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #1a365d;">
                    <p style="white-space: pre-wrap;">{message}</p>
                </div>

                <p>Please respond with:</p>
                <ul>
                    <li>MOQ (Minimum Order Quantity)</li>
                    <li>Production Lead Time</li>
                    <li>Pricing Tiers (Volume-based)</li>
                    <li>Production Capacity</li>
                    <li>Export Certifications</li>
                </ul>

                <p>Regards,<br><strong>ProcureAI Autonomous Procurement Agent</strong></p>

                <div style="margin-top: 30px; font-size: 12px; color: #718096; border-top: 1px solid #e2e8f0; padding-top: 10px;">
                    This is an automated procurement inquiry sent via the ProcureAI Orchestration Layer.
                </div>
            </div>
        </body>
        </html>
        """
