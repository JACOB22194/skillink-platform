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
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# Load the .env file so os.getenv() can read it
load_dotenv()

# Read DATABASE_URL from .env
# If .env doesn't exist, the fallback after :- is used automatically
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://skillink_user:password123@db:5432/skillink_db"
)

# pool_pre_ping helps recover if the DB connection drops while container is hot
engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()


def get_db():
    """
    FastAPI dependency — gives each endpoint a fresh DB session.
    The session is automatically closed after the request finishes.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()