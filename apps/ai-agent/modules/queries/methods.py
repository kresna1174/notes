import requests
from chromadb.api.types import Where

from core.settings import settings
from modules.queries.schema import (
    ChatResponse,
    QueryHit,
    QueryRequest,
    QueryResponse,
    hit_from_chroma,
)
from utils.chroma import chroma_lock, get_collection


def search_chunks(request: QueryRequest) -> QueryResponse:
    collection = get_collection()
    where: Where | None = None

    if request.document_id is not None:
        where = {"document_id": request.document_id}

    with chroma_lock:
        raw = collection.query(
            query_texts=[request.query],
            n_results=request.n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
        )

    documents = (raw.get("documents") or [[]])[0]
    ids = (raw.get("ids") or [[]])[0]
    metadatas = (raw.get("metadatas") or [[]])[0]
    distances = (raw.get("distances") or [[]])[0]

    hits: list[QueryHit] = []
    for index, document in enumerate(documents):
        metadata: dict[str, object] = (
            dict(metadatas[index]) if index < len(metadatas) and metadatas[index] else {}
        )
        distance = distances[index] if index < len(distances) else None
        page_id = ids[index] if index < len(ids) else None
        hits.append(
            hit_from_chroma(
                {
                    "id": page_id,
                    "document": document,
                    "metadata": metadata,
                    "distance": distance,
                }
            )
        )

    return QueryResponse(query=request.query, hits=hits)


def ask_agent(request: QueryRequest) -> ChatResponse:
    """Search documents in ChromaDB and use OpenRouter LLM to synthesize a contextual answer."""
    # 1. Search matching chunks
    search_res = search_chunks(request)
    hits = search_res.hits

    if not hits:
        return ChatResponse(
            query=request.query,
            answer="No relevant documents found. Please upload documents first and try again.",
            hits=[],
        )

    # 2. Format context and document metadata from hits
    docs_metadata = {}
    for hit in hits:
        docs_metadata[hit.document_id] = {
            "name": hit.document_name,
            "total_pages": hit.total_pages
        }

    metadata_lines = []
    for doc_id, meta in docs_metadata.items():
        metadata_lines.append(f"- Document Name: '{meta['name']}' has a total of {meta['total_pages']} pages.")
    metadata_str = "\n".join(metadata_lines)

    context_parts = []
    for hit in hits:
        context_parts.append(
            f"[Document: {hit.document_name}, Page: {hit.page_number + 1} of {hit.total_pages}]\n{hit.text}"
        )
    context_str = "\n\n---\n\n".join(context_parts)

    # 3. Call OpenRouter API
    system_prompt = (
        "You are an expert AI Assistant specialized in answering questions about uploaded documents (RAG).\n"
        "Your task is to answer the user's question using the provided document metadata and context below.\n"
        "Be concise, clear, and direct. Cite the document name and page numbers where applicable.\n"
        "If the answer cannot be found in the provided context or metadata, state that you cannot find the answer.\n\n"
        f"Document Metadata:\n{metadata_str}\n\n"
        f"Context:\n{context_str}"
    )
    user_prompt = f"Question: {request.query}"

    url = f"{settings.openrouter_base_url}/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.openrouter_chat_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.2,
    }

    try:
        response = requests.post(url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        answer = data["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"OpenRouter API call failed: {e}")
        answer = f"Error: Unable to generate response from OpenRouter ({str(e)})"

    return ChatResponse(query=request.query, answer=answer, hits=hits)
