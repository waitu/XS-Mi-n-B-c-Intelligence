from contextlib import contextmanager
from typing import Iterator

from sqlmodel import SQLModel, Session, create_engine

from .config import get_settings


settings = get_settings()
engine = create_engine(settings.database_url, echo=False, connect_args={"check_same_thread": False})


def set_engine() -> None:
    """Reconfigure the global engine (useful after changing settings/env)."""

    global engine, settings

    get_settings.cache_clear()
    settings = get_settings()
    target_url = settings.database_url

    engine = create_engine(target_url, echo=False, connect_args={"check_same_thread": False})


def init_db() -> None:
    from . import models  # noqa: F401  # Ensure models are imported for metadata

    SQLModel.metadata.create_all(engine)


@contextmanager
def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
