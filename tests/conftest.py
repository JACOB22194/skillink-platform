import os
import pytest
from alembic.config import Config
from alembic import command
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

TEST_DATABASE_URL = os.environ["TEST_DATABASE_URL"]


@pytest.fixture(scope="session", autouse=True)
def setup_test_database():
    from db import Base
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(bind=engine)
    
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    command.stamp(alembic_cfg, "head")
    yield
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE;"))
        conn.execute(text("CREATE SCHEMA public;"))


@pytest.fixture(scope="function")
def client(setup_test_database):
    from db import get_db
    from main import app

    engine = create_engine(TEST_DATABASE_URL)
    connection = engine.connect()
    transaction = connection.begin()

    # begin_nested() creates a PostgreSQL savepoint.
    # When application code calls db.commit(), it only flushes the savepoint —
    # the outer transaction stays open and rollback() below undoes everything.
    nested = connection.begin_nested()

    TestingSession = sessionmaker(bind=connection)

    # After each app-level commit the savepoint is consumed; restart it so the
    # next write in the same test is also captured by the outer transaction.
    @event.listens_for(TestingSession, "after_transaction_end")
    def restart_savepoint(session, trans):
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    with TestClient(app) as c:
        yield c

    transaction.rollback()
    connection.close()
    app.dependency_overrides.clear()
