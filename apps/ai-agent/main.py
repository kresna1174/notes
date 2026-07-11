import os
import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

# Logger setup
logger = logging.getLogger("ai-agent")
logger.setLevel(logging.INFO)

if not logger.handlers:
    log_path = os.path.join(os.getenv("LOG_DIR", "."), "ai_agent.log")
    file_handler = logging.FileHandler(log_path, encoding="utf-8")
    file_handler.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)

    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    file_handler.setFormatter(formatter)
    console_handler.setFormatter(formatter)

    logger.addHandler(file_handler)
    logger.addHandler(console_handler)

from fastapi import FastAPI
from scalar_fastapi import get_scalar_api_reference

from core.database import engine, Base
from sqlmodel import SQLModel
from models.engine import engine as rag_engine
import models.database
from modules.chat.api import _register_routes
from modules.documents.router import router as documents_router
from modules.pages.router import router as pages_router
from modules.queries.router import router as queries_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Create RAG database tables
    SQLModel.metadata.create_all(rag_engine)
    yield
    await engine.dispose()


app = FastAPI(
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

_register_routes(app)
app.include_router(documents_router)
app.include_router(pages_router)
app.include_router(queries_router)


@app.get("/docs", include_in_schema=False)
async def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title="AI Agent API Reference",
    )
