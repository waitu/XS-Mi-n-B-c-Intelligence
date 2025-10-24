import os
from collections.abc import Iterator
from pathlib import Path

import pytest

from app import database


@pytest.fixture(autouse=True)
def configure_test_db(tmp_path: Path) -> Iterator[None]:
    db_file = tmp_path / "test.sqlite3"
    os.environ["XSMB_DATABASE_URL"] = f"sqlite:///{db_file.as_posix()}"
    database.set_engine()
    database.init_db()
    yield
