from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from models.engine import get_session
from modules.documents import methods
from modules.documents.schema import PageResponse

router = APIRouter(prefix="/api/pages", tags=["pages"])


@router.get(
    "/{page_id}",
    response_model=PageResponse,
)
def get_page(
    page_id: str,
    session: Annotated[Session, Depends(get_session)],
) -> PageResponse:
    page = methods.get_page_by_id(session, page_id)
    if page is None:
        raise HTTPException(status_code=404, detail="Page not found")

    return page
