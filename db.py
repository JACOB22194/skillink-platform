from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://skillink_user:password123@db:5432/skillink_db"
)

# Replica URL falls back to primary when not configured (e.g. local dev)
DATABASE_REPLICA_URL = os.getenv("DATABASE_REPLICA_URL", DATABASE_URL)

# pool_pre_ping=True: recovers silently-dropped connections before use
engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base         = declarative_base()

# Separate read engine — points to streaming replica in production
read_engine      = create_engine(DATABASE_REPLICA_URL, pool_pre_ping=True)
ReadSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=read_engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_read_db():
    """Read-only DB session routed to the streaming replica."""
    db = ReadSessionLocal()
    try:
        yield db
    finally:
        db.close()