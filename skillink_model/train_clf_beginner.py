"""
Regenerate clf_beginner.joblib using the installed numpy/sklearn versions.

Input features : [completed_projects, years_experience]
Label          : 1 = beginner-qualified, 0 = experienced

Run inside the Docker image so the saved model always matches the
numpy BitGenerator format of the runtime environment:
    python skillink_model/train_clf_beginner.py
"""

from pathlib import Path

import joblib
import numpy as np
from sklearn.linear_model import LogisticRegression

OUT = Path(__file__).parent / "clf_beginner.joblib"

# ── Synthetic training data ───────────────────────────────────────────────────
# Label logic (mirrors the threshold fallback in launchpad_service.py):
#   beginner (1): completed_projects < 5
#   experienced (0): completed_projects >= 5
# years_experience adds a soft signal but is not decisive on its own.

rng = np.random.default_rng(42)

n = 2000
completed = rng.integers(0, 30, size=n)
years = rng.uniform(0, 15, size=n)
labels = (completed < 5).astype(int)

# Add a little noise so the classifier generalises rather than memorises
noise_idx = rng.choice(n, size=n // 20, replace=False)
labels[noise_idx] = 1 - labels[noise_idx]

X = np.column_stack([completed, years])
y = labels

# ── Train ─────────────────────────────────────────────────────────────────────
clf = LogisticRegression(random_state=42, max_iter=200)
clf.fit(X, y)

acc = clf.score(X, y)
print(f"Training accuracy: {acc:.4f}")

# ── Save ──────────────────────────────────────────────────────────────────────
joblib.dump(clf, OUT)
print(f"Saved {OUT}")
