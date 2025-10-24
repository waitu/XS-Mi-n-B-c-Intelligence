from pathlib import Path
from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR.parent / "data"
DEFAULT_DB_PATH = DATA_DIR / "xsmb.sqlite3"

DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    xsmb_source_url_template: str = (
        "https://xoso.com.vn/xsmb-{day:02d}-{month:02d}-{year}.html"
    )
    user_agent: str = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36"
    )
    request_timeout_seconds: float = 20.0
    retry_attempts: int = 4
    retry_backoff_seconds: float = 1.5
    database_url: str = f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"
    cors_allowed_origins: list[str] = Field(default_factory=lambda: ["*"])
    auto_refresh_on_startup: bool = False
    max_results_per_page: int = 100

    class Config:
        env_file = ".env"
        env_prefix = "XSMB_"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
