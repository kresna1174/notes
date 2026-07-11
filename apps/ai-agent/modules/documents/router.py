from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from sqlmodel import Session

from models.engine import get_session
from modules.documents import methods, tasks
from modules.documents.schema import (
    DocumentMetadata,
    DocumentUploadResponse,
    PageResponse,
)

router = APIRouter(prefix="/api/documents", tags=["documents"])


@router.post(
    "",
    response_model=DocumentUploadResponse,
    status_code=201,
)
async def upload_document(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
) -> DocumentUploadResponse:
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are accepted")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    metadata = methods.create_document(session, file_bytes, file.filename or "document.pdf")
    tasks.process_document_task.delay(metadata.id)

    return DocumentUploadResponse(
        id=metadata.id,
        name=metadata.name,
        status=metadata.status,
        total_pages=metadata.total_pages,
        uploaded_at=metadata.uploaded_at,
    )


@router.get(
    "/",
    response_model=list[DocumentMetadata],
)
def list_documents(session: Session = Depends(get_session)) -> list[DocumentMetadata]:
    return methods.list_documents(session)


@router.get(
    "/{document_id}",
    response_model=DocumentMetadata | PageResponse,
)
def get_document_or_page(
    document_id: str,
    page_number: int | None = None,
    session: Session = Depends(get_session),
) -> DocumentMetadata | PageResponse:
    if page_number is None:
        metadata = methods.get_document(session, document_id)
        if metadata is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return metadata

    page = methods.get_page(session, document_id, page_number)
    if page is None:
        metadata = methods.get_document(session, document_id)
        if metadata is None:
            raise HTTPException(status_code=404, detail="Document not found")
        raise HTTPException(
            status_code=400,
            detail=f"page_number must be between 0 and {metadata.total_pages - 1}",
        )
    return page


@router.delete(
    "/{document_id}",
    status_code=204,
)
def delete_document(
    document_id: str,
    session: Session = Depends(get_session),
) -> Response:
    deleted = methods.delete_document(session, document_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")

    return Response(status_code=204)
