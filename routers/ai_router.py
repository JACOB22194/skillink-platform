"""
routers/ai_router.py — Phase 4: AI Integration, Disputes & Verification
=========================================================================
Phase 5 update:
  - Messaging section REMOVED → lives in routers/messaging_router.py
  - notify() calls added to dispute resolution and verification review
    so users receive real-time notifications when these events happen

AI ENDPOINTS:
  GET  /projects/{id}/ai-match                    → AI ranks freelancers for a project
  POST /projects/{id}/ai-pricing                  → AI suggests a budget range for a project
  POST /proposals/{id}/score                      → AI scores a proposal's relevance (0–100)
  POST /milestones/{id}/verify-deliverable        → AI Verification Report for a milestone deliverable

DISPUTE RESOLUTION (Admin):
  GET  /admin/disputes                → list all disputes
  GET  /admin/disputes/{id}           → get one dispute
  POST /admin/disputes/{id}/resolve   → resolve a dispute (release / refund / split)

VERIFICATION:
  POST  /verification/submit          → user submits identity verification document
  GET   /verification/status          → check your own verification status
  GET   /admin/verification           → admin: list all pending verifications
  PATCH /admin/verification/{id}      → admin: approve or reject verification

HOW AI CALLS WORK:
  The backend calls the AI service at AI_SERVICE_URL (set in docker-compose).
  If the AI service is down or times out, the backend falls back gracefully:
    - ai-match → returns freelancers sorted by success_score (database ranking)
    - ai-pricing → returns min=budget*0.6, max=budget*0.9 (simple heuristic)
    - proposal scoring → skill-overlap heuristic

  The AI service must expose these endpoints:
    POST /match       → { project_description, required_skills, freelancers[] }
    POST /pricing     → { title, description, budget }
    POST /score       → { project_description, cover_letter, bid_amount }
"""

import os
import json
import httpx
import logging
from datetime import datetime, timezone
from typing import Optional, List

import aiofiles
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
import models
import schema
from auth import get_current_user, require_admin
from services.notification_service import notify

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Phase 4 — AI, Disputes & Verification"])

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai:8001")
AI_TIMEOUT     = 10.0
UPLOAD_DIR     = os.getenv("UPLOAD_DIR", "uploads")


# ════════════════════════════════════════════════════════════════════
#  AI ENDPOINTS
# ════════════════════════════════════════════════════════════════════

class OptimizeBioPayload(BaseModel):
    bio: str = ""
    skills: List[str] = []

class DraftScorePayload(BaseModel):
    project_id: int
    cover_letter: str = ""
    bid_amount: float

class DraftScoreResponse(BaseModel):
    score: float       # 0.0 – 1.0
    reasoning: str
    passes: bool

PROPOSAL_SCORE_THRESHOLD = 0.40

_GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash-lite", "gemini-2.0-flash"]

@router.post("/ai/optimize-bio", summary="Optimize freelancer bio using AI")
def optimize_bio(
    payload: OptimizeBioPayload,
    me: models.User = Depends(get_current_user),
):
    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/optimize-bio",
            json={"bio": payload.bio, "skills": payload.skills},
            timeout=30.0,
        )
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.warning("AI service unavailable for optimize-bio, falling back to Gemini. Error: %s", e)

    # Fallback: call Gemini directly from the backend
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        try:
            from google import genai
            skills_text = ", ".join(payload.skills) if payload.skills else "general freelancing"
            prompt = (
                "You are a professional profile writer for a freelance platform.\n"
                "Rewrite the bio below to be compelling and professional, weaving in the listed skills naturally.\n"
                "Keep it 2-4 sentences, first person, no buzzwords. Return ONLY the rewritten bio — no quotes, no explanation.\n\n"
                f"Current bio: {payload.bio or 'No bio provided'}\n"
                f"Skills: {skills_text}\n\n"
                "Optimized bio:"
            )
            client = genai.Client(api_key=api_key)
            for model in _GEMINI_MODELS:
                try:
                    resp = client.models.generate_content(model=model, contents=prompt)
                    return {"optimized_bio": resp.text.strip()}
                except Exception as gemini_err:
                    logger.warning("optimize-bio fallback: model %s failed: %s", model, gemini_err)
        except Exception as e:
            logger.error("optimize-bio Gemini fallback failed: %s", e)

    # Last resort: return the original bio unchanged rather than failing with 503
    return {"optimized_bio": payload.bio or ""}


@router.get(
    "/projects/{project_id}/ai-match",
    response_model=schema.AIMatchResponse,
    summary="AI-ranked freelancer matches for a project",
    description="""
Calls the AI service to rank freelancers by how well they match this project.
Returns up to 10 ranked freelancers with an `ai_match_score` (0–100).
Falls back to success-score ranking if AI is unavailable.
""",
)
def ai_match_freelancers(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    freelancers = (
        db.query(models.Freelancer)
        .join(models.User, models.User.id == models.Freelancer.user_id)
        .filter(models.User.status == models.UserStatus.active)
        .all()
    )

    required_skills = [ps.skill.name for ps in project.skills if ps.skill]

    freelancer_payloads = []
    for f in freelancers:
        user        = db.query(models.User).filter(models.User.id == f.user_id).first()
        skill_names = [fs.skill.name for fs in f.skills if fs.skill]

        # Parse JSON-stored list fields safely
        import json as _json
        def _parse_json_list(val):
            if not val:
                return []
            try:
                return _json.loads(val)
            except Exception:
                return []

        top_languages     = _parse_json_list(f.top_languages)
        sub_category_tags = _parse_json_list(f.sub_category_tags)

        # Build profile_text for TF-IDF scoring
        profile_text = " ".join(filter(None, [
            f.professional_title or "",
            f.bio or "",
            " ".join(skill_names),
            " ".join(top_languages),
        ]))

        freelancer_payloads.append({
            "freelancer_id":      f.freelancer_id,
            "user_id":            f.user_id,
            "name":               user.email.split("@")[0] if user else f"freelancer_{f.freelancer_id}",
            "email":              user.email if user else "",
            "bio":                f.bio or "",
            "professional_title": f.professional_title or "",
            "hourly_rate":        f.hourly_rate or 0,
            "success_score":      f.success_score or 0,
            "github_score":       f.github_score or 0,
            "github_url":         f.github_url or "",
            "skills":             skill_names,
            "top_languages":      top_languages,
            "sub_category_tags":  sub_category_tags,
            "profile_text":       profile_text,
            "github_stats":       {},
        })

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/match",
            json={
                "title":            project.title,
                "description":      project.description or "",
                "sub_category":     project.sub_category or "",
                "category":         project.category or "",
                "budget_min":       float(project.budget or 0),
                "budget_max":       float(project.budget or 0),
                "candidates":       freelancer_payloads,
                "top_k":            10,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data = response.json()

        # Build a lookup for email (not returned by AI service)
        payload_map = {fp["freelancer_id"]: fp for fp in freelancer_payloads}

        matches = [
            schema.FreelancerSearchResult(
                freelancer_id  = m["freelancer_id"],
                user_id        = payload_map.get(m["freelancer_id"], {}).get("user_id", 0),
                email          = payload_map.get(m["freelancer_id"], {}).get("email", ""),
                bio            = payload_map.get(m["freelancer_id"], {}).get("bio"),
                hourly_rate    = m.get("hourly_rate"),
                success_score  = payload_map.get(m["freelancer_id"], {}).get("success_score", 0),
                skills         = payload_map.get(m["freelancer_id"], {}).get("skills", []),
                ai_match_score = round(m.get("match_score", 0) * 100, 1),
            )
            for m in ai_data.get("matches", [])
        ]
        # Cache results so freelancers can see their matches in /recommend/my-matches
        try:
            db.query(models.Recommendation).filter(
                models.Recommendation.project_id == project_id
            ).delete()
            for m in ai_data.get("matches", []):
                db.add(models.Recommendation(
                    project_id    = project_id,
                    freelancer_id = m["freelancer_id"],
                    match_score   = m.get("match_score", 0),
                    text_score    = m.get("text_score", 0),
                    skill_score   = m.get("skill_score", 0),
                    quality_score = m.get("quality_score", 0),
                    matched_skills= json.dumps(m.get("matched_skills", [])),
                ))
            db.commit()
        except Exception as cache_exc:
            logger.warning("Failed to cache recommendations: %s", cache_exc)
            db.rollback()

        return schema.AIMatchResponse(project_id=project_id, matches=matches, source="ai")

    except Exception as exc:
        logger.warning("AI service unavailable for /match, using fallback. Error: %s", exc)

    fallback_matches = []
    for fp in sorted(freelancer_payloads, key=lambda x: x["success_score"], reverse=True)[:10]:
        fallback_matches.append(schema.FreelancerSearchResult(
            freelancer_id  = fp["freelancer_id"],
            user_id        = fp["user_id"],
            email          = fp["email"],
            bio            = fp.get("bio"),
            hourly_rate    = fp.get("hourly_rate"),
            success_score  = fp.get("success_score", 0),
            skills         = fp.get("skills", []),
            ai_match_score = None,
        ))
    return schema.AIMatchResponse(project_id=project_id, matches=fallback_matches, source="fallback")


@router.post(
    "/projects/{project_id}/ai-pricing",
    response_model=schema.AIPricingResponse,
    summary="AI-suggested budget range for a project",
    description="""
Calls the AI service to suggest a min/max budget. Saves to `ai_pricing` table.
Falls back to 60–90% of stated budget if AI is unavailable.
""",
)
def ai_suggest_pricing(
    project_id: int,
    me:         models.User = Depends(get_current_user),
    db:         Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    suggested_min = None
    suggested_max = None
    reasoning     = None
    source        = "ai"

    try:
        # Map budget to experience level
        budget = float(project.budget or 0)
        if budget < 300:
            experience = "Beginner"
        elif budget < 1500:
            experience = "Intermediate"
        else:
            experience = "Expert"

        # Use AI-classified category, fallback to sub_category then title
        category = project.category or project.sub_category or project.title or "Web Development"

        response = httpx.post(
            f"{AI_SERVICE_URL}/pricing/recommend",
            json={
                "category":   category,
                "experience": experience,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data       = response.json()
        suggested_min = ai_data.get("min")
        suggested_max = ai_data.get("max")
        reasoning     = (
            f"ML model prediction for '{ai_data.get('matched_category', category)}' "
            f"({ai_data.get('experience', experience)} level). "
            + ("Exact category match." if ai_data.get("exact_match")
               else f"Closest match used: '{ai_data.get('matched_category')}'.")
        )

    except Exception as exc:
        logger.warning("AI service unavailable for /pricing, using fallback. Error: %s", exc)
        suggested_min = round(float(project.budget or 0) * 0.60, 2)
        suggested_max = round(float(project.budget or 0) * 0.90, 2)
        reasoning     = "AI service unavailable. Using heuristic: 60–90% of stated budget."
        source        = "fallback"

    existing = db.query(models.AIPricing).filter(
        models.AIPricing.project_id == project_id
    ).first()
    if existing:
        existing.suggested_min = suggested_min
        existing.suggested_max = suggested_max
    else:
        db.add(models.AIPricing(
            project_id    = project_id,
            suggested_min = suggested_min,
            suggested_max = suggested_max,
        ))
    db.commit()

    return schema.AIPricingResponse(
        project_id    = project_id,
        suggested_min = suggested_min,
        suggested_max = suggested_max,
        reasoning     = reasoning,
        source        = source,
    )


@router.post(
    "/proposals/{proposal_id}/score",
    response_model=schema.AIScoreResponse,
    summary="AI relevance score for a proposal",
    description="""
**Project owner (client) or admin only.**
Scores a freelancer's proposal 0–100 by relevance. Saves to `proposals.ai_relevance_score`.
""",
)
def ai_score_proposal(
    proposal_id: int,
    me:          models.User = Depends(get_current_user),
    db:          Session     = Depends(get_db),
):
    proposal = db.query(models.Proposal).filter(
        models.Proposal.proposal_id == proposal_id
    ).first()
    if not proposal:
        raise HTTPException(404, "Proposal not found.")

    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or client.client_id != proposal.project.client_id:
            raise HTTPException(403, "You do not own this project.")

    project     = proposal.project
    freelancer  = proposal.freelancer
    skill_names = [fs.skill.name for fs in freelancer.skills if fs.skill]
    score       = None
    reasoning   = None

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/score",
            json={
                "project_title":       project.title,
                "project_description": project.description or "",
                "required_skills":     [ps.skill.name for ps in project.skills if ps.skill],
                "budget":              project.budget,
                "bid_amount":          proposal.bid_amount,
                "cover_letter":        proposal.cover_letter or "",
                "freelancer_skills":   skill_names,
                "freelancer_bio":      freelancer.bio or "",
                "success_score":       freelancer.success_score or 0,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data   = response.json()
        score     = ai_data.get("score")
        reasoning = ai_data.get("reasoning")

    except Exception as exc:
        logger.warning("AI service unavailable for /score. Error: %s", exc)
        required = {ps.skill.name.lower() for ps in project.skills if ps.skill}
        has      = {s.lower() for s in skill_names}
        overlap  = len(required & has)
        score    = round((overlap / max(len(required), 1)) * 80 + 10, 1)
        reasoning = "AI service unavailable. Score based on skill overlap."

    proposal.ai_relevance_score = score
    db.commit()

    return schema.AIScoreResponse(
        proposal_id        = proposal_id,
        ai_relevance_score = score,
        reasoning          = reasoning,
    )


@router.post(
    "/proposals/score-draft",
    response_model=DraftScoreResponse,
    summary="Score a proposal draft before submission (freelancer)",
    description="""
**Freelancer only — no proposal is created.**
Sends the draft cover letter + bid to the AI service and returns a relevance score (0.0–1.0).
`passes` is `true` when `score >= 0.40`. The submission form blocks final submission until `passes` is true.
""",
)
def score_draft_proposal(
    body: DraftScorePayload,
    me:   models.User = Depends(get_current_user),
    db:   Session     = Depends(get_db),
):
    project = db.query(models.Project).filter(
        models.Project.project_id == body.project_id
    ).first()
    if not project:
        raise HTTPException(404, "Project not found.")

    freelancer  = db.query(models.Freelancer).filter(models.Freelancer.user_id == me.id).first()
    skill_names = [fs.skill.name for fs in freelancer.skills if fs.skill] if freelancer else []
    bio          = (freelancer.bio or "") if freelancer else ""
    success_score= (freelancer.success_score or 0) if freelancer else 0

    required_skills = [ps.skill.name for ps in project.skills if ps.skill]
    score     = None
    reasoning = None

    try:
        response = httpx.post(
            f"{AI_SERVICE_URL}/score",
            json={
                "project_title":       project.title,
                "project_description": project.description or "",
                "required_skills":     required_skills,
                "budget":              project.budget,
                "bid_amount":          body.bid_amount,
                "cover_letter":        body.cover_letter,
                "freelancer_skills":   skill_names,
                "freelancer_bio":      bio,
                "success_score":       success_score,
            },
            timeout=AI_TIMEOUT,
        )
        response.raise_for_status()
        ai_data   = response.json()
        score     = float(ai_data.get("score", 0))
        reasoning = ai_data.get("reasoning", "")
    except Exception as exc:
        logger.warning("AI service unavailable for /proposals/score-draft. Error: %s", exc)
        required = {s.lower() for s in required_skills}
        has      = {s.lower() for s in skill_names}
        overlap  = len(required & has)
        score    = round((overlap / max(len(required), 1)) * 0.80 + 0.10, 2)
        reasoning = "AI service unavailable. Score estimated from skill overlap with project requirements."

    # Normalise in case the AI service returns 0–100 instead of 0–1
    if score is not None and score > 1.0:
        score = round(score / 100, 4)

    return DraftScoreResponse(
        score     = score,
        reasoning = reasoning,
        passes    = score >= PROPOSAL_SCORE_THRESHOLD,
    )


# ════════════════════════════════════════════════════════════════════
#  AI DELIVERABLE VERIFICATION
# ════════════════════════════════════════════════════════════════════

@router.post(
    "/milestones/{milestone_id}/verify-deliverable",
    response_model=schema.DeliverableVerificationResponse,
    summary="AI Verification Report for a milestone deliverable",
    description="""
**Client or admin only.**
Generates an AI Verification Report for the files submitted under this milestone's project.
The AI reviews the uploaded file list against the milestone description and project context,
then returns a verdict: `passed`, `flagged`, or `insufficient_evidence`.

The report and verdict are saved on the milestone record.
""",
)
def verify_deliverable(
    milestone_id: int,
    me:           models.User = Depends(get_current_user),
    db:           Session     = Depends(get_db),
):
    milestone = db.query(models.Milestone).filter(
        models.Milestone.milestone_id == milestone_id
    ).first()
    if not milestone:
        raise HTTPException(404, "Milestone not found.")

    contract = milestone.contract
    if not contract:
        raise HTTPException(404, "Contract not found for this milestone.")

    # Only client who owns the contract or admin may request verification
    if me.role != models.UserRole.admin:
        client = db.query(models.Client).filter(models.Client.user_id == me.id).first()
        if not client or contract.project.client_id != client.client_id:
            raise HTTPException(403, "Only the project client or admin can request AI verification.")

    project = contract.project
    files   = db.query(models.File).filter(models.File.project_id == project.project_id).all()

    files_summary = "\n".join(
        f"  - {f.original_name or 'unnamed'} ({f.file_size_kb or 0} KB)"
        for f in files
    ) if files else "  (no files uploaded)"

    prompt = (
        "You are an AI deliverable verification assistant for a freelance platform.\n"
        "Your job: review the submitted files for a project milestone and decide if the deliverable "
        "appears complete and relevant.\n\n"
        f"Project: {project.title}\n"
        f"Project description: {project.description or 'N/A'}\n\n"
        f"Milestone: {milestone.title or f'Milestone #{milestone_id}'}\n"
        f"Milestone description: {milestone.description or 'N/A'}\n"
        f"Milestone amount: ${milestone.amount:.2f}\n\n"
        f"Uploaded files:\n{files_summary}\n\n"
        "Based on the file names, types, and sizes relative to the milestone scope, provide:\n"
        "1. A one-word VERDICT on the first line: 'passed', 'flagged', or 'insufficient_evidence'\n"
        "   - passed: files appear to match the milestone requirements\n"
        "   - flagged: files are suspicious, mismatched, or raise concerns\n"
        "   - insufficient_evidence: too few or no files to make a determination\n"
        "2. A concise 2-4 sentence explanation of your verdict.\n\n"
        "Format your response EXACTLY as:\n"
        "VERDICT: <word>\n"
        "REPORT: <explanation>"
    )

    verdict = "insufficient_evidence"
    report  = "No files were submitted for this milestone."
    api_key = os.environ.get("GEMINI_API_KEY")

    if files and api_key:
        try:
            from google import genai
            client_ai = genai.Client(api_key=api_key)
            for model in _GEMINI_MODELS:
                try:
                    resp = client_ai.models.generate_content(model=model, contents=prompt)
                    raw  = resp.text.strip()
                    lines = raw.splitlines()
                    for line in lines:
                        if line.upper().startswith("VERDICT:"):
                            v = line.split(":", 1)[1].strip().lower()
                            if v in ("passed", "flagged", "insufficient_evidence"):
                                verdict = v
                        elif line.upper().startswith("REPORT:"):
                            report = line.split(":", 1)[1].strip()
                    break
                except Exception as gemini_err:
                    logger.warning("verify-deliverable: model %s failed: %s", model, gemini_err)
        except Exception as e:
            logger.error("verify-deliverable Gemini call failed: %s", e)
            # Heuristic fallback: if files exist, mark as passed with note
            verdict = "passed"
            report  = (
                f"AI service unavailable. {len(files)} file(s) detected. "
                "Manual review recommended before approving the milestone."
            )
    elif not files:
        verdict = "insufficient_evidence"
        report  = "No files have been uploaded for this project. Ask the freelancer to submit deliverables."
    else:
        # Files exist but no Gemini key — simple heuristic
        verdict = "passed" if len(files) >= 1 else "insufficient_evidence"
        report  = (
            f"{len(files)} file(s) uploaded. AI key not configured — "
            "verdict based on file presence only. Manual review recommended."
        )

    milestone.ai_verification_status = verdict
    milestone.ai_verification_report = report
    db.commit()

    notify(
        db        = db,
        user_id   = contract.freelancer.user_id,
        type      = models.NotificationType.milestone,
        title     = f"AI Verification: Milestone #{milestone_id} — {verdict}",
        body      = report[:120],
        entity_id = contract.contract_id,
    )

    return schema.DeliverableVerificationResponse(
        milestone_id           = milestone_id,
        ai_verification_status = verdict,
        ai_verification_report = report,
        files_checked          = len(files),
    )


# ════════════════════════════════════════════════════════════════════
#  DISPUTE RESOLUTION
# ════════════════════════════════════════════════════════════════════

@router.get(
    "/admin/disputes",
    response_model=list[schema.DisputeResponse],
    summary="List all disputes (admin only)",
    description="Filter by `status`: `open` or `resolved`. Default: all.",
)
def list_disputes(
    status: Optional[str] = Query(None, description="open | resolved"),
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(50, ge=1, le=200),
    admin:  models.User   = Depends(require_admin),
    db:     Session       = Depends(get_db),
):
    q = db.query(models.Dispute)
    if status:
        try:
            q = q.filter(models.Dispute.status == models.DisputeStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status '{status}'. Use: open, resolved")
    return q.order_by(models.Dispute.created_at.desc()).offset(skip).limit(limit).all()


@router.get(
    "/admin/disputes/{dispute_id}",
    response_model=schema.DisputeResponse,
    summary="Get a dispute by ID (admin only)",
)
def get_dispute(
    dispute_id: int,
    admin:      models.User = Depends(require_admin),
    db:         Session     = Depends(get_db),
):
    dispute = db.query(models.Dispute).filter(
        models.Dispute.dispute_id == dispute_id
    ).first()
    if not dispute:
        raise HTTPException(404, "Dispute not found.")
    return dispute


@router.post(
    "/admin/disputes/{dispute_id}/resolve",
    response_model=schema.MessageResponse,
    summary="Resolve a dispute (admin only)",
    description="""
Three resolution options:
- **`release_to_freelancer`** — freelancer keeps all escrowed funds
- **`refund_to_client`** — client gets a refund (simulated)
- **`split`** — requires `split_percentage` (0–100)

Notifications are sent to both parties on resolution.
""",
)
def resolve_dispute(
    dispute_id: int,
    body:       schema.DisputeResolveRequest,
    admin:      models.User = Depends(require_admin),
    db:         Session     = Depends(get_db),
):
    dispute = db.query(models.Dispute).filter(
        models.Dispute.dispute_id == dispute_id
    ).first()
    if not dispute:
        raise HTTPException(404, "Dispute not found.")
    if dispute.status == models.DisputeStatus.resolved:
        raise HTTPException(400, "This dispute is already resolved.")

    contract   = dispute.contract
    escrow     = contract.escrow
    freelancer = contract.freelancer
    escrow_amt = escrow.amount if escrow else 0.0

    if body.resolution == "release_to_freelancer":
        if escrow_amt > 0:
            freelancer.wallet_balance = (freelancer.wallet_balance or 0) + escrow_amt
            db.add(models.WalletTransaction(
                freelancer_id = freelancer.freelancer_id,
                amount        = escrow_amt,
                type          = models.TransactionType.deposit,
                description   = f"Dispute #{dispute_id} resolved — funds released to freelancer",
            ))

    elif body.resolution == "refund_to_client":
        pass  # Production: trigger payment gateway refund

    elif body.resolution == "split":
        if body.split_percentage is None:
            raise HTTPException(400, "split_percentage is required for 'split' resolution.")
        if not (0 <= body.split_percentage <= 100):
            raise HTTPException(400, "split_percentage must be between 0 and 100.")
        freelancer_share = round(escrow_amt * (body.split_percentage / 100), 2)
        if freelancer_share > 0:
            freelancer.wallet_balance = (freelancer.wallet_balance or 0) + freelancer_share
            db.add(models.WalletTransaction(
                freelancer_id = freelancer.freelancer_id,
                amount        = freelancer_share,
                type          = models.TransactionType.deposit,
                description   = (
                    f"Dispute #{dispute_id} resolved — {body.split_percentage}% "
                    f"split (${freelancer_share:.2f} to freelancer)"
                ),
            ))

    dispute.status          = models.DisputeStatus.resolved
    dispute.resolution_note = body.note
    dispute.resolved_by     = admin.id
    dispute.resolved_at     = datetime.now(timezone.utc)
    contract.status         = models.ContractStatus.completed
    contract.project.status = models.ProjectStatus.completed
    if escrow:
        escrow.status          = models.EscrowStatus.released
        escrow.released_amount = escrow_amt

    db.add(models.SystemLog(
        action       = (
            f"Admin [{admin.email}] resolved dispute #{dispute_id} "
            f"for contract #{contract.contract_id}: {body.resolution}"
        ),
        performed_by = admin.id,
    ))
    db.commit()

    # Notify freelancer
    notify(
        db        = db,
        user_id   = freelancer.user_id,
        type      = models.NotificationType.dispute,
        title     = f"Dispute #{dispute_id} resolved",
        body      = f"Resolution: {body.resolution}. {body.note}",
        entity_id = contract.contract_id,
    )
    # Notify client
    client_user_id = contract.project.client.user_id
    notify(
        db        = db,
        user_id   = client_user_id,
        type      = models.NotificationType.dispute,
        title     = f"Dispute #{dispute_id} resolved",
        body      = f"Resolution: {body.resolution}. {body.note}",
        entity_id = contract.contract_id,
    )

    return {
        "message": (
            f"Dispute #{dispute_id} resolved via '{body.resolution}'. "
            f"Contract #{contract.contract_id} marked as completed."
        )
    }


# ════════════════════════════════════════════════════════════════════
#  VERIFICATION
# ════════════════════════════════════════════════════════════════════

@router.post(
    "/verification/submit",
    response_model=schema.VerificationResponse,
    status_code=201,
    summary="Submit identity verification document",
    description="""
Upload an identity document (National ID, Passport, etc.) for review.
Only one verification per user. Resubmission overwrites a rejected one.
Accepted: **PDF, JPEG, PNG** — max **5 MB**.
""",
)
async def submit_verification(
    document_type: str        = Query(..., description="e.g. 'national_id', 'passport', 'drivers_license'"),
    file:          UploadFile = File(..., description="ID document (PDF/JPEG/PNG, max 5MB)"),
    me:            models.User = Depends(get_current_user),
    db:            Session     = Depends(get_db),
):
    ALLOWED = {"application/pdf", "image/jpeg", "image/png"}
    if file.content_type not in ALLOWED:
        raise HTTPException(400, "Only PDF, JPEG, or PNG files are accepted for verification.")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(400, "Document too large. Maximum is 5 MB.")

    ext      = (file.filename or "doc").rsplit(".", 1)[-1].lower()
    filename = f"verify_{me.id}_{int(datetime.now().timestamp())}.{ext}"
    save_dir = os.path.join(UPLOAD_DIR, "verification")
    os.makedirs(save_dir, exist_ok=True)

    async with aiofiles.open(os.path.join(save_dir, filename), "wb") as f:
        await f.write(contents)

    doc_path = f"/uploads/verification/{filename}"

    existing = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()

    if existing:
        if existing.status == models.VerificationStatus.approved:
            raise HTTPException(400, "Your account is already verified.")
        existing.document_type  = document_type
        existing.document_path  = doc_path
        existing.status         = models.VerificationStatus.pending
        existing.rejection_note = None
        existing.reviewed_by    = None
        existing.reviewed_at    = None
        verification = existing
    else:
        verification = models.Verification(
            user_id       = me.id,
            document_type = document_type,
            document_path = doc_path,
            status        = models.VerificationStatus.pending,
        )
        db.add(verification)

    db.commit()
    db.refresh(verification)
    return verification


@router.get(
    "/verification/status",
    summary="Check your verification status",
)
def my_verification_status(
    me: models.User = Depends(get_current_user),
    db: Session     = Depends(get_db),
):
    v = db.query(models.Verification).filter(
        models.Verification.user_id == me.id
    ).first()
    if not v:
        return {
            "status":          "not_submitted",
            "document_type":   None,
            "document_path":   None,
            "rejection_note":  None,
            "reviewed_by":     None,
            "reviewed_at":     None,
            "created_at":      None,
            "verification_id": None,
            "user_id":         me.id,
        }
    return v


@router.delete(
    "/verification/cancel",
    summary="Cancel a pending verification submission",
)
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


@router.get(
    "/admin/verification",
    response_model=list[schema.VerificationResponse],
    summary="List all verification requests (admin only)",
    description="Default: pending only. Pass `status=approved` or `status=rejected` to filter.",
)
def list_verifications(
    status: Optional[str] = Query("pending", description="pending | approved | rejected"),
    skip:   int           = Query(0,  ge=0),
    limit:  int           = Query(50, ge=1, le=200),
    admin:  models.User   = Depends(require_admin),
    db:     Session       = Depends(get_db),
):
    q = db.query(models.Verification)
    if status:
        try:
            q = q.filter(models.Verification.status == models.VerificationStatus(status))
        except ValueError:
            raise HTTPException(400, f"Invalid status '{status}'. Use: pending, approved, rejected")
    return q.order_by(models.Verification.created_at.asc()).offset(skip).limit(limit).all()


@router.patch(
    "/admin/verification/{verification_id}",
    response_model=schema.VerificationResponse,
    summary="Approve or reject a verification (admin only)",
)
def review_verification(
    verification_id: int,
    body:            schema.VerificationReviewRequest,
    admin:           models.User = Depends(require_admin),
    db:              Session     = Depends(get_db),
):
    v = db.query(models.Verification).filter(
        models.Verification.verification_id == verification_id
    ).first()
    if not v:
        raise HTTPException(404, "Verification not found.")
    if v.status != models.VerificationStatus.pending:
        raise HTTPException(400, f"Verification is already '{v.status.value}'.")

    if body.action == "approve":
        v.status = models.VerificationStatus.approved
    else:
        if not body.rejection_note:
            raise HTTPException(400, "rejection_note is required when rejecting.")
        v.status         = models.VerificationStatus.rejected
        v.rejection_note = body.rejection_note

    v.reviewed_by = admin.id
    v.reviewed_at = datetime.now(timezone.utc)

    db.add(models.SystemLog(
        action       = f"Admin [{admin.email}] {body.action}d verification #{verification_id}",
        performed_by = admin.id,
    ))
    db.commit()
    db.refresh(v)

    # ── Phase 5: notify the user about their verification outcome ──
    if body.action == "approve":
        notify(
            db        = db,
            user_id   = v.user_id,
            type      = models.NotificationType.verification,
            title     = "Identity verification approved ✓",
            body      = "Your account is now verified.",
            entity_id = v.verification_id,
        )
    else:
        notify(
            db        = db,
            user_id   = v.user_id,
            type      = models.NotificationType.verification,
            title     = "Identity verification rejected",
            body      = f"Reason: {body.rejection_note}. Please resubmit.",
            entity_id = v.verification_id,
        )