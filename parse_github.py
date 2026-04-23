"""
parse_github.py
───────────────
Pulls a freelancer's top 7 GitHub repos, reads READMEs and language
stats, then uses Gemini to synthesise everything into a rich profile.
"""

import os, re, base64, httpx
from google import genai


def _gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")
    return genai.Client(api_key=api_key)


def _github_headers():
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN environment variable is not set")
    return {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github+json",
    }

# ── Helpers ───────────────────────────────────────────────────────────────────

def extract_username(url: str) -> str:
    """Accept full URL or bare username."""
    url = url.strip().rstrip("/")
    match = re.search(r"github\.com/([^/]+)", url)
    return match.group(1) if match else url


def gh_get(path: str) -> dict | list:
    url = f"https://api.github.com{path}"
    with httpx.Client(timeout=15) as client:
        r = client.get(url, headers=_github_headers())
        r.raise_for_status()
        return r.json()


def fetch_readme(owner: str, repo: str) -> str:
    try:
        data = gh_get(f"/repos/{owner}/{repo}/readme")
        content = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
        # Trim to first 600 chars to stay within Gemini token budget
        return content[:600].strip()
    except Exception:
        return ""


def fetch_languages(owner: str, repo: str) -> list[str]:
    try:
        langs = gh_get(f"/repos/{owner}/{repo}/languages")
        return list(langs.keys())
    except Exception:
        return []


# ── Scoring ───────────────────────────────────────────────────────────────────

def score_profile(profile: dict, stats: dict) -> dict:
    skills_score      = min(len(profile.get("skills", [])) * 4, 30)       # max 30
    experience_score  = min(len(profile.get("experience", [])) * 10, 40)  # max 40
    stars_score       = min(stats.get("total_stars", 0) // 10, 15)        # max 15
    activity_score    = min(stats.get("public_repos", 0) // 2, 15)        # max 15
    total = skills_score + experience_score + stars_score + activity_score

    suggestions = []
    if skills_score < 15:
        suggestions.append("Add more diverse technologies to your projects.")
    if experience_score < 20:
        suggestions.append("Pin and document your best projects with detailed READMEs.")
    if stats.get("total_stars", 0) < 10:
        suggestions.append("Share your projects in communities to gain stars and visibility.")
    if not profile.get("summary"):
        suggestions.append("Add a GitHub bio — it appears as your professional summary.")
    if stats.get("public_repos", 0) < 5:
        suggestions.append("Make more repositories public to show your range of work.")

    return {"score": total, "suggestions": suggestions}


# ── Main parser ───────────────────────────────────────────────────────────────

def parse_github(github_url: str) -> dict:
    username = extract_username(github_url)

    # 1. Fetch user profile
    user = gh_get(f"/users/{username}")

    # 2. Fetch repos sorted by stars, take top 7
    repos_raw = gh_get(f"/users/{username}/repos?sort=stars&per_page=7")

    # 3. Deep-fetch each repo
    repos_detail = []
    all_languages = {}
    total_stars = 0

    for repo in repos_raw:
        if repo.get("fork"):
            continue  # skip forked repos — not original work

        readme    = fetch_readme(username, repo["name"])
        languages = fetch_languages(username, repo["name"])
        stars     = repo.get("stargazers_count", 0)
        total_stars += stars

        for lang in languages:
            all_languages[lang] = all_languages.get(lang, 0) + 1

        repos_detail.append({
            "name":        repo["name"],
            "description": repo.get("description") or "",
            "stars":       stars,
            "languages":   languages,
            "topics":      repo.get("topics", []),
            "updated_at":  repo.get("updated_at", "")[:10],
            "url":         repo.get("html_url", ""),
            "readme":      readme,
        })

    # Sort languages by frequency
    top_languages = sorted(all_languages, key=all_languages.get, reverse=True)

    github_stats = {
        "username":    username,
        "public_repos": user.get("public_repos", 0),
        "followers":   user.get("followers", 0),
        "total_stars": total_stars,
        "top_languages": top_languages[:8],
        "account_created": user.get("created_at", "")[:10],
        "profile_url": f"https://github.com/{username}",
    }

    # 4. Build Gemini prompt
    repos_text = ""
    for r in repos_detail:
        repos_text += f"""
---
Project: {r['name']}
Stars: {r['stars']}
Languages: {', '.join(r['languages']) or 'N/A'}
Topics: {', '.join(r['topics']) or 'N/A'}
Description: {r['description'] or 'No description'}
README excerpt:
{r['readme'] or 'No README available'}
Last updated: {r['updated_at']}
URL: {r['url']}
"""

    prompt = f"""
You are a professional technical profile writer for a freelance platform.
Analyse this developer's GitHub data and produce a rich, honest profile.
Return ONLY valid JSON — no markdown, no code fences, no extra text.

GitHub User:
  Name: {user.get('name') or username}
  Bio: {user.get('bio') or 'No bio'}
  Location: {user.get('location') or ''}
  Website: {user.get('blog') or ''}
  Public Repos: {user.get('public_repos', 0)}
  Followers: {user.get('followers', 0)}
  Top Languages: {', '.join(top_languages[:8])}

Top Projects:
{repos_text}

Return this exact JSON schema:
{{
  "name": "full name or username if name unavailable",
  "title": "inferred professional title e.g. Full Stack Engineer, ML Engineer (2-5 words)",
  "summary": "3-4 sentence professional summary written in first person, based on actual evidence from their repos and bio",
  "location": "location or empty string",
  "website": "website or empty string",
  "skills": ["list of technologies and skills inferred from repos and languages — be specific"],
  "experience": [
    {{
      "title": "project name as a role e.g. Lead Developer — SkillLink",
      "company": "Personal Project / Open Source",
      "duration": "infer from repo creation/update dates",
      "description": "2-3 sentences describing what the project does and the developer's contribution",
      "tech_stack": ["list", "of", "technologies"],
      "github_url": "repo url"
    }}
  ],
  "education": [],
  "languages": [],
  "certifications": []
}}
"""

    response = _gemini_client().models.generate_content(
        model="gemini-2.5-flash",
        contents=prompt,
    )
    raw = response.text.strip()
    raw = re.sub(r"^```json\s*|^```\s*|```$", "", raw, flags=re.MULTILINE).strip()

    import json
    parsed = json.loads(raw)

    # 5. Scoring
    scoring = score_profile(parsed, github_stats)
    parsed["score"]        = scoring["score"]
    parsed["suggestions"]  = scoring["suggestions"]
    parsed["github_stats"] = github_stats

    return parsed
