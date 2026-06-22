"""
services/email_service.py — Transactional email, SMTP or Resend
====================================================================
Two transports are supported, auto-selected by which env vars are set:

  - RESEND_API_KEY set  -> send via Resend's HTTP API (https://resend.com)
  - otherwise           -> send via SMTP (fastapi-mail), the original path

Why two paths: this file is shared across deployments. Render (and most
PaaS providers) block outbound SMTP ports (25/465/587) to prevent spam
abuse, so a direct SMTP connection from a Render-hosted service times
out ("Timed out connecting to smtp.gmail.com on port 465"). A real VM
(e.g. the Azure deployment) generally has no such restriction and can
keep using SMTP unchanged. Resend's API is plain HTTPS, so it works
anywhere — set RESEND_API_KEY wherever SMTP is blocked.
"""

import os
import logging
from pathlib import Path

import httpx
from jinja2 import Environment, FileSystemLoader
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr

logger = logging.getLogger(__name__)

TEMPLATE_FOLDER = Path(__file__).parent.parent / "templates" / "email"

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
MAIL_FROM = os.getenv("MAIL_FROM", "onboarding@resend.dev")

# ── SMTP transport (original path, used when RESEND_API_KEY is unset) ────────
_smtp_conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", "dummy@gmail.com"),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", "dummy_password"),
    MAIL_FROM=os.getenv("MAIL_FROM", "noreply@skillink.com"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", 465)),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=os.getenv("MAIL_STARTTLS", "False").lower() in ("true", "1", "yes"),
    MAIL_SSL_TLS=os.getenv("MAIL_SSL_TLS", "True").lower() in ("true", "1", "yes"),
    USE_CREDENTIALS=True,
    VALIDATE_CERTS=True,
    TEMPLATE_FOLDER=TEMPLATE_FOLDER,
)
_fast_mail = FastMail(_smtp_conf)

# ── Resend transport (HTTP API, used when RESEND_API_KEY is set) ─────────────
_jinja_env = Environment(loader=FileSystemLoader(str(TEMPLATE_FOLDER)))


async def _send_via_resend(subject: str, email_to: list[EmailStr], template_name: str, body: dict) -> None:
    try:
        template = _jinja_env.get_template(template_name)
        html = template.render(**body)
    except Exception as e:
        logger.error("Failed to render email template '%s': %s", template_name, e)
        return

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": MAIL_FROM,
                    "to": list(email_to),
                    "subject": subject,
                    "html": html,
                },
            )
        if response.status_code >= 400:
            logger.error(
                "Failed to send email '%s' to %s via Resend: %s %s",
                subject, email_to, response.status_code, response.text,
            )
        else:
            logger.info("Email '%s' successfully sent to %s (Resend)", subject, email_to)
    except Exception as e:
        logger.error("Failed to send email to %s via Resend: %s", email_to, e)


async def _send_via_smtp(subject: str, email_to: list[EmailStr], template_name: str, body: dict) -> None:
    message = MessageSchema(
        subject=subject,
        recipients=email_to,
        template_body=body,
        subtype=MessageType.html,
    )
    try:
        await _fast_mail.send_message(message, template_name=template_name)
        logger.info("Email '%s' successfully sent to %s (SMTP)", subject, email_to)
    except Exception as e:
        logger.error("Failed to send email to %s via SMTP: %s", email_to, e)


async def send_async_email(subject: str, email_to: list[EmailStr], template_name: str, body: dict):
    """
    Send an email using whichever transport is configured.
    Same signature as before — existing callers need no changes.
    """
    if RESEND_API_KEY:
        await _send_via_resend(subject, email_to, template_name, body)
    else:
        await _send_via_smtp(subject, email_to, template_name, body)
