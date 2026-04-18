"""
routers/file_router.py — Project File Upload / Download
=========================================================
POST  /files/upload/{project_id}   → upload a file to a project
GET   /files/project/{project_id}  → list all files for a project
GET   /files/{file_id}             → get file metadata
DELETE /files/{file_id}            → delete a file (uploader or admin)

Files are stored in the Docker volume at:
  uploads/projects/<project_id>/<uuid>.<ext>

They are accessible at:
  http://localhost:8000/uploads/projects/<project_id>/<filename>

Allowed types: PDF, images (JPEG/PNG/GIF), ZIP, Word docs, text files
Maximum size: 20 MB
"""

import os
import uuid
import aiofiles

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user

router     = APIRouter(prefix="/files", tags=["Files"])
UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")

ALLOWED_TYPES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/gif",
    "application/zip",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
}
MAX_SIZE_MB = 20


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /files/upload/{project_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "/upload/{project_id}",
    response_model=schema.FileResponse,
    status_code=201,
    summary="Upload a file to a project",
    description="""
Upload a deliverable or attachment to a project.

Access rules:
- The client who owns the project can upload
- The freelancer on an active contract for this project can upload
- Admins can upload to any project

Accepted types: **PDF, JPEG, PNG, GIF, ZIP, Word, TXT**
Maximum: **20 MB**
""",
)
async def upload_project_file(
    project_id: int,
    file:       UploadFile  = File(..., description="File to upload (max 20 MB)"),
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    # Check project exists
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    # Access check
    _assert_file_upload_access(project, me, db)

    # File type check
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            400,
            f"File type '{file.content_type}' is not allowed. "
            "Use: PDF, JPEG, PNG, GIF, ZIP, Word, or TXT."
        )

    # Size check
    contents = await file.read()
    if len(contents) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(400, f"File too large. Maximum is {MAX_SIZE_MB} MB.")

    # Save file to disk
    ext      = (file.filename or "file").rsplit(".", 1)[-1].lower()
    filename = f"{uuid.uuid4()}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "projects", str(project_id))
    os.makedirs(save_dir, exist_ok=True)

    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    file_path = f"/uploads/projects/{project_id}/{filename}"

    # Save metadata to DB
    file_record = models.File(
        project_id  = project_id,
        uploader_id = me.id,
        file_path   = file_path,
    )
    db.add(file_record)
    db.commit()
    db.refresh(file_record)

    return schema.FileResponse(
        file_id      = file_record.file_id,
        project_id   = file_record.project_id,
        uploader_id  = file_record.uploader_id,
        file_path    = file_record.file_path,
        original_name = file.filename,
        message      = f"File uploaded. Access at: {file_path}",
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /files/project/{project_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/project/{project_id}",
    response_model=list[schema.FileResponse],
    summary="List files for a project",
)
def list_project_files(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    _assert_file_upload_access(project, me, db)

    files = db.query(models.File).filter(
        models.File.project_id == project_id
    ).all()

    return [
        schema.FileResponse(
            file_id     = f.file_id,
            project_id  = f.project_id,
            uploader_id = f.uploader_id,
            file_path   = f.file_path,
        )
        for f in files
    ]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /files/{file_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/{file_id}",
    response_model=schema.FileResponse,
    summary="Get file metadata",
)
def get_file(
    file_id: int,
    me:      models.User = Depends(get_current_user),
    db:      Session     = Depends(get_db),
):
    file_record = db.query(models.File).filter(
        models.File.file_id == file_id
    ).first()
    if not file_record:
        raise HTTPException(404, "File not found.")

    project = db.query(models.Project).filter(
        models.Project.project_id == file_record.project_id
    ).first()
    _assert_file_upload_access(project, me, db)

    return schema.FileResponse(
        file_id     = file_record.file_id,
        project_id  = file_record.project_id,
        uploader_id = file_record.uploader_id,
        file_path   = file_record.file_path,
    )


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /files/{file_id}
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/{file_id}",
    response_model=schema.MessageResponse,
    summary="Delete a file",
    description="**Uploader or admin only.** Also removes the file from disk.",
)
def delete_file(
    file_id: int,
    me:      models.User = Depends(get_current_user),
    db:      Session     = Depends(get_db),
):
    file_record = db.query(models.File).filter(
        models.File.file_id == file_id
    ).first()
    if not file_record:
        raise HTTPException(404, "File not found.")

    if me.role != models.UserRole.admin and file_record.uploader_id != me.id:
        raise HTTPException(403, "You can only delete files you uploaded.")

    # Remove from disk
    disk_path = os.path.join(UPLOAD_DIR, file_record.file_path.lstrip("/uploads/"))
    if os.path.exists(disk_path):
        os.remove(disk_path)

    db.delete(file_record)
    db.commit()
    return {"message": f"File #{file_id} deleted."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Helper
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _assert_file_upload_access(project: models.Project, me: models.User, db: Session):
    """Admin, project client, or freelancer with an active contract can access files."""
    if me.role == models.UserRole.admin:
        return

    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if client and client.client_id == project.client_id:
        return

    freelancer = db.query(models.Freelancer).filter(models.Freelancer.user_id == me.id).first()
    if freelancer:
        contract = db.query(models.Contract).filter(
            models.Contract.project_id    == project.project_id,
            models.Contract.freelancer_id == freelancer.freelancer_id,
        ).first()
        if contract:
            return

    raise HTTPException(403, "You do not have access to this project's files.")