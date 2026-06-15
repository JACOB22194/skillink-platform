import os
from pathlib import Path
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from pydantic import EmailStr
import logging

logger = logging.getLogger(__name__)

# Configure the email connection using environment variables
conf = ConnectionConfig(
    MAIL_USERNAME = os.getenv("MAIL_USERNAME", "dummy@gmail.com"),
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD", "dummy_password"),
    MAIL_FROM = os.getenv("MAIL_FROM", "noreply@skillink.com"),
    MAIL_PORT = int(os.getenv("MAIL_PORT", 465)),
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS = os.getenv("MAIL_STARTTLS", "False").lower() in ("true", "1", "yes"),
    MAIL_SSL_TLS = os.getenv("MAIL_SSL_TLS", "True").lower() in ("true", "1", "yes"),
    USE_CREDENTIALS = True,
    VALIDATE_CERTS = True,
    TEMPLATE_FOLDER = Path(__file__).parent.parent / "templates" / "email",
)

fast_mail = FastMail(conf)

async def send_async_email(subject: str, email_to: list[EmailStr], template_name: str, body: dict):
    """
    Send an asynchronous email using a Jinja2 template.
    This function should be called via FastAPI BackgroundTasks.
    """
    message = MessageSchema(
        subject=subject,
        recipients=email_to,
        template_body=body,
        subtype=MessageType.html
    )
    
    try:
        await fast_mail.send_message(message, template_name=template_name)
        logger.info(f"Email '{subject}' successfully sent to {email_to}")
    except Exception as e:
        logger.error(f"Failed to send email to {email_to}: {e}")
