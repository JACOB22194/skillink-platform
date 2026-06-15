"""
parse_github.py
───────────────
Pulls a freelancer's top 7 non-forked GitHub repos, reads READMEs and
language stats, then uses Gemini to synthesise everything into a rich profile.

All GitHub API calls are made concurrently via asyncio so the total
network time is bounded by the slowest single call, not the sum.
"""

import os, re, base64, json, asyncio, httpx
from google import genai


# ── GitHub async client ───────────────────────────────────────────────────────

class GitHubClient:
    def __init__(self):
        token = os.environ.get("GITHUB_TOKEN")
        if not token:
            raise RuntimeError("GITHUB_TOKEN environment variable is not set")
        self.headers = {
            "Authorization": f"token {token}",
            "Accept":        "application/vnd.github+json",
        }

    async def _get(self, client: httpx.AsyncClient, path: str) -> dict | list:
        r = await client.get(f"https://api.github.com{path}", headers=self.headers)
        r.raise_for_status()
        return r.json()

    async def _repo_details(self, client: httpx.AsyncClient, username: str, repo: dict) -> dict:
        name = repo["name"]

        async def readme():
            try:
                data = await self._get(client, f"/repos/{username}/{name}/readme")
                raw = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
                # strip control chars, trim for token budget
                cleaned = re.sub(r"[\x00-\x1F\x7F]", "", raw)
                return cleaned[:600].strip()
            except Exception:
                return ""

        async def languages():
            try:
                langs = await self._get(client, f"/repos/{username}/{name}/languages")
                return list(langs.keys())
            except Exception:
                return []

        readme_text, lang_list = await asyncio.gather(readme(), languages())

        return {
            "name":        name,
            "description": repo.get("description") or "",
            "stars":       repo.get("stargazers_count", 0),
            "languages":   lang_list,
            "topics":      repo.get("topics", []),
            "updated_at":  repo.get("updated_at", "")[:10],
            "url":         repo.get("html_url", ""),
            "readme":      readme_text,
        }

    async def fetch_all(self, username: str) -> tuple[dict, list[dict]]:
        """Fetch user profile and top-7 own repos (with readme+languages) concurrently."""
        async with httpx.AsyncClient(timeout=30) as client:
            user, repos_raw = await asyncio.gather(
                self._get(client, f"/users/{username}"),
                self._get(client, f"/users/{username}/repos?sort=stars&per_page=20"),
            )
            own_repos = [r for r in repos_raw if not r.get("fork")][:7]
            repos_detail = await asyncio.gather(
                *[self._repo_details(client, username, r) for r in own_repos]
            )
        return user, list(repos_detail)


# ── Scoring ───────────────────────────────────────────────────────────────────

def _score(profile: dict, stats: dict) -> dict:
    skills_score     = min(len(profile.get("skills",     [])) * 4,  30)
    experience_score = min(len(profile.get("experience", [])) * 10, 40)
    stars_score      = min(stats.get("total_stars",  0) // 10, 15)
    activity_score   = min(stats.get("public_repos", 0) // 2,  15)
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


# ── Gemini generation ─────────────────────────────────────────────────────────

def _generate(user: dict, repos_detail: list[dict], github_stats: dict) -> dict:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY environment variable is not set")

    username = github_stats["username"]

    repos_text = "".join(
        f"\n---\nProject: {r['name']}\nStars: {r['stars']}\n"
        f"Languages: {', '.join(r['languages']) or 'N/A'}\n"
        f"Topics: {', '.join(r['topics']) or 'N/A'}\n"
        f"Description: {r['description'] or 'No description'}\n"
        f"README excerpt:\n{r['readme'] or 'No README available'}\n"
        f"Last updated: {r['updated_at']}\nURL: {r['url']}\n"
        for r in repos_detail
    )

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
  Top Languages: {', '.join(github_stats['top_languages'])}

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

    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
    raw = re.sub(r"^```json\s*|^```\s*|```$", "", response.text.strip(), flags=re.MULTILINE).strip()
    return json.loads(raw)


# ── Public entry point ────────────────────────────────────────────────────────

def parse_github(github_url: str) -> dict:
    url = github_url.strip().rstrip("/")
    match = re.search(r"github\.com/([^/]+)", url)
    username = match.group(1) if match else url

    # Run async GitHub fetching in its own event loop (safe in sync FastAPI thread)
    gh = GitHubClient()
    user, repos_detail = asyncio.run(gh.fetch_all(username))

    # Aggregate stats
    all_langs: dict[str, int] = {}
    total_stars = 0
    for r in repos_detail:
        total_stars += r["stars"]
        for lang in r["languages"]:
            all_langs[lang] = all_langs.get(lang, 0) + 1

    top_languages = sorted(all_langs, key=all_langs.get, reverse=True)[:8]  # type: ignore[arg-type]

    github_stats = {
        "username":       username,
        "public_repos":   user.get("public_repos", 0),
        "followers":      user.get("followers",    0),
        "total_stars":    total_stars,
        "top_languages":  top_languages,
        "account_created":user.get("created_at", "")[:10],
        "profile_url":    f"https://github.com/{username}",
        "avatar_url":     user.get("avatar_url", ""),
        "name":           user.get("name") or username,
        "location":       user.get("location") or "",
        "website":        user.get("blog") or "",
    }

    # Generate AI profile + score
    profile  = _generate(user, repos_detail, github_stats)
    scoring  = _score(profile, github_stats)

    profile["score"]        = scoring["score"]
    profile["suggestions"]  = scoring["suggestions"]
    profile["github_stats"] = github_stats

    return profile
