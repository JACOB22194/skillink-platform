"""
skill_subcategory_map.py
────────────────────────
Maps raw skill/language strings → Skillink sub-category names.
Used in two places:
  1. Profile ingestion: tag each freelancer with relevant sub-categories
  2. Job matching:      expand job's extracted skills into sub-categories
     for the pre-filter step (fast set intersection before cosine scoring)

Design:
  - Each skill maps to a PRIMARY sub-category (the most specific match)
  - A freelancer is tagged with all sub-categories whose skills they hold
  - Threshold: at least ONE matching skill to include a sub-category tag
"""

from __future__ import annotations

# ── Core mapping: skill/language → sub-category ───────────────────────────────
# Keys are lowercase. The match is case-insensitive at lookup time.

SKILL_TO_SUBCATEGORY: dict[str, list[str]] = {
    # ── Technology & Programming ──────────────────────────────────────────────
    "python":          ["Data Science & Analysis", "Programming & Coding", "Website Development"],
    "r":               ["Data Science & Analysis"],
    "julia":           ["Data Science & Analysis"],
    "pandas":          ["Data Science & Analysis"],
    "numpy":           ["Data Science & Analysis"],
    "scikit-learn":    ["Data Science & Analysis"],
    "tensorflow":      ["Data Science & Analysis"],
    "pytorch":         ["Data Science & Analysis"],
    "keras":           ["Data Science & Analysis"],
    "machine learning":["Data Science & Analysis"],
    "deep learning":   ["Data Science & Analysis"],
    "nlp":             ["Data Science & Analysis"],
    "data analysis":   ["Data Science & Analysis"],
    "jupyter":         ["Data Science & Analysis"],
    "tableau":         ["Data Science & Analysis"],
    "power bi":        ["Data Science & Analysis"],
    "sql":             ["Databases", "Data Science & Analysis"],
    "mysql":           ["Databases"],
    "postgresql":      ["Databases"],
    "mongodb":         ["Databases"],
    "redis":           ["Databases"],
    "elasticsearch":   ["Databases"],
    "firebase":        ["Databases", "Mobile App Development"],
    "dynamodb":        ["Databases"],
    "sqlite":          ["Databases"],
    "oracle":          ["Databases"],
    "javascript":      ["Website Development", "Web Design", "Programming & Coding"],
    "typescript":      ["Website Development", "Programming & Coding"],
    "react":           ["Website Development", "Web Design"],
    "vue":             ["Website Development", "Web Design"],
    "angular":         ["Website Development", "Web Design"],
    "nextjs":          ["Website Development"],
    "nuxt":            ["Website Development"],
    "nodejs":          ["Website Development", "Programming & Coding"],
    "express":         ["Website Development", "Programming & Coding"],
    "fastapi":         ["Website Development", "Programming & Coding"],
    "django":          ["Website Development", "Programming & Coding"],
    "flask":           ["Website Development", "Programming & Coding"],
    "laravel":         ["Website Development"],
    "php":             ["Website Development"],
    "wordpress":       ["Website Development"],
    "ruby":            ["Website Development", "Programming & Coding"],
    "rails":           ["Website Development"],
    "golang":          ["Programming & Coding"],
    "rust":            ["Programming & Coding"],
    "java":            ["Programming & Coding", "Mobile App Development"],
    "spring":          ["Programming & Coding"],
    "kotlin":          ["Mobile App Development", "Programming & Coding"],
    "swift":           ["Mobile App Development"],
    "flutter":         ["Mobile App Development"],
    "react native":    ["Mobile App Development"],
    "android":         ["Mobile App Development"],
    "ios":             ["Mobile App Development"],
    "unity":           ["Game Development"],
    "unreal engine":   ["Game Development"],
    "unreal":          ["Game Development"],
    "godot":           ["Game Development"],
    "c#":              ["Game Development", "Programming & Coding"],
    "c++":             ["Game Development", "Programming & Coding"],
    "opengl":          ["Game Development"],
    "webgl":           ["Game Development", "Web Design"],
    "selenium":        ["Software Testing"],
    "cypress":         ["Software Testing"],
    "jest":            ["Software Testing"],
    "pytest":          ["Software Testing"],
    "testing":         ["Software Testing"],
    "qa":              ["Software Testing"],
    "docker":          ["Programming & Coding"],
    "kubernetes":      ["Programming & Coding"],
    "aws":             ["Programming & Coding"],
    "azure":           ["Programming & Coding"],
    "gcp":             ["Programming & Coding"],
    "devops":          ["Programming & Coding"],
    "ci/cd":           ["Programming & Coding"],
    "graphql":         ["Programming & Coding", "Website Development"],
    "rest api":        ["Programming & Coding"],
    "scraping":        ["Programming & Coding"],
    "automation":      ["Programming & Coding"],
    "bash":            ["Programming & Coding"],
    "linux":           ["Programming & Coding"],
    "git":             ["Programming & Coding"],

    # ── Design ────────────────────────────────────────────────────────────────
    "photoshop":       ["Graphic Design", "Image Editing", "Logo Design"],
    "illustrator":     ["Graphic Design", "Logo Design", "Illustration & Drawing"],
    "figma":           ["Web Design", "Graphic Design"],
    "sketch":          ["Web Design", "Graphic Design"],
    "xd":              ["Web Design", "Graphic Design"],
    "indesign":        ["Graphic Design"],
    "canva":           ["Graphic Design"],
    "affinity designer":["Graphic Design", "Illustration & Drawing"],
    "procreate":       ["Illustration & Drawing"],
    "logo design":     ["Logo Design"],
    "branding":        ["Branding"],
    "brand identity":  ["Branding"],
    "ui":              ["Web Design"],
    "ux":              ["Web Design"],
    "ui/ux":           ["Web Design"],
    "wireframing":     ["Web Design"],
    "prototyping":     ["Web Design"],
    "3d modeling":     ["3D Design"],
    "blender":         ["3D Design", "Animation"],
    "maya":            ["3D Design", "Animation"],
    "cinema 4d":       ["3D Design", "Animation"],
    "autocad":         ["Computer-Aided Design (CAD)"],
    "solidworks":      ["Computer-Aided Design (CAD)"],
    "cad":             ["Computer-Aided Design (CAD)"],
    "revit":           ["Computer-Aided Design (CAD)", "Interior/Exterior Design"],
    "sketchup":        ["Interior/Exterior Design", "3D Design"],
    "lightroom":       ["Image Editing", "Professional Photography"],
    "photography":     ["Professional Photography"],
    "print design":    ["Print Design"],
    "fashion design":  ["Fashion & Clothing"],

    # ── Video & Animation ────────────────────────────────────────────────────
    "premiere":        ["Video Production"],
    "after effects":   ["Video Production", "Animation"],
    "davinci resolve": ["Video Production"],
    "final cut":       ["Video Production"],
    "video editing":   ["Video Production"],
    "motion graphics": ["Video Production", "Animation"],
    "animation":       ["Animation"],
    "2d animation":    ["Animation"],
    "3d animation":    ["Animation", "3D Design"],
    "voice over":      ["Voice-Over"],
    "narration":       ["Voice-Over"],

    # ── Writing & Translation ─────────────────────────────────────────────────
    "copywriting":     ["Copywriting"],
    "content writing": ["Content Writing"],
    "seo writing":     ["Content Writing", "SEO"],
    "technical writing":["Technical Writing"],
    "proofreading":    ["Proofreading"],
    "translation":     ["Translation"],
    "transcription":   ["Transcription"],
    "ghostwriting":    ["Ghost Writing"],
    "creative writing":["Creative Writing"],
    "research writing":["Research Writing"],
    "business writing":["Business Writing"],

    # ── Marketing ─────────────────────────────────────────────────────────────
    "seo":             ["SEO"],
    "google analytics":["SEO", "SEM, Adwords & PPC"],
    "google ads":      ["SEM, Adwords & PPC"],
    "ppc":             ["SEM, Adwords & PPC"],
    "facebook ads":    ["Social Media Marketing"],
    "instagram":       ["Social Media Marketing"],
    "social media":    ["Social Media Marketing"],
    "email marketing": ["Email Marketing"],
    "mailchimp":       ["Email Marketing"],
    "video marketing": ["Video Marketing"],
    "public relations":["Public Relations"],
    "pr":              ["Public Relations"],

    # ── Business ──────────────────────────────────────────────────────────────
    "excel":           ["Finance & Accounting", "Administration Assistance"],
    "accounting":      ["Finance & Accounting"],
    "bookkeeping":     ["Finance & Accounting"],
    "quickbooks":      ["Finance & Accounting"],
    "legal":           ["Legal Services"],
    "contracts":       ["Legal Services"],
    "sales":           ["Sales & Calls"],
    "crm":             ["Sales & Calls", "Databases"],
    "hubspot":         ["Sales & Calls", "Email Marketing"],
    "salesforce":      ["Sales & Calls"],
    "business strategy":["Business Strategy & Consulting"],
    "consulting":      ["Business Strategy & Consulting"],
    "project management":["Administration Assistance", "Business Strategy & Consulting"],
    "data entry":      ["Administration Assistance"],
    "virtual assistant":["Administration Assistance"],
}


def skills_to_subcategories(skills: list[str], top_languages: list[str] = None) -> list[str]:
    """
    Given a list of skill strings + top languages from GitHub,
    return the unique set of sub-category names this freelancer covers.
    """
    all_inputs = [s.lower().strip() for s in (skills or [])]
    all_inputs += [l.lower().strip() for l in (top_languages or [])]

    sub_cats: set[str] = set()
    for term in all_inputs:
        if term in SKILL_TO_SUBCATEGORY:
            sub_cats.update(SKILL_TO_SUBCATEGORY[term])
            continue
        for key, cats in SKILL_TO_SUBCATEGORY.items():
            if key in term or term in key:
                sub_cats.update(cats)
                break

    return sorted(sub_cats)


def build_profile_text(parsed: dict) -> str:
    """
    Concatenate all text signals from GitHub parse into a single
    document for TF-IDF vectorisation.
    """
    parts = []

    title = parsed.get("title", "")
    if title:
        parts.extend([title] * 3)

    summary = parsed.get("summary", "")
    if summary:
        parts.append(summary)

    skills = parsed.get("skills", [])
    if skills:
        skill_text = " ".join(skills)
        parts.extend([skill_text] * 2)

    for exp in parsed.get("experience", []):
        if exp.get("title"):
            parts.append(exp["title"])
        if exp.get("description"):
            parts.append(exp["description"])
        if exp.get("tech_stack"):
            parts.append(" ".join(exp["tech_stack"]))

    stats = parsed.get("github_stats", {})
    langs = stats.get("top_languages", [])
    if langs:
        parts.append(" ".join(langs))

    return " ".join(parts)
