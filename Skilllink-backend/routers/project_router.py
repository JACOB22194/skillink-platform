"""
routers/project_router.py — Project CRUD Endpoints
=====================================================
POST   /projects                    → create a project (clients only)
GET    /projects                    → list all open projects (any logged-in user)
GET    /projects/my                 → list MY projects (client sees own, freelancer sees contracted)
GET    /projects/{id}               → get one project by ID
PUT    /projects/{id}               → update a project (owner client only)
DELETE /projects/{id}               → delete a project (owner client or admin)

Pydantic schemas: ProjectCreate, ProjectResponse, ProjectUpdate (defined in schema.py)

Business rules enforced here:
  - Only clients (or admins) can create projects
  - Minimum budget is $10 (enforced in schema + here)
  - Only the owning client (or admin) can edit/delete
  - Projects in_progress or completed cannot be edited
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db
import models
import schema
from auth import get_current_user, require_client, require_admin

router = APIRouter(prefix="/projects", tags=["Projects"])


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  POST /projects  — Create a project
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.post(
    "",
    response_model=schema.ProjectResponse,
    status_code=201,
    summary="Create a new project",
    description="""
**Clients only.**

Post a new project that freelancers can find and submit proposals to.

- `budget` must be at least $10.00
- `required_skills` is an optional list of skill names (must exist in the skills table)
- Status is automatically set to `open`
""",
)
def create_project(
    body: schema.ProjectCreate,
    me:   models.User = Depends(require_client),
    db:   Session     = Depends(get_db),
):
    # Get the client profile
    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client:
        raise HTTPException(404, "Client profile not found.")

    # Hard server-side budget enforcement (EMP-04)
    if body.budget < 10.0:
        raise HTTPException(400, "Budget must be at least $10.00.")

    # Create project
    project = models.Project(
        client_id     = client.client_id,
        title         = body.title,
        description   = body.description,
        budget        = body.budget,
        sub_category  = body.sub_category,
        category      = body.category,
        status        = models.ProjectStatus.open,
        contract_type = models.ContractType(body.contract_type) if body.contract_type else models.ContractType.fixed,
    )
    db.add(project)
    db.flush()  # get project_id

    # Attach skills if provided
    if body.required_skills:
        for skill_name in body.required_skills:
            skill = db.query(models.Skill).filter(models.Skill.name == skill_name).first()
            if not skill:
                # Auto-create skill if it doesn't exist yet
                skill = models.Skill(name=skill_name)
                db.add(skill)
                db.flush()
            db.add(models.ProjectSkill(project_id=project.project_id, skill_id=skill.skill_id))

    db.commit()
    db.refresh(project)
    return _project_to_response(project)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /projects  — Browse all open projects
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "",
    response_model=list[schema.ProjectResponse],
    summary="Browse projects",
    description="""
Returns projects visible to all logged-in users.

Optional filters:
- `status` → `open` | `in_progress` | `completed`  (default: only `open`)
- `min_budget` / `max_budget` → budget range filter
- `skip` / `limit` → pagination
""",
)
def list_projects(
    status:     Optional[str]   = Query("open", description="Filter by status"),
    min_budget: Optional[float] = Query(None,   ge=0),
    max_budget: Optional[float] = Query(None,   ge=0),
    skip:       int             = Query(0,       ge=0),
    limit:      int             = Query(20,      ge=1, le=100),
    me:         models.User     = Depends(get_current_user),
    db:         Session         = Depends(get_db),
):
    q = db.query(models.Project)

    if status:
        try:
            q = q.filter(models.Project.status == models.ProjectStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status '{status}'. Use: open, in_progress, completed")

    if min_budget is not None:
        q = q.filter(models.Project.budget >= min_budget)
    if max_budget is not None:
        q = q.filter(models.Project.budget <= max_budget)

    projects = q.order_by(models.Project.project_id.desc()).offset(skip).limit(limit).all()
    return [_project_to_response(p) for p in projects]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /projects/my  — My projects
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/my",
    response_model=list[schema.ProjectResponse],
    summary="Get my projects",
    description="""
- **Client** → returns projects you posted
- **Freelancer** → returns projects you have an active/completed contract on
- **Admin** → returns all projects
""",
)
def my_projects(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    if me.role == models.UserRole.admin:
        projects = db.query(models.Project).all()

    elif me.role == models.UserRole.client:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client:
            return []
        projects = db.query(models.Project).filter(
            models.Project.client_id == client.client_id
        ).all()

    else:  # freelancer
        freelancer = db.query(models.Freelancer).filter(
            models.Freelancer.user_id == me.id
        ).first()
        if not freelancer:
            return []
        contracts = db.query(models.Contract).filter(
            models.Contract.freelancer_id == freelancer.freelancer_id
        ).all()
        project_ids = [c.project_id for c in contracts]
        if not project_ids:
            return []
        projects = db.query(models.Project).filter(
            models.Project.project_id.in_(project_ids)
        ).all()

    return [_project_to_response(p) for p in projects]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  GET /projects/{project_id}  — Get one project
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.get(
    "/{project_id}",
    response_model=schema.ProjectResponse,
    summary="Get a project by ID",
)
def get_project(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")
    return _project_to_response(project)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  PUT /projects/{project_id}  — Update project
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.put(
    "/{project_id}",
    response_model=schema.ProjectResponse,
    summary="Update a project",
    description="""
**Owner client or admin only.**

You can only edit projects that are still `open`.
Once a project is `in_progress` or `completed`, it cannot be edited.

Only include fields you want to change.
""",
)
def update_project(
    project_id: int,
    body:       schema.ProjectUpdate,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    # Permission check
    _assert_project_owner_or_admin(project, me, db)

    # Cannot edit a project that is already underway
    if project.status != models.ProjectStatus.open:
        raise HTTPException(
            400,
            f"Cannot edit a project with status '{project.status.value}'. "
            "Only open projects can be edited."
        )

    if body.title        is not None: project.title        = body.title
    if body.description  is not None: project.description  = body.description
    if body.budget       is not None:
        if body.budget < 10.0:
            raise HTTPException(400, "Budget must be at least $10.00.")
        project.budget = body.budget
    if body.sub_category is not None: project.sub_category = body.sub_category
    if body.category     is not None: project.category     = body.category

    # Replace skills if provided
    if body.required_skills is not None:
        # Remove old skill links
        db.query(models.ProjectSkill).filter(
            models.ProjectSkill.project_id == project.project_id
        ).delete()

        for skill_name in body.required_skills:
            skill = db.query(models.Skill).filter(models.Skill.name == skill_name).first()
            if not skill:
                skill = models.Skill(name=skill_name)
                db.add(skill)
                db.flush()
            db.add(models.ProjectSkill(
                project_id=project.project_id, skill_id=skill.skill_id
            ))

    db.commit()
    db.refresh(project)
    return _project_to_response(project)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  DELETE /projects/{project_id}  — Delete project
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@router.delete(
    "/{project_id}",
    response_model=schema.MessageResponse,
    summary="Delete a project",
    description="**Owner client or admin only.** Cannot delete a project with an active contract.",
)
def delete_project(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    _assert_project_owner_or_admin(project, me, db)

    # Block delete if an active contract exists
    active_contract = db.query(models.Contract).filter(
        models.Contract.project_id == project_id,
        models.Contract.status     == models.ContractStatus.active,
    ).first()
    if active_contract:
        raise HTTPException(
            400,
            "Cannot delete a project that has an active contract. "
            "Complete or resolve the contract first."
        )

    db.delete(project)
    db.commit()
    return {"message": f"Project '{project.title}' has been deleted."}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  Helpers (not endpoints)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _project_to_response(project: models.Project) -> schema.ProjectResponse:
    """Converts a Project ORM object to a ProjectResponse, including skill names."""
    skill_names = [ps.skill.name for ps in project.skills if ps.skill]
    return schema.ProjectResponse(
        project_id      = project.project_id,
        client_id       = project.client_id,
        title           = project.title,
        description     = project.description,
        budget          = project.budget,
        sub_category    = project.sub_category,
        category        = project.category,
        status          = project.status,
        required_skills = skill_names,
    )


def _assert_project_owner_or_admin(
    project:    models.Project,
    me:         models.User,
    db:         Session,
):
    """Raises 403 if `me` is not the project owner or an admin."""
    if me.role == models.UserRole.admin:
        return  # admins can do anything

    client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
    if not client or client.client_id != project.client_id:
        raise HTTPException(403, "You do not own this project.")