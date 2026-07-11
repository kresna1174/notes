import os
from pathlib import Path
from typing import ClassVar

from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_project_root() -> Path:
    # Under apps/ai-agent/core/settings.py, parent.parent is apps/ai-agent
    return Path(__file__).resolve().parent.parent


PROJECT_ROOT = _find_project_root()


class Settings(BaseSettings):
    backend_root: Path = PROJECT_ROOT
    project_root: Path = PROJECT_ROOT

    storage_dir: Path = PROJECT_ROOT / "data"
    upload_dir: Path = PROJECT_ROOT / "data/uploads"
    ocr_dir: Path = PROJECT_ROOT / "data/ocr"
    chroma_dir: Path = PROJECT_ROOT / "data/chroma"

    mistralai_api_key: str = "Q5XQQHiClhzTDVDvGy3dtZpbuoFq6z4N"
    mistral_ocr_model: str = "mistral-ocr-2512"
    chroma_collection: str = "documents_v2"
    
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    # OpenRouter settings
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_chat_model: str = "google/gemini-2.5-flash"

    model_config: ClassVar[SettingsConfigDict] = SettingsConfigDict(
        env_prefix="",
        env_file=PROJECT_ROOT / ".env",
        extra="ignore",
    )

    def ensure_storage(self) -> None:
        for path in (self.storage_dir, self.upload_dir, self.ocr_dir, self.chroma_dir):
            path.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_storage()
