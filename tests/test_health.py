def test_health_ok(client):
    r = client.get("/health")
    assert r.status_code == 200
    data = r.json()
    assert data.get("status") == "ok"


def test_root_returns_model_info(client):
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert "version" in data


def test_predict(client):
    r = client.post("/predict", json={
        "title": "Build a REST API with FastAPI",
        "description": "Need a backend developer to create endpoints.",
    })
    assert r.status_code == 200
    data = r.json()
    assert "sub_category" in data
    assert "category" in data
    assert 0.0 <= data["confidence"] <= 1.0
