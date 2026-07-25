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
    chroma_host: str = "localhost"
    chroma_port: int = 8001

    mistralai_api_key: str = "Q5XQQHiClhzTDVDvGy3dtZpbuoFq6z4N"
    mistral_ocr_model: str = "mistral-ocr-2512"
    chroma_collection: str = "documents_v2"
    
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/0"

    # OpenRouter settings
    openrouter_api_key: str = ""
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_chat_model: str = "google/gemini-2.5-flash"

    # Langfuse observability
    langfuse_public_key: str = ""
    langfuse_secret_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # Deep document search (Query Analyzer → Multi-Query RAG → Researcher)
    # Cosine similarity gate. cosine = 1 - distance/2 (unit-normalized embeddings).
    # Start loose (0.60 ≈ distance ≤ 0.80), tighten to 0.70 as corpus quality allows.
    rag_sim_threshold: float = 0.60
    # Number of search queries the Query Analyzer may produce (adaptive 1..N).
    top_queries: int = 5
    # Number of documents to read fully in the aggregation step.
    top_docs: int = 3
    # Top hits kept per query after the cosine gate.
    per_query_k: int = 3
    # Page neighbourhood radius when loading document context (±N pages).
    page_neighbor_radius: int = 1
    # Character cap per document when assembling researcher context (token guard).
    doc_context_char_cap: int = 12000

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
