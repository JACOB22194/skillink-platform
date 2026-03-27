"""
seed.py — Database Seeder
==========================
This script populates the database with:

  Task 2.4.2:  Test accounts
    - 1 Admin account
    - 2 Client accounts
    - 3 Freelancer accounts (each with skills attached)

  Task 2.4.3:  skill_taxonomy table
    - 60 IT skills across 8 categories

HOW TO RUN:
-----------
  Option A — Locally (while docker-compose is running):
      python seed.py

  Option B — Inside the Docker container:
      docker exec -it skillink_backend_ python seed.py

  Option C — One-liner from outside:
      docker exec skillink_backend_ python seed.py

The script is SAFE to run multiple times.
It checks if data already exists before inserting,
so running it twice will NOT create duplicate rows.
"""

import os
import sys
from dotenv import load_dotenv

# ── Load .env so we get the DATABASE_URL ─────────────────────────────────────
load_dotenv()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from passlib.context import CryptContext

# Import our models (the table definitions)
from models import (
    Base,
    User, UserRole, UserStatus,
    Freelancer, Client,
    Skill, FreelancerSkill,
    SkillTaxonomy,
)

# ── Database connection ───────────────────────────────────────────────────────
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://skillink_user:password123@localhost:5432/skillink_db"
    #                                         ^^^^^^^^^ "localhost" here because
    # when you run seed.py OUTSIDE Docker, Postgres is on localhost:5432.
    # Inside Docker, change this to "db:5432" or set DATABASE_URL in .env.
)

engine       = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)



def hash_password(plain: str) -> str:
    import bcrypt
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


# ═══════════════════════════════════════════════════════════════════════════
#  TASK 2.4.3 — 60 IT Skills for skill_taxonomy
# ═══════════════════════════════════════════════════════════════════════════
#
# Format: (name, category, description)
# Categories: Frontend, Backend, Mobile, DevOps, Database, AI/ML, Security, Other

SKILL_TAXONOMY_DATA = [
    # ── Frontend ──────────────────────────────────────────────────────────
    ("HTML",            "Frontend", "HyperText Markup Language — the structure of web pages"),
    ("CSS",             "Frontend", "Cascading Style Sheets — styling and layout of web pages"),
    ("JavaScript",      "Frontend", "Core programming language of the web browser"),
    ("TypeScript",      "Frontend", "Typed superset of JavaScript for large-scale apps"),
    ("React",           "Frontend", "Facebook's UI component library for building SPAs"),
    ("Vue.js",          "Frontend", "Progressive JavaScript framework for building UIs"),
    ("Angular",         "Frontend", "Google's full-featured frontend framework"),
    ("Next.js",         "Frontend", "React framework with SSR and static generation"),
    ("Nuxt.js",         "Frontend", "Vue.js framework with SSR support"),
    ("Tailwind CSS",    "Frontend", "Utility-first CSS framework for rapid UI development"),
    ("Sass/SCSS",       "Frontend", "CSS preprocessor with variables, nesting, and mixins"),
    ("Redux",           "Frontend", "State management library commonly used with React"),

    # ── Backend ───────────────────────────────────────────────────────────
    ("Python",          "Backend",  "High-level general-purpose programming language"),
    ("FastAPI",         "Backend",  "Modern, fast Python web framework for building APIs"),
    ("Django",          "Backend",  "Full-featured Python web framework"),
    ("Flask",           "Backend",  "Lightweight Python micro-framework for APIs"),
    ("Node.js",         "Backend",  "JavaScript runtime for server-side programming"),
    ("Express.js",      "Backend",  "Minimal Node.js web application framework"),
    ("Java",            "Backend",  "Object-oriented language widely used in enterprise"),
    ("Spring Boot",     "Backend",  "Java framework for microservices and REST APIs"),
    ("C#",              "Backend",  "Microsoft's object-oriented language"),
    (".NET",            "Backend",  "Microsoft's cross-platform development framework"),
    ("PHP",             "Backend",  "Server-side scripting language for web development"),
    ("Laravel",         "Backend",  "Elegant PHP framework for web artisans"),
    ("Go",              "Backend",  "Google's statically typed compiled language"),
    ("Ruby on Rails",   "Backend",  "Full-stack Ruby web framework"),
    ("REST APIs",       "Backend",  "Designing and building RESTful HTTP services"),
    ("GraphQL",         "Backend",  "Query language for APIs, alternative to REST"),
    ("WebSockets",      "Backend",  "Protocol for real-time bidirectional communication"),

    # ── Mobile ────────────────────────────────────────────────────────────
    ("React Native",    "Mobile",   "Build native mobile apps using React"),
    ("Flutter",         "Mobile",   "Google's UI toolkit for cross-platform apps"),
    ("Swift",           "Mobile",   "Apple's programming language for iOS/macOS"),
    ("Kotlin",          "Mobile",   "Modern JVM language for Android development"),
    ("Android",         "Mobile",   "Native Android app development"),
    ("iOS",             "Mobile",   "Native iOS app development"),

    # ── DevOps ────────────────────────────────────────────────────────────
    ("Docker",          "DevOps",   "Containerization platform for packaging applications"),
    ("Kubernetes",      "DevOps",   "Container orchestration and scaling system"),
    ("CI/CD",           "DevOps",   "Continuous Integration and Continuous Deployment pipelines"),
    ("GitHub Actions",  "DevOps",   "Workflow automation built into GitHub"),
    ("Linux",           "DevOps",   "Unix-based operating system used in servers"),
    ("Nginx",           "DevOps",   "High-performance web server and reverse proxy"),
    ("AWS",             "DevOps",   "Amazon Web Services cloud platform"),
    ("GCP",             "DevOps",   "Google Cloud Platform cloud services"),
    ("Azure",           "DevOps",   "Microsoft's cloud computing platform"),
    ("Terraform",       "DevOps",   "Infrastructure-as-code tool for cloud provisioning"),

    # ── Database ──────────────────────────────────────────────────────────
    ("PostgreSQL",      "Database", "Advanced open-source relational database"),
    ("MySQL",           "Database", "Popular open-source relational database"),
    ("SQLite",          "Database", "Lightweight file-based relational database"),
    ("MongoDB",         "Database", "NoSQL document-oriented database"),
    ("Redis",           "Database", "In-memory key-value store used for caching"),
    ("Elasticsearch",   "Database", "Distributed search and analytics engine"),
    ("SQLAlchemy",      "Database", "Python ORM for interacting with relational databases"),

    # ── AI / ML ───────────────────────────────────────────────────────────
    ("Machine Learning","AI/ML",    "Building models that learn patterns from data"),
    ("Deep Learning",   "AI/ML",    "Neural networks with many layers for complex tasks"),
    ("NLP",             "AI/ML",    "Natural Language Processing — working with text data"),
    ("TensorFlow",      "AI/ML",    "Google's open-source machine learning framework"),
    ("PyTorch",         "AI/ML",    "Facebook's deep learning framework"),
    ("scikit-learn",    "AI/ML",    "Python library for classical machine learning"),
    ("LangChain",       "AI/ML",    "Framework for building LLM-powered applications"),

    # ── Security ──────────────────────────────────────────────────────────
    ("JWT",             "Security", "JSON Web Tokens for stateless authentication"),
    ("OAuth 2.0",       "Security", "Authorization framework for third-party access"),
    ("Penetration Testing","Security","Ethical hacking to find security vulnerabilities"),
    ("Cryptography",    "Security", "Encrypting and securing data at rest and in transit"),

    # ── Other / General ───────────────────────────────────────────────────
    ("Git",             "Other",    "Distributed version control system"),
    ("Agile/Scrum",     "Other",    "Iterative software development methodology"),
    ("System Design",   "Other",    "Designing scalable, reliable distributed systems"),
    ("UI/UX Design",    "Other",    "Designing user interfaces and experiences"),
]


# ═══════════════════════════════════════════════════════════════════════════
#  TASK 2.4.2 — Test Accounts
# ═══════════════════════════════════════════════════════════════════════════
#
# These are the accounts your team uses for testing.
# Passwords are printed at the end so you know them.
# In production, NEVER put real passwords here.

TEST_USERS = [
    # role, email, password, extra_info
    {
        "role":         UserRole.admin,
        "email":        "admin@skillink.com",
        "password":     "Admin1234!",
        "display_name": "Platform Admin",
    },
    {
        "role":         UserRole.client,
        "email":        "client1@skillink.com",
        "password":     "Client123!",
        "company_name": "TechCorp Jordan",
    },
    {
        "role":         UserRole.client,
        "email":        "client2@skillink.com",
        "password":     "Client123!",
        "company_name": "Digital Ventures",
    },
    {
        "role":         UserRole.freelancer,
        "email":        "freelancer1@skillink.com",
        "password":     "Free1234!",
        "bio":          "Full-stack developer with 5 years of experience in React and FastAPI.",
        "hourly_rate":  45.0,
        "skills":       ["React", "Python", "PostgreSQL", "Docker"],
    },
    {
        "role":         UserRole.freelancer,
        "email":        "freelancer2@skillink.com",
        "password":     "Free1234!",
        "bio":          "Mobile developer specializing in Flutter and React Native.",
        "hourly_rate":  55.0,
        "skills":       ["Flutter", "React Native", "Firebase", "Kotlin"],
    },
    {
        "role":         UserRole.freelancer,
        "email":        "freelancer3@skillink.com",
        "password":     "Free1234!",
        "bio":          "AI/ML engineer focused on NLP and LLM-powered products.",
        "hourly_rate":  80.0,
        "skills":       ["Machine Learning", "NLP", "Python", "LangChain"],
    },
]

# Note: "Firebase" and "Kotlin" above are in TEST_USERS but are not in
# skill_taxonomy, so we add them to the skills table directly for the junction table.
EXTRA_SKILLS_FOR_FREELANCERS = ["Firebase"]


# ═══════════════════════════════════════════════════════════════════════════
#  SEEDER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

def seed_skill_taxonomy(db: Session) -> None:
    """Insert all 60+ IT skills into skill_taxonomy. Skips existing ones."""
    print("\n📚 Seeding skill_taxonomy...")

    inserted = 0
    skipped  = 0

    for name, category, description in SKILL_TAXONOMY_DATA:
        exists = db.query(SkillTaxonomy).filter(SkillTaxonomy.name == name).first()
        if exists:
            skipped += 1
            continue

        db.add(SkillTaxonomy(
            name        = name,
            category    = category,
            description = description,
        ))
        inserted += 1

    db.commit()
    print(f"   ✅ skill_taxonomy: {inserted} inserted, {skipped} already existed")


def seed_skills_table(db: Session) -> None:
    """
    Mirror the skill_taxonomy names into the skills table.
    The skills table is what freelancers and projects link to.
    """
    print("\n🔧 Seeding skills table (from skill_taxonomy)...")

    # Collect all names (taxonomy + extras for freelancers)
    all_skill_names = (
        [name for name, _, _ in SKILL_TAXONOMY_DATA]
        + EXTRA_SKILLS_FOR_FREELANCERS
    )

    inserted = 0
    skipped  = 0

    for name in all_skill_names:
        exists = db.query(Skill).filter(Skill.name == name).first()
        if exists:
            skipped += 1
            continue
        db.add(Skill(name=name))
        inserted += 1

    db.commit()
    print(f"   ✅ skills: {inserted} inserted, {skipped} already existed")


def seed_users(db: Session) -> None:
    """Create test users (Admin, Clients, Freelancers) and their profiles."""
    print("\n👤 Seeding test users...")

    for user_data in TEST_USERS:
        # Skip if this user already exists
        exists = db.query(User).filter(User.email == user_data["email"]).first()
        if exists:
            print(f"   ⏭️  Skipping {user_data['email']} (already exists)")
            continue

        # 1. Create the User row
        user = User(
            email       = user_data["email"],
            password    = hash_password(user_data["password"]),
            role        = user_data["role"],
            status      = UserStatus.active,
            mfa_enabled = False,
        )
        db.add(user)
        db.flush()   # get user.id without committing yet

        # 2. Create the role-specific profile
        if user_data["role"] == UserRole.admin:
            # Admins don't have a separate profile table
            print(f"   ✅ Admin:      {user_data['email']}")

        elif user_data["role"] == UserRole.client:
            db.add(Client(
                user_id      = user.id,
                company_name = user_data.get("company_name"),
            ))
            print(f"   ✅ Client:     {user_data['email']}  ({user_data.get('company_name')})")

        elif user_data["role"] == UserRole.freelancer:
            freelancer = Freelancer(
                user_id        = user.id,
                bio            = user_data.get("bio"),
                hourly_rate    = user_data.get("hourly_rate"),
                success_score  = 0.0,
                wallet_balance = 0.0,
            )
            db.add(freelancer)
            db.flush()   # get freelancer.freelancer_id

            # 3. Attach skills to the freelancer
            for skill_name in user_data.get("skills", []):
                skill = db.query(Skill).filter(Skill.name == skill_name).first()
                if skill:
                    db.add(FreelancerSkill(
                        freelancer_id = freelancer.freelancer_id,
                        skill_id      = skill.skill_id,
                    ))
                else:
                    print(f"      ⚠️  Skill '{skill_name}' not found in skills table — skipping")

            print(f"   ✅ Freelancer: {user_data['email']}  (skills: {user_data.get('skills')})")

    db.commit()


# ═══════════════════════════════════════════════════════════════════════════
#  MAIN — run all seeders in the correct order
# ═══════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  SkillLink Database Seeder")
    print("=" * 60)
    print(f"  Connecting to: {DATABASE_URL.split('@')[-1]}")  # hide password

    db = SessionLocal()

    try:
        # Order matters: skills must exist before users try to attach them
        seed_skill_taxonomy(db)   # task 2.4.3 — 60 IT skills
        seed_skills_table(db)     # mirror skills for FK linking
        seed_users(db)            # task 2.4.2 — Admin, Clients, Freelancers

        print("\n" + "=" * 60)
        print("  ✅ Seeding complete!")
        print("=" * 60)
        print("\n📋 Test Account Credentials:")
        print("-" * 40)
        for u in TEST_USERS:
            role = u["role"].value.upper().ljust(12)
            print(f"  {role}  {u['email']}")
            print(f"              Password: {u['password']}")
        print("-" * 40)
        print("  ⚠️  Change these passwords before deploying to production!\n")

    except Exception as e:
        db.rollback()
        print(f"\n❌ Seeding failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    main()