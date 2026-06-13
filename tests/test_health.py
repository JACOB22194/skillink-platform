def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    data = r.json()
    assert data["message"] == "SkillLink API is running!"
    assert "version" in data


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_health_detailed(client):
    r = client.get("/health/detailed")
    assert r.status_code == 200
    data = r.json()
    assert "status" in data
    assert "total_users" in data
