import httpx
import os

AI_SERVICE_URL = os.getenv("AI_SERVICE_URL", "http://ai:8000")


def predict_price(category: str, experience: str) -> dict:
    with httpx.Client() as client:
        resp = client.post(
            f"{AI_SERVICE_URL}/pricing/recommend",
            json={"category": category, "experience": experience},
            timeout=10.0,
        )
        resp.raise_for_status()
        return resp.json()


def get_supported_categories() -> list[str]:
    with httpx.Client() as client:
        resp = client.get(f"{AI_SERVICE_URL}/pricing/categories", timeout=10.0)
        resp.raise_for_status()
        return resp.json()["categories"]


def get_supported_experiences() -> list[str]:
    with httpx.Client() as client:
        resp = client.get(f"{AI_SERVICE_URL}/pricing/experiences", timeout=10.0)
        resp.raise_for_status()
        return resp.json()["experiences"]
