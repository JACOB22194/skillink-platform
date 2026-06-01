import os
import json
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Load .env
load_dotenv()

from models import User, Freelancer

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://skillink_user:password123@localhost:5432/skillink_db"
)

print(f"Connecting to database: {DATABASE_URL}")
engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

MAPPED_NAMES = {
    "evan@skillink.com": ("Evan", "You"),
    "andrej@skillink.com": ("Andrej", "Karpathy"),
    "brad@skillink.com": ("Brad", "Fitzpatrick"),
    "david@skillink.com": ("David", "Tolnay"),
    "sindre@skillink.com": ("Sindre", "Sorhus"),
    "francois@skillink.com": ("Francois", "Chollet"),
    "jake@skillink.com": ("Jake", "Wharton"),
}

try:
    users = db.query(User).all()
    print(f"Found {len(users)} users.")
    
    updated_count = 0
    for u in users:
        first = u.first_name
        last = u.last_name
        
        # 1. Check if manually mapped
        if u.email in MAPPED_NAMES:
            first, last = MAPPED_NAMES[u.email]
            print(f"Mapped {u.email} -> {first} {last}")
        else:
            # 2. Check if has GitHub stats
            freelancer = db.query(Freelancer).filter(Freelancer.user_id == u.id).first()
            if freelancer and freelancer.github_stats:
                try:
                    stats = json.loads(freelancer.github_stats)
                    github_name = stats.get("name")
                    if github_name:
                        parts = github_name.strip().split(None, 1)
                        if len(parts) == 1:
                            first = parts[0]
                            last = ""
                        elif len(parts) > 1:
                            first = parts[0]
                            last = parts[1]
                        print(f"Extracted from GitHub for {u.email} -> {first} {last}")
                except Exception as e:
                    print(f"Failed to parse github_stats for user {u.id}: {e}")
            
            # 3. Fallback: split email if still null
            if not first and not last:
                prefix = u.email.split("@")[0]
                # Capitalize nicely
                first = prefix.capitalize()
                last = ""
                print(f"Fallback split email {u.email} -> {first} {last}")

        # Update if changed
        if u.first_name != first or u.last_name != last:
            u.first_name = first
            u.last_name = last
            updated_count += 1

    db.commit()
    print(f"Successfully patched {updated_count} user names in the database!")

except Exception as e:
    db.rollback()
    print(f"Error executing patch: {e}")
finally:
    db.close()
