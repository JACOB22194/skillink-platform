#!/bin/sh
set -e

python <<'PYEOF'
import os
import subprocess
from sqlalchemy import create_engine, text

engine = create_engine(os.environ["DATABASE_URL"])
with engine.connect() as conn:
    baseline_exists = conn.execute(
        text("SELECT 1 FROM pg_type WHERE typname = 'milestonestatus'")
    ).first() is not None
engine.dispose()

if not baseline_exists:
    # Brand-new database (e.g. a fresh Render Postgres instance) — there is no
    # legacy schema for the incremental Alembic migration to build on top of.
    # models.py already defines the full final schema (all 13 status values,
    # all new columns), so create_all() produces the correct end state in one
    # shot. Stamp Alembic to head afterward so future deploys take the normal
    # incremental path instead of re-running this bootstrap.
    print("Fresh database detected — creating full schema via create_all(), then stamping Alembic to head.")
    import models  # noqa: F401 — registers all ORM classes
    from db import Base, engine as db_engine
    Base.metadata.create_all(bind=db_engine)
    subprocess.run(["alembic", "stamp", "head"], check=True)
else:
    # Existing database with the original 4-value enum (e.g. the Azure VM) —
    # run the incremental migration that adds the new statuses/columns/tables.
    print("Existing baseline schema detected — running incremental Alembic migration.")
    subprocess.run(["alembic", "upgrade", "head"], check=True)
PYEOF

exec uvicorn main:app --host 0.0.0.0 --port "$PORT"
