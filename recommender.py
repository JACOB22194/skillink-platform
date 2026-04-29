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
    top3_predictions: list  = None          # kept for API compat, not used in scoring

    def __post_init__(self):
        if self.top3_predictions is None:
            self.top3_predictions = [(self.sub_category, 1.0)]

    @property
    def query_text(self) -> str:
        return f"{self.title}. {self.description}"


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
        """Keyword-match the job text against the platform skill taxonomy."""
        text     = (job.title + " " + job.description).lower()
        keywords = SkillinkRecommender._get_skill_keywords()
        found    = set()
        for kw in keywords:
            if re.search(r"\b" + re.escape(kw) + r"\b", text):
                found.add(kw)
        return found

    @staticmethod
    def _skill_scores(
        job_skills: set[str],
        candidates: list[FreelancerCandidate],
    ) -> tuple[np.ndarray, list[list[str]]]:
        """
        Intersection of job-required skills with freelancer skills + languages.
        score = |overlap| / max(|job_skills|, 1), capped at 1.0.
        """
        if not job_skills:
            return np.zeros(len(candidates)), [[] for _ in candidates]

        scores, matched = [], []
        for c in candidates:
            c_skills = {s.lower() for s in c.skills}
            c_skills.update(lang.lower() for lang in c.top_languages)
            overlap = job_skills & c_skills
            scores.append(min(len(overlap) / max(len(job_skills), 1), 1.0))
            matched.append(sorted(overlap))

        return np.array(scores), matched

    # ── Dimension 3: Quality bonus ────────────────────────────────────────────

    @staticmethod
    def _quality_scores(candidates: list[FreelancerCandidate]) -> np.ndarray:
        """
        GitHub score when available (0-100 → 0-1).
        Falls back to platform success_score, then to 0.5 (neutral unknown).
        Freelancers without GitHub are not penalised — they receive a neutral bonus.
        """
        scores = []
        for c in candidates:
            if c.github_score > 0:
                scores.append(min(c.github_score / 100.0, 1.0))
            elif c.success_score > 0:
                scores.append(min(float(c.success_score), 1.0))
            else:
                scores.append(0.5)
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
    ) -> list[MatchResult]:
        """
        Score all candidates against the job and return the top_k results.

        Every candidate is scored independently — no pre-filter exclusions.
        Ranking is purely by final match_score.
        """
        if not candidates:
            return []

        semantic_arr            = self._semantic_scores(job, candidates)
        job_skills              = self._extract_job_skills(job)
        skill_arr, matched_list = self._skill_scores(job_skills, candidates)
        quality_arr             = self._quality_scores(candidates)

        final = (
            W_SEMANTIC * semantic_arr +
            W_SKILL    * skill_arr    +
            W_QUALITY  * quality_arr
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
