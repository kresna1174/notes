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
from modules.api import _register_routes


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
)

_register_routes(app)


@app.get("/docs", include_in_schema=False)
async def scalar_html():
    return get_scalar_api_reference(
        openapi_url=app.openapi_url,
        title="AI Agent API Reference",
    )
