"""
recommender.py  (AI service — FastAPI microservice at :8001)
─────────────────────────────────────────────────────────────
Hybrid Recommender for Skillink.
Stage 2 in the pipeline: Classify → MATCH → Price → Trust

Architecture: Content-Based Filtering (day-one, no hire history)
Upgrades to Hybrid once hire data accumulates (Section: _collaborative_boost)

Scoring formula:
  final_score = classifier_weight × (
      0.45 × text_similarity
    + 0.30 × skill_overlap
    + 0.15 × quality_score
    + 0.10 × activity_score
  )

  classifier_weight : probability of the sub-category the freelancer matched on.
                      Top-1 match (prob ~0.56) outscores a top-3 match (prob ~0.11),
                      but top-3 candidates are NOT excluded — they stay in the pool.
  text_similarity   : cosine(TF-IDF(job), TF-IDF(freelancer_profile_text))
  skill_overlap     : |job_required_skills ∩ freelancer_skills| / max(|job_skills|, 1)
  quality_score     : github_score / 100  (capped at 1.0)
  activity_score    : log1p(total_stars + public_repos) / 10  (capped at 1.0)

Pre-filter: soft top-3 (not hard top-1).
  The classifier returns 3 sub-category predictions with probabilities.
  A candidate is included if they match ANY of the 3.
  Their classifier_weight = the probability of whichever prediction they matched.
  This means a wrong top-1 never produces an empty pool — 95.5% top-3 coverage.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import normalize


# ── Scoring weights ───────────────────────────────────────────────────────────
W_TEXT    = 0.45
W_SKILL   = 0.30
W_QUALITY = 0.15
W_ACTIVITY= 0.10

# Minimum score to include in results (filters obviously wrong matches)
MIN_SCORE = 0.05

# ── Data contracts ────────────────────────────────────────────────────────────

@dataclass
class JobInput:
    """What comes from the classifier + raw job post."""
    title:        str
    description:  str
    sub_category: str          # top-1 prediction from classifier
    category:     str          # top-1 parent category
    budget_min:   float = 0.0
    budget_max:   float = 0.0
    # Top-3 predictions with probabilities  [(sub_cat, prob), ...]
    # Populated by the classifier endpoint — fallback to top-1 only if absent.
    top3_predictions: list[tuple[str, float]] = None

    def __post_init__(self):
        # If caller did not supply top3, synthesise a single-entry list from top-1.
        # Probability 1.0 means "we have no alternatives — trust the single label".
        if self.top3_predictions is None:
            self.top3_predictions = [(self.sub_category, 1.0)]

    @property
    def query_text(self) -> str:
        """Text document to match against freelancer profiles.
        Weights the top-3 sub-categories by their predicted probability,
        so the strongest signal gets the most TF-IDF repetitions.
        """
        # Repeat each sub-category proportional to its probability (1–3 times)
        weighted_cats = []
        for sub_cat, prob in self.top3_predictions:
            reps = max(1, round(prob * 3))
            weighted_cats.extend([sub_cat] * reps)
        return " ".join(weighted_cats) + f" {self.title} {self.description}"


@dataclass
class FreelancerCandidate:
    """One row from the freelancers table."""
    freelancer_id:      int
    user_id:            int
    name:               str
    professional_title: str
    bio:                str
    hourly_rate:        float
    success_score:      float      # platform-calculated (0–1 when available)
    github_score:       int        # from GitHub parser (0–100)
    github_url:         str
    skills:             list[str]  # flat name list from freelancer_skills join
    top_languages:      list[str]  # from github_stats
    sub_category_tags:  list[str]  # pre-computed at parse time
    profile_text:       str        # concatenated document for TF-IDF
    github_stats:       dict       # full stats JSON


@dataclass
class MatchResult:
    """One ranked result returned to the frontend."""
    freelancer_id:      int
    name:               str
    professional_title: str
    github_url:         str
    hourly_rate:        float
    github_score:       int
    match_score:        float        # 0–1 final weighted score
    text_score:         float
    skill_score:        float
    quality_score:      float
    activity_score:     float
    classifier_weight:  float        # probability of sub-category this candidate matched on
    matched_on:         str          # which sub-category triggered the match
    matched_skills:     list[str]    # skills that overlap with job requirements
    sub_category_tags:  list[str]
    explanation:        str          # human-readable "Why this freelancer"


# ── Core recommender ──────────────────────────────────────────────────────────

class SkillinkRecommender:
    """
    Stateless scoring engine.
    Instantiated once per request — no shared mutable state.
    """

    # Skill extraction: simple keyword match against the SKILL_TO_SUBCATEGORY keys
    # Imported lazily to avoid circular import if used inside AI service
    _SKILL_KEYWORDS: set[str] | None = None

    @classmethod
    def _get_skill_keywords(cls) -> set[str]:
        if cls._SKILL_KEYWORDS is None:
            try:
                from skill_subcategory_map import SKILL_TO_SUBCATEGORY
                cls._SKILL_KEYWORDS = set(SKILL_TO_SUBCATEGORY.keys())
            except ImportError:
                cls._SKILL_KEYWORDS = set()
        return cls._SKILL_KEYWORDS

    # ── Step 1: Soft pre-filter (top-3, not hard top-1) ──────────────────────

    @staticmethod
    def _soft_filter(
        candidates: list[FreelancerCandidate],
        job: JobInput,
    ) -> tuple[list[FreelancerCandidate], list[float], list[str]]:
        """
        Include any candidate who matches ANY of the top-3 predicted sub-categories.
        Assign each matched candidate the probability of whichever prediction
        they matched on — this becomes their classifier_weight in the final score.

        A candidate who matches top-1 (prob ~0.56) is weighted higher than one
        who only matches top-3 (prob ~0.11), but the top-3 candidate is NOT
        excluded — they appear in the pool, ranked lower.

        Falls back to category-level matching, then to all candidates,
        so the pool is never empty.

        Returns:
            filtered          : list of candidates that passed the filter
            classifier_weights: parallel array of [0, 1] weights
            matched_on        : parallel array of sub-category names matched
        """
        filtered:   list[FreelancerCandidate] = []
        weights:    list[float]               = []
        matched_on: list[str]                 = []

        for c in candidates:
            c_tags_lower = {tag.lower() for tag in c.sub_category_tags}
            best_prob  = 0.0
            best_label = ""
            # Walk top-3 in order — first match wins (highest prob wins)
            for sub_cat, prob in job.top3_predictions:
                if sub_cat.lower() in c_tags_lower:
                    best_prob  = prob
                    best_label = sub_cat
                    break
            if best_prob > 0.0:
                filtered.append(c)
                weights.append(best_prob)
                matched_on.append(best_label)

        # Fallback 1: category-level match (when no sub-category tags match)
        if not filtered:
            cat_lower = job.category.lower()
            for c in candidates:
                c_tags_lower = {tag.lower() for tag in c.sub_category_tags}
                if any(cat_lower in tag or tag in cat_lower for tag in c_tags_lower):
                    filtered.append(c)
                    weights.append(0.20)      # low weight — category match only
                    matched_on.append(job.category)

        # Fallback 2: return everyone (new platform, no tags yet)
        if not filtered:
            filtered   = list(candidates)
            weights    = [0.10] * len(candidates)
            matched_on = [""] * len(candidates)

        return filtered, weights, matched_on

    # ── Step 2: TF-IDF text similarity ───────────────────────────────────────

    @staticmethod
    def _text_scores(
        job: JobInput,
        candidates: list[FreelancerCandidate],
    ) -> np.ndarray:
        """
        Fit a TF-IDF matrix on job + all candidate profile texts,
        then compute cosine similarity between the job query and each candidate.

        Returns array of shape (len(candidates),) with values in [0, 1].
        """
        if not candidates:
            return np.array([])

        # Build corpus: index 0 = job, rest = freelancers
        corpus = [job.query_text] + [c.profile_text or "" for c in candidates]

        # Same vectoriser config as the classifier for vocabulary consistency
        tfidf = TfidfVectorizer(
            max_features  = 5000,
            stop_words    = "english",
            ngram_range   = (1, 2),
            sublinear_tf  = True,
            min_df        = 1,       # min_df=1 because corpus is tiny per request
            max_df        = 0.95,
        )
        try:
            matrix = tfidf.fit_transform(corpus)
        except ValueError:
            # Corpus too sparse (all empty strings) — return zeros
            return np.zeros(len(candidates))

        # matrix[0] = job vector, matrix[1:] = freelancer vectors
        job_vec        = matrix[0]
        freelancer_mat = matrix[1:]

        scores = cosine_similarity(job_vec, freelancer_mat)[0]
        return scores

    # ── Step 3: Skill overlap ─────────────────────────────────────────────────

    @staticmethod
    def _extract_job_skills(job: JobInput) -> set[str]:
        """
        Extract technology/skill keywords from the job description
        using the same keyword list as the profile ingestion pipeline.
        """
        text = (job.title + " " + job.description).lower()
        keywords = SkillinkRecommender._get_skill_keywords()
        found = set()
        for kw in keywords:
            # Word-boundary match to avoid "r" matching "framework"
            if re.search(r"\b" + re.escape(kw) + r"\b", text):
                found.add(kw)
        return found

    @staticmethod
    def _skill_scores(
        job_skills: set[str],
        candidates: list[FreelancerCandidate],
    ) -> tuple[np.ndarray, list[list[str]]]:
        """
        Compute skill overlap score and matched skill list for each candidate.
        Returns (scores array, matched_skills list of lists).
        """
        if not job_skills:
            return np.zeros(len(candidates)), [[] for _ in candidates]

        scores  = []
        matched = []
        for c in candidates:
            c_skills = {s.lower() for s in c.skills}
            c_skills.update(lang.lower() for lang in c.top_languages)
            overlap  = job_skills & c_skills
            score    = len(overlap) / max(len(job_skills), 1)
            scores.append(min(score, 1.0))
            matched.append(sorted(overlap))

        return np.array(scores), matched

    # ── Step 4: Quality + Activity ────────────────────────────────────────────

    @staticmethod
    def _quality_scores(candidates: list[FreelancerCandidate]) -> np.ndarray:
        """github_score / 100, capped at 1.0."""
        return np.array([min(c.github_score / 100.0, 1.0) for c in candidates])

    @staticmethod
    def _activity_scores(candidates: list[FreelancerCandidate]) -> np.ndarray:
        """log1p(total_stars + public_repos) / 10, capped at 1.0."""
        scores = []
        for c in candidates:
            stats      = c.github_stats or {}
            stars      = stats.get("total_stars", 0)
            repos      = stats.get("public_repos", 0)
            raw        = np.log1p(stars + repos) / 10.0
            scores.append(min(raw, 1.0))
        return np.array(scores)

    # ── Step 5: Explanation ───────────────────────────────────────────────────

    @staticmethod
    def _explain(
        candidate: FreelancerCandidate,
        matched_skills: list[str],
        text_score: float,
        skill_score: float,
        classifier_weight: float = 1.0,
        matched_on: str = "",
    ) -> str:
        parts = []
        if matched_skills:
            skill_str = ", ".join(matched_skills[:4])
            if len(matched_skills) > 4:
                skill_str += f" and {len(matched_skills)-4} more"
            parts.append(f"Matched skills: {skill_str}")
        if text_score > 0.3:
            parts.append("Strong profile-to-job text alignment")
        if candidate.github_score >= 70:
            parts.append(f"High-quality GitHub profile (score {candidate.github_score}/100)")
        elif candidate.github_score >= 40:
            parts.append(f"Active GitHub profile (score {candidate.github_score}/100)")
        # Surface when match came from a lower-confidence prediction
        if classifier_weight < 0.3 and matched_on:
            parts.append(f"Matched via alternative category: {matched_on}")
        if not parts:
            parts.append("Profile language overlap with job requirements")
        return ". ".join(parts) + "."

    # ── Main entry point ──────────────────────────────────────────────────────

    def recommend(
        self,
        job: JobInput,
        candidates: list[FreelancerCandidate],
        top_k: int = 10,
    ) -> list[MatchResult]:
        """
        Score all candidates against the job and return top_k results.

        Args:
            job:        Job input with classifier output + top3_predictions attached
            candidates: All freelancers from DB (pre-loaded by the router)
            top_k:      Max results to return

        Returns:
            Ranked list of MatchResult, best first.
            Candidates matched on top-1 naturally outscore those matched on top-3
            because classifier_weight multiplies the entire score.
        """
        if not candidates:
            return []

        # ── Soft pre-filter: top-3 sub-categories ────────────────────────────
        filtered, clf_weights, matched_on_list = self._soft_filter(candidates, job)

        # ── Compute four score dimensions ─────────────────────────────────────
        text_arr              = self._text_scores(job, filtered)
        job_skills            = self._extract_job_skills(job)
        skill_arr, matched_list = self._skill_scores(job_skills, filtered)
        quality_arr           = self._quality_scores(filtered)
        activity_arr          = self._activity_scores(filtered)
        clf_arr               = np.array(clf_weights)

        # ── Weighted sum × classifier confidence ─────────────────────────────
        # clf_arr acts as a per-candidate prior: a candidate who only matched
        # the 3rd prediction (prob ~0.11) scores ~5× lower than one who matched
        # the top prediction (prob ~0.56), all else equal.
        content_score = (
            W_TEXT     * text_arr     +
            W_SKILL    * skill_arr    +
            W_QUALITY  * quality_arr  +
            W_ACTIVITY * activity_arr
        )
        final = clf_arr * content_score

        # ── Build results ─────────────────────────────────────────────────────
        results: list[MatchResult] = []
        for i, (cand, score) in enumerate(zip(filtered, final)):
            if score < MIN_SCORE:
                continue
            results.append(MatchResult(
                freelancer_id      = cand.freelancer_id,
                name               = cand.name,
                professional_title = cand.professional_title,
                github_url         = cand.github_url,
                hourly_rate        = cand.hourly_rate,
                github_score       = cand.github_score,
                match_score        = round(float(score),              4),
                text_score         = round(float(text_arr[i]),        4),
                skill_score        = round(float(skill_arr[i]),       4),
                quality_score      = round(float(quality_arr[i]),     4),
                activity_score     = round(float(activity_arr[i]),    4),
                classifier_weight  = round(float(clf_arr[i]),         4),
                matched_on         = matched_on_list[i],
                matched_skills     = matched_list[i],
                sub_category_tags  = cand.sub_category_tags,
                explanation        = self._explain(
                    cand, matched_list[i], text_arr[i], skill_arr[i],
                    clf_arr[i], matched_on_list[i],
                ),
            ))

        # Sort descending by match_score, return top_k
        results.sort(key=lambda r: r.match_score, reverse=True)
        return results[:top_k]

    # ── Collaborative boost (Phase 2 — enable when hire data exists) ──────────

    def _collaborative_boost(
        self,
        results: list[MatchResult],
        hire_history: list[dict],   # [{freelancer_id, sub_category, success}]
        job: JobInput,
    ) -> list[MatchResult]:
        """
        Phase 2: After 500+ hire records, boost scores for freelancers
        who were previously hired successfully for the same sub-category.

        Boost formula:
            boost = 0.1 × (successes_in_subcategory / total_hires_in_subcategory)
            new_score = min(old_score + boost, 1.0)

        Currently a no-op — called but does nothing until hire data exists.
        Enable by passing actual hire_history from the DB.
        """
        if not hire_history:
            return results

        # Count successes per freelancer in this sub-category
        success_map: dict[int, float] = {}
        total_map: dict[int, int] = {}
        for record in hire_history:
            if record.get("sub_category") != job.sub_category:
                continue
            fid = record["freelancer_id"]
            total_map[fid] = total_map.get(fid, 0) + 1
            if record.get("success"):
                success_map[fid] = success_map.get(fid, 0) + 1

        for r in results:
            if r.freelancer_id in total_map:
                total   = total_map[r.freelancer_id]
                success = success_map.get(r.freelancer_id, 0)
                boost   = 0.10 * (success / total)
                r.match_score = min(r.match_score + boost, 1.0)

        results.sort(key=lambda r: r.match_score, reverse=True)
        return results