import uuid

BASE = "/auth"


def _unique_email():
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


def test_register_success(client):
    r = client.post(f"{BASE}/register", json={
        "email": _unique_email(),
        "password": "TestPass1",
        "role": "freelancer",
        "first_name": "Test",
        "last_name": "User",
    })
    assert r.status_code == 201
    data = r.json()
    assert data["email"].endswith("@example.com")
    assert data["role"] == "freelancer"


def test_register_duplicate_email(client):
    email = _unique_email()
    payload = {"email": email, "password": "TestPass1", "role": "freelancer"}
    client.post(f"{BASE}/register", json=payload)
    r = client.post(f"{BASE}/register", json=payload)
    assert r.status_code == 409


def test_register_weak_password(client):
    r = client.post(f"{BASE}/register", json={
        "email": _unique_email(),
        "password": "weak",
        "role": "freelancer",
    })
    assert r.status_code == 422


def test_login_success(client):
    email = _unique_email()
    client.post(f"{BASE}/register", json={
        "email": email,
        "password": "TestPass1",
        "role": "client",
    })
    r = client.post(f"{BASE}/login", json={"email": email, "password": "TestPass1"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


def test_login_wrong_password(client):
    email = _unique_email()
    client.post(f"{BASE}/register", json={
        "email": email,
        "password": "TestPass1",
        "role": "freelancer",
    })
    r = client.post(f"{BASE}/login", json={"email": email, "password": "WrongPass9"})
    assert r.status_code in (401, 403)


def test_login_nonexistent_user(client):
    r = client.post(f"{BASE}/login", json={
        "email": "nobody@example.com",
        "password": "TestPass1",
    })
    assert r.status_code in (401, 404)
