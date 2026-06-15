import os
from pathlib import Path
import pytest

# Point MODEL_DIR at the committed fixture models before the app module is imported.
# main.py reads MODEL_DIR = Path(os.getenv("MODEL_DIR", "./skillink_model")) at the
# top level, so this env var must be set before `from main import app`.
FIXTURE_MODEL_DIR = str(Path(__file__).parent / "fixtures" / "skillink_model")
os.environ["MODEL_DIR"] = FIXTURE_MODEL_DIR


@pytest.fixture(scope="session")
def client():
    from fastapi.testclient import TestClient
    from main import app
    with TestClient(app) as c:
        yield c
