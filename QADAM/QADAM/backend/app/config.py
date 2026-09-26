from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Qadam API"
    debug: bool = False

    database_url: str = "postgresql+psycopg://qadam:qadam@localhost:5432/qadam"

    jwt_secret_key: str = "change-me-in-production-use-long-random-string"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001"
    )

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str | None = None

    redis_url: str | None = None
    telegram_bot_token: str | None = None
    telegram_bot_username: str | None = None
    telegram_webhook_secret: str | None = None
    telegram_link_ttl_seconds: int = 900
    telegram_web_app_url: str | None = None
    reminder_interval_seconds: int = 180
    reminder_max_nudges_per_task_per_day: int = 80
    worker_poll_seconds: int = 60

    youtube_api_key: str | None = None

    upload_dir: str = "./data/uploads"
    max_upload_mb: int = 10

    @field_validator(
        "openai_api_key",
        "openai_base_url",
        "redis_url",
        "telegram_bot_token",
        "telegram_bot_username",
        "telegram_webhook_secret",
        "telegram_web_app_url",
        "youtube_api_key",
        mode="before",
    )
    @classmethod
    def empty_optional_strings(cls, v: object) -> str | None:
        if v is None:
            return None
        if isinstance(v, str) and not v.strip():
            return None
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


def cors_origin_list() -> list[str]:
    raw = get_settings().cors_origins
    return [o.strip() for o in raw.split(",") if o.strip()]
