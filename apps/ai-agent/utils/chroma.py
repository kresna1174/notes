import os
from threading import RLock

import chromadb
import requests
from chromadb import Documents, Embeddings, EmbeddingFunction
from chromadb.api import ClientAPI

from core.settings import settings

_client: ClientAPI | None = None
_client_pid: int | None = None
chroma_lock = RLock()


class OpenRouterEmbeddingFunction(EmbeddingFunction):
    """Custom embedding function for ChromaDB that calls OpenRouter's multilingual embedding model."""

    def __init__(self, api_key: str, base_url: str, model: str = "openai/text-embedding-3-small"):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model

    def __call__(self, input: Documents) -> Embeddings:
        if not self.api_key or self.api_key.startswith("your"):
            raise ValueError("OpenRouter API key is missing. Please configure OPENROUTER_API_KEY in .env")

        url = f"{self.base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "input": input,
        }

        try:
            response = requests.post(url, headers=headers, json=payload, timeout=30)
            response.raise_for_status()
            data = response.json()
            return [item["embedding"] for item in data["data"]]
        except Exception as e:
            print(f"OpenRouter embedding API call failed: {e}")
            raise ValueError(f"Failed to generate embeddings via OpenRouter: {e}")


def get_client() -> ClientAPI:
    global _client, _client_pid

    with chroma_lock:
        current_pid = os.getpid()
        if _client is None or _client_pid != current_pid:
            settings.ensure_storage()
            _client = chromadb.PersistentClient(path=str(settings.chroma_dir))
            _client_pid = current_pid

        return _client


def get_collection():
    # Initialize the OpenRouter embedding function
    emb_fn = OpenRouterEmbeddingFunction(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
    )
    return get_client().get_or_create_collection(
        name=settings.chroma_collection,
        embedding_function=emb_fn,
    )


def get_notes_collection():
    emb_fn = OpenRouterEmbeddingFunction(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
    )
    return get_client().get_or_create_collection(
        name="note_pages",
        embedding_function=emb_fn,
    )
