from fastapi import APIRouter

from modules.queries import methods
from modules.queries.schema import ChatResponse, QueryRequest, QueryResponse

router = APIRouter(prefix="/api/queries", tags=["queries"])


@router.post("", response_model=QueryResponse)
def query_chunks(request: QueryRequest) -> QueryResponse:
    return methods.search_chunks(request)


@router.post("/chat", response_model=ChatResponse)
def chat_with_documents(request: QueryRequest) -> ChatResponse:
    """Perform semantic search and synthesize an answer using OpenRouter LLM."""
    return methods.ask_agent(request)
