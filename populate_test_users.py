import requests
import time

BASE_URL = "http://localhost:8000"

PROFILES = [
    {"email": "evan@skillink.com", "pass": "Test1234!", "github": "https://github.com/yyx990803", "desc": "Frontend / Vue", "first_name": "Evan", "last_name": "You"},
    {"email": "andrej@skillink.com", "pass": "Test1234!", "github": "https://github.com/karpathy", "desc": "AI / ML / Python", "first_name": "Andrej", "last_name": "Karpathy"},
    {"email": "brad@skillink.com", "pass": "Test1234!", "github": "https://github.com/bradfitz", "desc": "Backend / Go", "first_name": "Brad", "last_name": "Fitzpatrick"},
    {"email": "david@skillink.com", "pass": "Test1234!", "github": "https://github.com/dtolnay", "desc": "Systems / Rust", "first_name": "David", "last_name": "Tolnay"},
    {"email": "sindre@skillink.com", "pass": "Test1234!", "github": "https://github.com/sindresorhus", "desc": "Node.js / JS Open Source", "first_name": "Sindre", "last_name": "Sorhus"},
    {"email": "francois@skillink.com", "pass": "Test1234!", "github": "https://github.com/fchollet", "desc": "Deep Learning / Keras", "first_name": "Francois", "last_name": "Chollet"},
    {"email": "jake@skillink.com", "pass": "Test1234!", "github": "https://github.com/JakeWharton", "desc": "Android / Kotlin", "first_name": "Jake", "last_name": "Wharton"}
]

print("Starting population...")

for p in PROFILES:
    print(f"\n--- Processing {p['desc']} ({p['github']}) ---")
    
    # 1. Register
    reg_res = requests.post(f"{BASE_URL}/auth/register", json={
        "email": p["email"],
        "password": p["pass"],
        "role": "freelancer",
        "first_name": p["first_name"],
        "last_name": p["last_name"]
    })
    
    if reg_res.status_code == 409:
        print(f"User {p['email']} already exists. Skipping registration.")
    elif reg_res.status_code != 201:
        print(f"Failed to register: {reg_res.text}")
        continue
    else:
        print("Registered successfully.")

    # 2. Login
    login_res = requests.post(f"{BASE_URL}/auth/login", json={
        "email": p["email"],
        "password": p["pass"]
    })
    
    if login_res.status_code != 200:
        print(f"Failed to login: {login_res.text}")
        continue
        
    token = login_res.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}
    
    # 3. Parse GitHub
    print("Parsing GitHub profile (this takes ~10-20s via Gemini)...")
    try:
        gh_res = requests.post(f"{BASE_URL}/github/parse", json={"url": p["github"]}, headers=headers, timeout=60)
        if gh_res.status_code == 200:
            data = gh_res.json()
            print(f"Success! Assigned Sub-Categories: {data.get('sub_categories')}")
            print(f"   Score: {data.get('score')}")
        else:
            print(f"Failed to parse: {gh_res.status_code} - {gh_res.text}")
    except requests.exceptions.Timeout:
         print("Request timed out. Gemini API is slow.")
    
    # Sleep to avoid Gemini rate limits
    time.sleep(5)

print("\nDone populating test users!")
