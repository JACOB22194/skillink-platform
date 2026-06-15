import os
from logging.config import fileConfig
from sqlalchemy import engine_from_config, pool
from alembic import context

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Prioritize TEST_DATABASE_URL, then programmatic config, and fallback to DATABASE_URL
database_url = os.getenv("TEST_DATABASE_URL")
if not database_url:
    database_url = config.get_main_option("sqlalchemy.url")
if not database_url:
    database_url = os.getenv("DATABASE_URL")

if database_url:
    config.set_main_option("sqlalchemy.url", database_url)
else:
    raise RuntimeError("DATABASE_URL environment variable or sqlalchemy.url config option is required for Alembic migrations.")

# Import models so autogenerate can see the metadata
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from db import Base
import models  # noqa: F401 — registers all ORM classes

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
