"""
Alembic env.py — async migration runner.
Imports all models so autogenerate can detect schema changes.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import get_settings
from app.database import Base, get_db_connection_args

# Import all models so Base.metadata has everything for autogenerate
import app.models  # noqa: F401

settings = get_settings()

# Alembic Config object
config = context.config

parsed_url, engine_kwargs = get_db_connection_args(settings.DATABASE_URL, settings.DEBUG)
connect_args = engine_kwargs.get("connect_args", {})

# Override sqlalchemy.url from env var
config.set_main_option("sqlalchemy.url", parsed_url)

# Setup logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Target metadata for autogenerate
target_metadata = Base.metadata


def include_object(object, name, type_, reflected, compare_to):
    """Exclude temporary tables created by SQLite batch operations."""
    if type_ == "table" and name and name.startswith("_alembic_tmp"):
        return False
    return True


def compare_type(context, inspected_column, metadata_column, inspected_type, metadata_type):
    """Handle dialect-specific type comparisons, e.g., SQLite UUID reflection."""
    if context.dialect.name == "sqlite":
        meta_type_str = str(metadata_type).upper()
        if "UUID" in meta_type_str or "JSON" in meta_type_str:
            return False
    return None


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (SQL generation only)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        include_object=include_object,
        compare_type=compare_type,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Configure and run migrations on a given connection."""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        include_object=include_object,
        compare_type=compare_type,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Create an async engine and run migrations."""
    url = config.get_main_option("sqlalchemy.url")
    connectable = create_async_engine(
        url,
        poolclass=pool.NullPool,
        connect_args=connect_args,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode with async engine."""
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
