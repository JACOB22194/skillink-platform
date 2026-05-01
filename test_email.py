import asyncio
from services.email_service import send_async_email
from db import SessionLocal
import models

async def main():
    print("Testing email service...")
    await send_async_email(
        subject="Test Email",
        email_to=["test@skillink.com"],
        template_name="welcome.html",
        body={"name": "Test User", "activation_link": "http://localhost:3000/activate?token=test"}
    )
    print("Email sent (or attempted).")

if __name__ == "__main__":
    asyncio.run(main())
