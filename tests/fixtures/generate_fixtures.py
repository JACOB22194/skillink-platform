"""
Generate miniature .joblib fixture models for AI service tests.

Run once locally from the Skillink-AI/ directory:
    python tests/fixtures/generate_fixtures.py

The output goes to tests/fixtures/skillink_model/ and should be committed to git.
The fixtures must mirror the exact preprocessing pipeline used in production so that
dimension mismatches and schema changes are caught by tests, not by the running container.
"""

import json
from pathlib import Path

import joblib
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder, OneHotEncoder
from sklearn.svm import LinearSVC

OUT = Path(__file__).parent / "skillink_model"
OUT.mkdir(parents=True, exist_ok=True)

# ── Tiny labelled corpus — same cleaning convention as production (_clean) ─────
CATEGORIES = ["Design", "Engineering"]
SUBCATEGORIES = {
    "Design": ["Logo Design", "UI/UX Design"],
    "Engineering": ["Backend Development", "Frontend Development"],
}

corpus = [
    ("I need a modern logo for a tech startup", "Design", "Logo Design"),
    ("Design a clean minimal company logo", "Design", "Logo Design"),
    ("Create a logo with blue color scheme", "Design", "Logo Design"),
    ("Build a UX prototype for mobile app", "Design", "UI/UX Design"),
    ("Design wireframes for an e-commerce site", "Design", "UI/UX Design"),
    ("User interface design for dashboard", "Design", "UI/UX Design"),
    ("Develop REST API with FastAPI and PostgreSQL", "Engineering", "Backend Development"),
    ("Build a microservice in Python", "Engineering", "Backend Development"),
    ("Write backend API endpoints for a SaaS product", "Engineering", "Backend Development"),
    ("Build React dashboard with TypeScript", "Engineering", "Frontend Development"),
    ("Develop Next.js landing page", "Engineering", "Frontend Development"),
    ("Create interactive frontend with Vue.js", "Engineering", "Frontend Development"),
    ("Logo redesign for established brand", "Design", "Logo Design"),
    ("Mobile app UX overhaul", "Design", "UI/UX Design"),
    ("Django REST framework API", "Engineering", "Backend Development"),
    ("React Native mobile frontend", "Engineering", "Frontend Development"),
    ("Vector logo in SVG format", "Design", "Logo Design"),
    ("Figma prototype for fintech app", "Design", "UI/UX Design"),
    ("GraphQL API with Node.js", "Engineering", "Backend Development"),
    ("Svelte SPA for marketing site", "Engineering", "Frontend Development"),
]

texts = [t for t, _, _ in corpus]
cats  = [c for _, c, _ in corpus]
subs  = [s for _, _, s in corpus]

# ── Label encoders ─────────────────────────────────────────────────────────────
le_cat = LabelEncoder().fit(cats)
le_sub = LabelEncoder().fit(subs)
le_cat_ohe = LabelEncoder().fit(CATEGORIES)

y_cat = le_cat.transform(cats)
y_sub = le_sub.transform(subs)

# ── TF-IDF (same params matter: analyzer, ngram_range, min_df) ────────────────
tfidf = TfidfVectorizer(analyzer="word", ngram_range=(1, 2), min_df=1)
X_text = tfidf.fit_transform(texts)

# ── OHE for category hints ────────────────────────────────────────────────────
cat_encoded = le_cat_ohe.transform(cats).reshape(-1, 1)
ohe = OneHotEncoder(sparse_output=False, handle_unknown="ignore").fit(cat_encoded)

import scipy.sparse as sp
X_ohe = sp.csr_matrix(ohe.transform(cat_encoded))
X_full = sp.hstack([X_text, X_ohe])

# ── Classifiers ───────────────────────────────────────────────────────────────
lr_cat = LogisticRegression(max_iter=200).fit(X_text, y_cat)
lr_sub = LogisticRegression(max_iter=200).fit(X_full, y_sub)
svc_sub = LinearSVC(max_iter=200).fit(X_full, y_sub)

# ── Save artifacts ────────────────────────────────────────────────────────────
joblib.dump(tfidf,     OUT / "tfidf.joblib")
joblib.dump(ohe,       OUT / "ohe.joblib")
joblib.dump(le_cat,    OUT / "le_cat.joblib")
joblib.dump(le_sub,    OUT / "le_sub.joblib")
joblib.dump(le_cat_ohe, OUT / "le_cat_ohe.joblib")
joblib.dump(lr_cat,    OUT / "lr_cat.joblib")
joblib.dump(lr_sub,    OUT / "lr_sub.joblib")
joblib.dump(svc_sub,   OUT / "svc_sub.joblib")

sub_to_cat = {sub: cat for _, cat, sub in corpus}
cat_to_subs = SUBCATEGORIES

(OUT / "sub_to_cat.json").write_text(json.dumps(sub_to_cat))
(OUT / "cat_to_subs.json").write_text(json.dumps(cat_to_subs))
(OUT / "cat_labels.json").write_text(json.dumps(CATEGORIES))
(OUT / "sub_labels.json").write_text(json.dumps(list(le_sub.classes_)))
(OUT / "filler_pattern.txt").write_text(r"\b(the|a|an|and|or|for|to|in|of|on|with)\b")
(OUT / "metadata.json").write_text(json.dumps({
    "version": "fixture-1.0",
    "architecture": "TF-IDF + LR + LinearSVC (miniature fixture)",
    "categories": len(CATEGORIES),
    "subcategories": sum(len(v) for v in SUBCATEGORIES.values()),
    "accuracy": {"lr_sub": 1.0, "svc_sub": 1.0, "lr_cat": 1.0},
}))

print(f"Fixtures written to {OUT.resolve()}")
