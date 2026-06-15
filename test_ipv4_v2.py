import socket
import httpx
import os

# ── Force IPv4 ──
old_getaddrinfo = socket.getaddrinfo
def new_getaddrinfo(*args, **kwargs):
    res = old_getaddrinfo(*args, **kwargs)
    return [r for r in res if r[0] == socket.AF_INET]
socket.getaddrinfo = new_getaddrinfo

def test(url, name):
    try:
        print(f"Testing {name} ({url})...")
        r = httpx.get(url, timeout=10)
        print(f"  Result: {r.status_code}")
    except Exception as e:
        print(f"  Error: {e}")

test("https://api.github.com/zen", "GitHub")
test("https://generativelanguage.googleapis.com", "Gemini")
