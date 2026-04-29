"""
routers/auth_router.py — Authentication Endpoints
===================================================
POST /auth/register               → create a new account
POST /auth/login                  → log in and get JWT tokens
POST /auth/verify-mfa             → submit 6-digit MFA code (only if MFA is on)
POST /auth/refresh                → get a new access token using the refresh token
POST /auth/mfa/setup              → turn MFA on or off
POST /auth/change-password        → change your password while logged in

── Forgot Password ──────────────────────────────────────────
POST /auth/forgot-password        → send a reset link to email (Flow A)
POST /auth/reset-password         → use the link token to set a new password (Flow A)
POST /auth/forgot-password-otp    → send a 6-digit OTP to email (Flow B)
POST /auth/verify-reset-otp-check → validate OTP without changing password yet (Flow B step 1)
POST /auth/verify-reset-otp       → validate OTP + set new password in one step (Flow B step 2)
"""

import pyotp    # generates MFA secrets and verifies 6-digit codes
import qrcode   # draws QR code images
import io       # keeps the image in memory (never saved to disk)
import base64   # converts the image to a text string the frontend can display
import bcrypt   # direct bcrypt usage instead of passlib
import secrets  # cryptographically secure random tokens
import random   # for OTP digit generation
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import create_access_token, create_refresh_token, decode_token, get_current_user

router  = APIRouter(prefix="/auth", tags=["Authentication"])


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain: str) -> str:
    """Converts 'MyPass1' → '$2b$12$abc...' (one-way, cannot be reversed)"""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()

def check_password(plain: str, hashed: str) -> bool:
    """Returns True if the plain text matches the stored hash"""
    return bcrypt.checkpw(plain.encode(), hashed.encode())

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/register
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/register",
    response_model=schema.UserResponse,
    status_code=201,
    summary="Create a new account",
    description="""
**Creates a freelancer, client, or admin account.**

Rules:
- Email must be unique (returns 409 error if it already exists)
- Password: minimum 8 characters, at least 1 uppercase letter, at least 1 digit
- If role is `client`, you can provide a `company_name`
- A profile row is created automatically (in freelancers or clients table)
""",
)
def register(body: schema.RegisterRequest, db: Session = Depends(get_db)):

    # Block duplicate emails
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    # Create the user
    user = models.User(
        email       = body.email,
        password    = hash_password(body.password),
        role        = body.role,
        status      = models.UserStatus.unverified,
        mfa_enabled = False,
        mfa_secret  = None,
    )
    db.add(user)
    db.flush()   # get user.id before committing

    # Create the matching profile row automatically
    if body.role == models.UserRole.freelancer:
        db.add(models.Freelancer(user_id=user.id))
    elif body.role == models.UserRole.client:
        db.add(models.Client(
            user_id      = user.id,
            company_name = body.company_name,
        ))

    db.commit()
    db.refresh(user)
    
    # Simulate Email Send
    activation_token = create_access_token(user.id, user.role.value)
    print(f"\n\n{'='*50}\n[SIMULATED EMAIL] To: {user.email}\nSubject: Verify your SkillLink account\nClick here to activate: http://localhost:3000/activate?token={activation_token}\n{'='*50}\n\n")

    return user


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /auth/activate/{token}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/activate/{token}", summary="Activate an unverified account")
def activate_account(token: str, db: Session = Depends(get_db)):
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired activation link.")
    
    user = db.query(models.User).filter(models.User.id == int(payload["sub"])).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    if user.status == models.UserStatus.active:
        return {"message": "Account is already activated."}
        
    user.status = models.UserStatus.active
    db.commit()
    return {"message": "Account successfully activated."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/login
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/login",
    summary="Log in and get JWT tokens",
    description="""
Send your email and password.

**If MFA is OFF:** returns `access_token` and `refresh_token` immediately.

**If MFA is ON:** returns `{"mfa_required": true, "email": "..."}`.
You must then call `POST /auth/verify-mfa` with your 6-digit code.
""",
)
def login(body: schema.LoginRequest, db: Session = Depends(get_db)):

    user = db.query(models.User).filter(models.User.email == body.email).first()

    # Vague error on purpose — don't tell attackers which part was wrong
    if not user or not check_password(body.password, user.password):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    if user.status == models.UserStatus.suspended:
        raise HTTPException(status_code=403, detail="Your account is suspended. Contact support.")
        
    if user.status == models.UserStatus.unverified:
        raise HTTPException(status_code=403, detail="Please verify your email before logging in. Check your inbox.")

    # If MFA is enabled, stop here — user must prove the TOTP code first
    if user.mfa_enabled:
        return {"mfa_required": True, "email": user.email}

    return schema.TokenResponse(
        access_token  = create_access_token(user.id, user.role.value),
        refresh_token = create_refresh_token(user.id, user.role.value),
        role          = user.role.value,
        user_id       = user.id,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/verify-mfa
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/verify-mfa",
    response_model=schema.TokenResponse,
    summary="Submit 6-digit MFA code to finish login",
    description="""
Only call this after `/auth/login` returns `mfa_required: true`.

Send the **email** and the **6-digit code** currently shown in your
authenticator app (Google Authenticator, Authy, etc.).

On success, you receive the normal JWT tokens.
""",
)
def verify_mfa(body: schema.MFAVerifyRequest, db: Session = Depends(get_db)):

    user = db.query(models.User).filter(models.User.email == body.email).first()

    if not user or not user.mfa_enabled or not user.mfa_secret:
        raise HTTPException(status_code=400, detail="MFA is not enabled on this account.")

    # valid_window=1 allows 30 seconds of clock drift between devices
    if not pyotp.TOTP(user.mfa_secret).verify(body.totp_code, valid_window=1):
        raise HTTPException(status_code=401, detail="MFA code is wrong or has expired.")

    return schema.TokenResponse(
        access_token  = create_access_token(user.id, user.role.value),
        refresh_token = create_refresh_token(user.id, user.role.value),
        role          = user.role.value,
        user_id       = user.id,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/refresh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/refresh",
    response_model=schema.TokenResponse,
    summary="Get a new access token",
    description="""
Access tokens expire in 30 minutes.
Send your **refresh token** (valid 7 days) here to get a fresh access token
without logging in again.
""",
)
def refresh_token(body: schema.RefreshRequest, db: Session = Depends(get_db)):

    payload = decode_token(body.refresh_token)

    if payload.get("type") != "refresh":
        raise HTTPException(status_code=400, detail="This is not a refresh token.")

    user = db.query(models.User).filter(
        models.User.id == int(payload["sub"])
    ).first()

    if not user or user.status == models.UserStatus.suspended:
        raise HTTPException(status_code=401, detail="User not found or suspended.")

    return schema.TokenResponse(
        access_token  = create_access_token(user.id, user.role.value),
        refresh_token = create_refresh_token(user.id, user.role.value),
        role          = user.role.value,
        user_id       = user.id,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/mfa/setup
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/mfa/setup",
    summary="Enable or disable MFA on your account",
    description="""
You must be logged in to call this.

**Turn ON** (`enable: true`):
- Generates a TOTP secret and saves it
- Returns a `qr_code` (base64 PNG image) — the frontend shows this to the user
  so they can scan it with Google Authenticator or Authy
- Also returns the raw `secret` text for manual entry

**Turn OFF** (`enable: false`):
- Removes the secret. Next login will skip the TOTP step.
""",
)
def setup_mfa(
    body: schema.MFASetupRequest,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if not body.enable:
        me.mfa_enabled = False
        me.mfa_secret  = None
        db.commit()
        return {"message": "MFA has been disabled on your account."}

    # Generate a new random TOTP secret
    secret = pyotp.random_base32()

    # Build the URI that authenticator apps understand
    uri = pyotp.TOTP(secret).provisioning_uri(
        name        = me.email,
        issuer_name = "SkillLink",
    )

    # Create the QR code image in memory (never saves to disk)
    buf = io.BytesIO()
    qrcode.make(uri).save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()

    # Save the secret but do NOT set mfa_enabled=True yet.
    # MFA is only activated after the user confirms a valid
    # 6-digit code via POST /auth/mfa/confirm below.
    me.mfa_secret  = secret
    me.mfa_enabled = False
    db.commit()

    return {
        "message":          "Scan the QR code, then confirm with a 6-digit code at POST /auth/mfa/verify.",
        "secret":           secret,
        "provisioning_uri": uri,
        "qr_code":          f"data:image/png;base64,{qr_b64}",
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/mfa/verify
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/mfa/verify",
    response_model=schema.MessageResponse,
    summary="Confirm MFA setup with a 6-digit code",
    description="""
Called by the frontend (MFASetupPage step 3) after the user scans the QR code.
Send the 6-digit code currently shown in the authenticator app.
On success, mfa_enabled is set to True and MFA is fully active on the account.
""",
)
def confirm_mfa(
    
    body: schema.MFAConfirmRequest,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if not me.mfa_secret:
        raise HTTPException(
            status_code=400,
            detail="No MFA secret found. Please run /auth/mfa/setup first.",
        )

    if not pyotp.TOTP(me.mfa_secret).verify(body.totp_code, valid_window=1):
        raise HTTPException(
            status_code=401,
            detail="Invalid code. Please try again — make sure your device clock is correct.",
        )

    me.mfa_enabled = True
    db.commit()
    return {"message": "MFA has been successfully enabled on your account."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /auth/change-password
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/change-password",
    response_model=schema.MessageResponse,
    summary="Change your password",
    description="Send your current password and the new one. You must be logged in.",
)
def change_password(
    body: schema.ChangePasswordRequest,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    if not check_password(body.current_password, me.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    me.password = hash_password(body.new_password)
    db.commit()
    return {"message": "Password changed successfully."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  FORGOT PASSWORD — FLOW A: Email reset link
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# In-memory stores (replace with DB columns in production)
# { token: { user_id: int, expires_at: datetime } }
_reset_tokens: dict = {}

# { email: { otp: str, expires_at: datetime, verified: bool } }
_reset_otps: dict = {}


@router.post(
    "/forgot-password",
    response_model=schema.MessageResponse,
    summary="Send a password-reset link to the user's email",
    description="""
**Flow A — Email link.**

Always returns 200 even if the email is not found (prevents user enumeration).
The printed link in the console simulates the email delivery.
""",
)
def forgot_password(body: schema.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()

    if user:
        token = secrets.token_urlsafe(32)
        expires = datetime.now(timezone.utc) + timedelta(minutes=15)
        _reset_tokens[token] = {"user_id": user.id, "expires_at": expires}

        reset_url = f"http://localhost:3000/reset-password?token={token}"
        print(
            f"\n\n{'='*50}\n"
            f"[SIMULATED EMAIL] To: {user.email}\n"
            f"Subject: Reset your SkillLink password\n"
            f"Click here to reset (expires in 15 min): {reset_url}\n"
            f"{'='*50}\n\n"
        )

    return {"message": "If that email exists, a reset link has been sent."}


@router.post(
    "/reset-password",
    response_model=schema.MessageResponse,
    summary="Set a new password using the emailed token",
    description="Flow A step 2 — validate the token and save the new password.",
)
def reset_password(body: schema.ResetPasswordRequest, db: Session = Depends(get_db)):
    entry = _reset_tokens.get(body.token)
    if not entry:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    if datetime.now(timezone.utc) > entry["expires_at"]:
        _reset_tokens.pop(body.token, None)
        raise HTTPException(status_code=400, detail="This reset link has expired. Please request a new one.")

    user = db.query(models.User).filter(models.User.id == entry["user_id"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.password = hash_password(body.new_password)
    db.commit()
    _reset_tokens.pop(body.token, None)   # one-time use
    return {"message": "Password has been reset successfully."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  FORGOT PASSWORD — FLOW B: 6-digit OTP
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/forgot-password-otp",
    response_model=schema.MessageResponse,
    summary="Send a 6-digit OTP to the user's email",
    description="""
**Flow B — OTP code.**

Always returns 200 even if the email is not found (prevents user enumeration).
The OTP expires in 10 minutes.
""",
)
def forgot_password_otp(body: schema.ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == body.email).first()

    if user:
        otp = f"{random.randint(0, 999999):06d}"
        expires = datetime.now(timezone.utc) + timedelta(minutes=10)
        _reset_otps[body.email] = {"otp": otp, "expires_at": expires, "verified": False}

        print(
            f"\n\n{'='*50}\n"
            f"[SIMULATED EMAIL] To: {user.email}\n"
            f"Subject: Your SkillLink password reset code\n"
            f"Your 6-digit reset code is: {otp}  (expires in 10 minutes)\n"
            f"{'='*50}\n\n"
        )

    return {"message": "If that email exists, a reset code has been sent."}


@router.post(
    "/verify-reset-otp-check",
    response_model=schema.MessageResponse,
    summary="Validate OTP without changing password yet (pre-check)",
    description="Flow B — checks the OTP is correct, marks it verified so the next step can save the password.",
)
def verify_reset_otp_check(body: schema.VerifyResetOTPCheckRequest, db: Session = Depends(get_db)):
    entry = _reset_otps.get(body.email)

    if not entry:
        raise HTTPException(status_code=400, detail="No reset code found for this email. Please request a new one.")

    if datetime.now(timezone.utc) > entry["expires_at"]:
        _reset_otps.pop(body.email, None)
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")

    if entry["otp"] != body.otp:
        raise HTTPException(status_code=401, detail="Incorrect code. Please check and try again.")

    # Mark as verified — the final step confirms the password
    _reset_otps[body.email]["verified"] = True
    return {"message": "Code verified. You may now set your new password."}


@router.post(
    "/verify-reset-otp",
    response_model=schema.MessageResponse,
    summary="Validate OTP + set new password",
    description="Flow B final step — verifies the OTP and saves the new password in one call.",
)
def verify_reset_otp(body: schema.VerifyResetOTPRequest, db: Session = Depends(get_db)):
    entry = _reset_otps.get(body.email)

    if not entry:
        raise HTTPException(status_code=400, detail="No reset code found for this email. Please request a new one.")

    if datetime.now(timezone.utc) > entry["expires_at"]:
        _reset_otps.pop(body.email, None)
        raise HTTPException(status_code=400, detail="This code has expired. Please request a new one.")

    # Accept either: OTP not yet pre-checked (direct call) or already verified
    if not entry.get("verified") and entry["otp"] != body.otp:
        raise HTTPException(status_code=401, detail="Incorrect code. Please check and try again.")

    user = db.query(models.User).filter(models.User.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.password = hash_password(body.new_password)
    db.commit()
    _reset_otps.pop(body.email, None)   # one-time use
    return {"message": "Password has been reset successfully."}