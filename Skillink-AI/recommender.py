"""
recommender.py  (AI service — FastAPI microservice)
────────────────────────────────────────────────────
Production matching engine for Skillink.

Architecture: Semantic Embedding + Skill Overlap + Quality Signal

  match_score = 0.55 × semantic_similarity   ← sentence-transformers cosine
              + 0.30 × skill_overlap          ← exact skill keyword match
              + 0.15 × quality_bonus          ← GitHub score (optional bonus)

Key design decisions:
  - No multiplicative gates. Every profile is scored on its merits.
  - GitHub is a quality bonus, not a requirement. A freelancer with only a
    bio and title still participates fully in semantic scoring.
  - Sentence embeddings understand synonyms and context — "digital marketing"
    matches "online advertising", "social media campaigns", "email outreach".
  - quality_bonus defaults to 0.5 (neutral) when no GitHub data exists, so
    unverified freelancers are not penalised into invisibility.
  - Collaborative boost stub preserved for Phase 2 (hire-history data).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity as sk_cosine

# ── Load embedding model once at import time ──────────────────────────────────
# First call downloads ~80 MB to the HuggingFace cache; subsequent starts are
# instant from disk.  all-MiniLM-L6-v2 is 22M params, scores ~68 on MTEB,
# latency ~5 ms per batch on CPU — the right tradeoff for a matching engine.
try:
    from sentence_transformers import SentenceTransformer
    _ENCODER: Optional[SentenceTransformer] = SentenceTransformer("all-MiniLM-L6-v2")
    _SEMANTIC = True
except Exception:
    # Graceful TF-IDF fallback if sentence-transformers is not installed yet
    _ENCODER = None
    _SEMANTIC = False

# ── Scoring weights ───────────────────────────────────────────────────────────
W_SEMANTIC = 0.55
W_SKILL    = 0.30
W_QUALITY  = 0.15

# Minimum final score to include in results.
# With semantic embeddings, unrelated texts score ~0.10-0.15, so 0.20 cuts noise
# while keeping genuinely relevant candidates (typically 0.35+).
MIN_SCORE = 0.15


# ── Data contracts ────────────────────────────────────────────────────────────

@dataclass
class JobInput:
    title:            str
    description:      str
    sub_category:     str
    category:         str
    budget_min:       float = 0.0
    budget_max:       float = 0.0
    required_skills:  list  = None          # explicit skills set by the client on the project
    top3_predictions: list  = None          # kept for API compat, not used in scoring

    def __post_init__(self):
        if self.required_skills is None:
            self.required_skills = []
        if self.top3_predictions is None:
            self.top3_predictions = [(self.sub_category, 1.0)]

    @property
    def query_text(self) -> str:
        skills_str = " ".join(self.required_skills) if self.required_skills else ""
        return f"{self.title}. {self.description} {skills_str}".strip()


@dataclass
class FreelancerCandidate:
    freelancer_id:      int
    user_id:            int
    name:               str
    professional_title: str
    bio:                str
    hourly_rate:        float
    success_score:      float
    github_score:       int
    github_url:         str
    skills:             list[str]
    top_languages:      list[str]
    sub_category_tags:  list[str]
    profile_text:       str        # full GitHub-parsed text when available
    github_stats:       dict

    @property
    def full_profile(self) -> str:
        """
        Complete text document fed into the embedding model.
        Combines every signal available — title, bio, explicit skills,
        programming languages, and the raw GitHub profile text when present.
        Deduplicates at the string level so repeated blocks don't double-count.
        """
        seen  = set()
        parts = []
        for block in [
            self.professional_title or "",
            self.bio or "",
            " ".join(self.skills),
            " ".join(self.top_languages),
            self.profile_text or "",
        ]:
            block = block.strip()
            if block and block not in seen:
                parts.append(block)
                seen.add(block)
        return " ".join(parts)


@dataclass
class MatchResult:
    freelancer_id:      int
    name:               str
    professional_title: str
    github_url:         str
    hourly_rate:        float
    github_score:       int
    match_score:        float
    text_score:         float
    skill_score:        float
    quality_score:      float
    activity_score:     float
    classifier_weight:  float
    matched_on:         str
    matched_skills:     list[str]
    sub_category_tags:  list[str]
    explanation:        str


# ── Core engine ───────────────────────────────────────────────────────────────

class SkillinkRecommender:
    """
    Stateless scoring engine.
    Instantiated once in ai_match_endpoint.py — no shared mutable state.
    """

    _SKILL_KEYWORDS: set | None = None

    @classmethod
    def _get_skill_keywords(cls) -> set:
        if cls._SKILL_KEYWORDS is None:
            try:
                from skill_subcategory_map import SKILL_TO_SUBCATEGORY
                cls._SKILL_KEYWORDS = set(SKILL_TO_SUBCATEGORY.keys())
            except ImportError:
                cls._SKILL_KEYWORDS = set()
        return cls._SKILL_KEYWORDS

    # ── Dimension 1: Semantic similarity ─────────────────────────────────────

    @staticmethod
    def _semantic_scores(
        job: JobInput,
        candidates: list[FreelancerCandidate],
    ) -> np.ndarray:
        """
        Cosine similarity between the job embedding and each candidate's
        full-profile embedding.

        sentence-transformers path: understands synonyms and semantic context.
        TF-IDF fallback: keyword overlap only (weaker but functional).
        """
        if not candidates:
            return np.array([])

        if _SEMANTIC and _ENCODER is not None:
            job_vec   = _ENCODER.encode(job.query_text, normalize_embeddings=True)
            cand_txts = [c.full_profile or c.professional_title or c.name
                         for c in candidates]
            cand_vecs = _ENCODER.encode(
                cand_txts, normalize_embeddings=True, batch_size=64, show_progress_bar=False
            )
            # Normalized vectors → dot product == cosine similarity
            scores = (cand_vecs @ job_vec).astype(float)
            return np.clip(scores, 0.0, 1.0)

        # TF-IDF fallback ─────────────────────────────────────────────────────
        corpus = [job.query_text] + [
            c.full_profile or c.professional_title or c.name for c in candidates
        ]
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            tfidf  = TfidfVectorizer(
                max_features=5000, stop_words="english",
                ngram_range=(1, 2), sublinear_tf=True, min_df=1,
            )
            mat    = tfidf.fit_transform(corpus)
            scores = sk_cosine(mat[0], mat[1:])[0]
            return np.clip(scores.astype(float), 0.0, 1.0)
        except ValueError:
            return np.zeros(len(candidates))

    # ── Dimension 2: Skill overlap ────────────────────────────────────────────

    @staticmethod
    def _extract_job_skills(job: JobInput) -> set[str]:
        """
        Merge two sources of job skills:
        1. Explicit required_skills set by the client on the project (highest signal).
        2. Keyword-match the job title+description against the platform skill taxonomy.
        """
        # Explicit skills stored in the project — always included
        explicit = {s.lower() for s in (job.required_skills or [])}

        # Taxonomy extraction from free text
        text     = (job.title + " " + job.description).lower()
        keywords = SkillinkRecommender._get_skill_keywords()
        found    = set()
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", text):
                found.add(kw)

        return explicit | found

    @staticmethod
    def _skill_scores(
        job_skills: set[str],
        candidates: list[FreelancerCandidate],
    ) -> tuple[np.ndarray, list[list[str]]]:
        """
        Two-path scoring:
        - When job_skills is non-empty: coverage × depth bonus (log-scaled).
        - When job_skills is empty: skill-count breadth proxy, capped at 0.6
          so it never outweighs a direct skill match from a job that has skills.
        """
        scores, matched = [], []
        for c in candidates:
            c_skills = {s.lower() for s in c.skills}
            c_skills.update(lang.lower() for lang in c.top_languages)

            if job_skills:
                overlap  = job_skills & c_skills
                coverage = len(overlap) / len(job_skills)
                # Depth: log-scaled so 5 matching skills ≈ max bonus
                depth    = min(np.log1p(len(overlap)) / np.log1p(5), 1.0)
                score    = min(0.65 * coverage + 0.35 * float(depth), 1.0)
                matched.append(sorted(overlap))
            else:
                # No explicit job skills — use skill count as domain-expertise proxy.
                # 12 skills → max (0.9). Strongly rewards broad senior profiles when
                # the client hasn't specified required skills.
                score = min(len(c_skills) / 12.0, 0.9)
                matched.append([])

            scores.append(score)

        return np.array(scores), matched

    # ── Dimension 3: Quality bonus ────────────────────────────────────────────

    @staticmethod
    def _quality_scores(candidates: list[FreelancerCandidate]) -> np.ndarray:
        """
        Blends two signals (60 / 40):
        - Profile quality: GitHub score (0-100 → 0-1), success_score, or 0.5 neutral.
        - Skill diversity: log-scaled count of unique skills + languages.
          log1p(n) / log1p(30) → ~0.07 at 1 skill, ~0.58 at 15, 1.0 at 30+.
          Rewards professional breadth without letting pure quantity dominate.
        """
        scores = []
        for c in candidates:
            if c.github_score > 0:
                q = min(c.github_score / 100.0, 1.0)
            elif c.success_score > 0:
                q = min(float(c.success_score), 1.0)
            else:
                q = 0.5

            n_skills      = len(c.skills) + len(c.top_languages)
            skill_div     = min(float(np.log1p(n_skills) / np.log1p(30)), 1.0)
            scores.append(0.60 * q + 0.40 * skill_div)

        return np.array(scores)

    # ── Explanation ───────────────────────────────────────────────────────────

    @staticmethod
    def _explain(
        c: FreelancerCandidate,
        matched_skills: list[str],
        semantic_score: float,
        skill_score: float,
    ) -> str:
        parts = []
        if matched_skills:
            skill_str = ", ".join(matched_skills[:4])
            if len(matched_skills) > 4:
                skill_str += f" and {len(matched_skills) - 4} more"
            parts.append(f"Matched skills: {skill_str}")
        if skill_score >= 0.5:
            parts.append("High skill overlap with job requirements")
        elif skill_score >= 0.2:
            parts.append("Partial skill match with job requirements")
        if semantic_score >= 0.60:
            parts.append("Strong semantic alignment with the job description")
        elif semantic_score >= 0.35:
            parts.append("Good relevance to job requirements")
        if c.github_score >= 70:
            parts.append(f"High-quality GitHub profile ({c.github_score}/100)")
        elif c.github_score >= 40:
            parts.append(f"Active GitHub profile ({c.github_score}/100)")
        if not parts:
            parts.append("Profile shows relevant background for this project")
        return ". ".join(parts) + "."

    # ── Main entry point ──────────────────────────────────────────────────────

    def recommend(
        self,
        job: JobInput,
        candidates: list[FreelancerCandidate],
        top_k: int = 10,
        weights: dict = None,
    ) -> list[MatchResult]:
        """
        Score all candidates against the job and return the top_k results.

        Every candidate is scored independently — no pre-filter exclusions.
        Ranking is purely by final match_score.
        """
        if not candidates:
            return []

        # Use admin-configured weights when provided; fall back to module defaults.
        w = weights or {}
        w_skill    = float(w.get("skill_weight",  W_SKILL))
        w_quality  = float(w.get("rating_weight", W_QUALITY))
        w_semantic = max(0.0, 1.0 - w_skill - w_quality)

        semantic_arr            = self._semantic_scores(job, candidates)
        job_skills              = self._extract_job_skills(job)
        skill_arr, matched_list = self._skill_scores(job_skills, candidates)
        quality_arr             = self._quality_scores(candidates)

        # When the job has no explicit skills, MiniLM semantic similarity is a weak
        # signal (all profiles score ~0.30-0.40 for generic titles like "Smart
        # Talent Matching System").  Shift weight to skill breadth + quality, which
        # better differentiate a 40-skill senior from a 4-skill junior.
        if not job_skills:
            w_semantic_eff = max(0.0, w_semantic - 0.20)   # 0.55 → 0.35
            w_skill_eff    = min(1.0, w_skill   + 0.15)    # 0.30 → 0.45
            w_quality_eff  = min(1.0, w_quality + 0.05)    # 0.15 → 0.20
        else:
            w_semantic_eff = w_semantic
            w_skill_eff    = w_skill
            w_quality_eff  = w_quality

        final = (
            w_semantic_eff * semantic_arr +
            w_skill_eff    * skill_arr    +
            w_quality_eff  * quality_arr
        )

        results: list[MatchResult] = []
        for i, (cand, score) in enumerate(zip(candidates, final)):
            if score < MIN_SCORE:
                continue
            results.append(MatchResult(
                freelancer_id      = cand.freelancer_id,
                name               = cand.name,
                professional_title = cand.professional_title,
                github_url         = cand.github_url,
                hourly_rate        = cand.hourly_rate,
                github_score       = cand.github_score,
                match_score        = round(float(score),           4),
                text_score         = round(float(semantic_arr[i]), 4),
                skill_score        = round(float(skill_arr[i]),    4),
                quality_score      = round(float(quality_arr[i]),  4),
                activity_score     = 0.0,       # reserved for Phase 2
                classifier_weight  = 1.0,       # kept for API compat
                matched_on         = "",        # kept for API compat
                matched_skills     = matched_list[i],
                sub_category_tags  = cand.sub_category_tags,
                explanation        = self._explain(
                    cand, matched_list[i], semantic_arr[i], skill_arr[i],
                ),
            ))

        results.sort(key=lambda r: r.match_score, reverse=True)
        return results[:top_k]

    # ── Collaborative boost (Phase 2) ─────────────────────────────────────────

    def _collaborative_boost(
        self,
        results: list[MatchResult],
        hire_history: list[dict],
        job: JobInput,
    ) -> list[MatchResult]:
        """
        Boost freelancers with a proven track record in this job's sub-category.
        No-op until hire_history data is available (500+ records recommended).
        """
        if not hire_history:
            return results

        success_map: dict[int, float] = {}
        total_map:   dict[int, int]   = {}
        for rec in hire_history:
            if rec.get("sub_category") != job.sub_category:
                continue
            fid = rec["freelancer_id"]
            total_map[fid] = total_map.get(fid, 0) + 1
            if rec.get("success"):
                success_map[fid] = success_map.get(fid, 0) + 1

        for r in results:
            if r.freelancer_id in total_map:
                total   = total_map[r.freelancer_id]
                success = success_map.get(r.freelancer_id, 0)
                boost   = 0.10 * (success / total)
                r.match_score = min(r.match_score + boost, 1.0)

        results.sort(key=lambda r: r.match_score, reverse=True)
        return results
