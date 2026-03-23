"""
db.py — Database Connection
============================
This file connects Python to PostgreSQL using SQLAlchemy.

What each part does:
  - engine        → the actual connection to the database
  - SessionLocal  → a "session" is like opening a conversation with the DB
  - Base          → all our table classes inherit from this
  - get_db()      → gives FastAPI a fresh session for each request
"""

from sqlalchemy import create_engine
# ✅ FIX: declarative_base moved to sqlalchemy.orm in SQLAlchemy 2.0
#         The old import (sqlalchemy.ext.declarative) still works but shows
#         a deprecation warning. This silences it.
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

# Load the .env file so os.getenv() can read it
load_dotenv()

# Read DATABASE_URL from .env
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://skillink_user:password123@db:5432/skillink_db"
)

# pool_pre_ping=True: if the DB connection silently drops (e.g. after idle),
# SQLAlchemy will test it before using it, instead of crashing mid-request
engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()


def get_db():
    """
    FastAPI dependency — gives each endpoint a fresh DB session.
    The session is automatically closed after the request finishes.

    Usage in any router:
        def my_endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()