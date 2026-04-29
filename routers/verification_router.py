"""
routers/verification_router.py — Identity Verification
========================================================
POST   /verification/submit          → upload a document + declare its type
GET    /verification/status          → get your current verification status
DELETE /verification/cancel          → withdraw a pending submission

Admin endpoints:
GET    /verification/admin/pending   → list all pending verifications
PUT    /verification/admin/{id}/approve  → approve a verification
PUT    /verification/admin/{id}/reject   → reject with a note
"""

import os
import uuid
import aiofiles

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db
import models
from auth import get_current_user, require_role

router = APIRouter(prefix="/verification", tags=["Verification"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

ALLOWED_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_SIZE_MB = 10

ALLOWED_DOC_TYPES = {
    "national_id",
    "passport",
    "drivers_license",
    "residence_permit",
    "other",
}


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_or_404(db: Session, verification_id: int) -> models.Verification:
    v = db.query(models.Verification).filter(
        models.Verification.verification_id == verification_id
    ).first()
    if not v:
        raise HTTPException(404, "Verification record not found.")
    return v


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /verification/status
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/status", summary="Get your verification status")
def get_status(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    v = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()

    if not v:
        return {
            "status":         "not_submitted",
            "document_type":  None,
            "rejection_note": None,
            "reviewed_at":    None,
            "created_at":     None,
        }

    return {
        "status":         v.status.value,
        "document_type":  v.document_type,
        "rejection_note": v.rejection_note,
        "reviewed_at":    v.reviewed_at,
        "created_at":     v.created_at,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /verification/submit
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post("/submit", summary="Submit identity document for verification")
async def submit_verification(
    document_type: str        = Form(..., description="One of: national_id, passport, drivers_license, residence_permit, other"),
    file:          UploadFile = File(..., description="Document file (PDF, JPEG, PNG, Word — max 10 MB)"),
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    # Validate document type
    if document_type not in ALLOWED_DOC_TYPES:
        raise HTTPException(400, f"Invalid document type. Allowed: {', '.join(ALLOWED_DOC_TYPES)}")

    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"File type '{file.content_type}' not allowed. Use PDF, JPEG, PNG, or Word.")

    # Read & size check
    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Maximum is {MAX_SIZE_MB} MB.")

    # Check existing record
    existing = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()

    if existing:
        if existing.status == models.VerificationStatus.approved:
            raise HTTPException(400, "Your identity is already verified.")
        if existing.status == models.VerificationStatus.pending:
            raise HTTPException(400, "You already have a pending verification. Wait for review or cancel it first.")
        # Rejected → allow resubmission: update existing record
    
    # Save file
    ext      = (file.filename or "doc").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "verification")
    os.makedirs(save_dir, exist_ok=True)

    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    doc_path = f"/uploads/verification/{filename}"

    if existing:
        # Resubmission after rejection
        existing.document_type  = document_type
        existing.document_path  = doc_path
        existing.status         = models.VerificationStatus.pending
        existing.rejection_note = None
        existing.reviewed_by    = None
        existing.reviewed_at    = None
        db.commit()
        return {"message": "Verification resubmitted successfully. Under review.", "status": "pending"}
    else:
        v = models.Verification(
            user_id       = me.id,
            document_type = document_type,
            document_path = doc_path,
            status        = models.VerificationStatus.pending,
        )
        db.add(v)
        db.commit()
        return {"message": "Verification submitted successfully. Under review.", "status": "pending"}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /verification/cancel
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete("/cancel", summary="Cancel a pending verification submission")
def cancel_verification(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    v = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()

    if not v:
        raise HTTPException(404, "No verification submission found.")
    if v.status != models.VerificationStatus.pending:
        raise HTTPException(400, "Only pending submissions can be cancelled.")

    db.delete(v)
    db.commit()
    return {"message": "Verification submission cancelled."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN: GET /verification/admin/pending
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get("/admin/pending", summary="[Admin] List pending verifications")
def admin_list_pending(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    if me.role != models.UserRole.admin:
        raise HTTPException(403, "Admin only.")

    pending = db.query(models.Verification).filter(
        models.Verification.status == models.VerificationStatus.pending
    ).all()

    return [
        {
            "verification_id": v.verification_id,
            "user_id":         v.user_id,
            "document_type":   v.document_type,
            "document_path":   v.document_path,
            "created_at":      v.created_at,
        }
        for v in pending
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN: PUT /verification/admin/{id}/approve
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put("/admin/{verification_id}/approve", summary="[Admin] Approve a verification")
def admin_approve(
    verification_id: int,
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    if me.role != models.UserRole.admin:
        raise HTTPException(403, "Admin only.")

    from sqlalchemy.sql import func
    v = _get_or_404(db, verification_id)

    if v.status == models.VerificationStatus.approved:
        raise HTTPException(400, "Already approved.")

    v.status      = models.VerificationStatus.approved
    v.reviewed_by = me.id
    v.reviewed_at = func.now()
    db.commit()
    return {"message": "Verification approved."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  ADMIN: PUT /verification/admin/{id}/reject
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put("/admin/{verification_id}/reject", summary="[Admin] Reject a verification")
def admin_reject(
    verification_id: int,
    rejection_note: str = Form(..., description="Reason for rejection shown to the user"),
    me: models.User     = Depends(get_current_user),
    db: Session         = Depends(get_db),
):
    if me.role != models.UserRole.admin:
        raise HTTPException(403, "Admin only.")

    from sqlalchemy.sql import func
    v = _get_or_404(db, verification_id)

    if v.status == models.VerificationStatus.approved:
        raise HTTPException(400, "Cannot reject an already-approved verification.")

    v.status         = models.VerificationStatus.rejected
    v.rejection_note = rejection_note
    v.reviewed_by    = me.id
    v.reviewed_at    = func.now()
    db.commit()
    return {"message": "Verification rejected.", "rejection_note": rejection_note}