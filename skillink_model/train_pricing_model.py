"""
Regenerate pricing model joblib files using the installed numpy/sklearn versions.

Run inside the Docker image so the saved models always match the
numpy BitGenerator format of the runtime environment:
    python skillink_model/train_pricing_model.py
"""

from pathlib import Path

import joblib
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.preprocessing import LabelEncoder

OUT = Path(__file__).parent / "pricing_model_v2"

df = pd.read_csv(OUT / "pricing_table.csv")

le_cat = LabelEncoder().fit(df["category"])
le_exp = LabelEncoder().fit(df["experience"])

X = list(zip(le_cat.transform(df["category"]), le_exp.transform(df["experience"])))

model_min = Ridge().fit(X, df["min_pred"])
model_max = Ridge().fit(X, df["max_pred"])
model_avg = Ridge().fit(X, df["avg_pred"])

joblib.dump(le_cat,     OUT / "le_cat.joblib")
joblib.dump(le_exp,     OUT / "le_exp.joblib")
joblib.dump(model_min,  OUT / "model_min.joblib")
joblib.dump(model_max,  OUT / "model_max.joblib")
joblib.dump(model_avg,  OUT / "model_avg.joblib")

print(f"Saved pricing models to {OUT}")
print(f"Categories:  {list(le_cat.classes_)}")
print(f"Experiences: {list(le_exp.classes_)}")
