import base64
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import TypedDict

from chromadb.api.types import Metadata
from sqlmodel import Session, col, select

from core.settings import settings
from models.database import Document, DocumentPage, DocumentStatus
from models.engine import engine
from modules.documents.schema import DocumentMetadata, PageResponse
from utils.chroma import chroma_lock, get_collection
from utils.mistral import mistral_client


class OcrPage(TypedDict):
    index: int
    markdown: str


def make_page_id(document_id: str, page_number: int) -> str:
    return f"doc-{document_id}-page-{page_number}"


def parse_page_id(page_id: str) -> tuple[str, int] | None:
    prefix = "doc-"
    separator = "-page-"
    if not page_id.startswith(prefix) or separator not in page_id:
        return None

    document_id, page_number_text = page_id.removeprefix(prefix).rsplit(separator, 1)
    if not document_id or not page_number_text.isdigit():
        return None

    return document_id, int(page_number_text)


def _save_upload(file_bytes: bytes, original_name: str) -> tuple[str, Path]:
    document_id = str(uuid.uuid4())
    safe_name = Path(original_name).name or "document.pdf"
    target = settings.upload_dir / f"{document_id}_{safe_name}"
    _ = target.write_bytes(file_bytes)
    return document_id, target


def _run_ocr(pdf_path: Path) -> list[OcrPage]:
    if settings.mistralai_api_key and not settings.mistralai_api_key.startswith("your"):
        try:
            base64_pdf = base64.b64encode(pdf_path.read_bytes()).decode("utf-8")
            result = mistral_client.ocr.process(
                model="mistral-ocr-2512",
                document={
                    "type": "document_url",
                    "document_url": f"data:application/pdf;base64,{base64_pdf}",
                },
                include_image_base64=False,
            )
            return [{"index": page.index, "markdown": page.markdown} for page in result.pages]
        except Exception as e:
            print(f"Mistral OCR failed, falling back to pypdf: {e}")

    # Fallback to local pypdf text extraction
    from pypdf import PdfReader
    reader = PdfReader(pdf_path)
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append({"index": i, "markdown": text})
    return pages


def _persist_pages(document_id: str, pages: list[OcrPage]) -> Path:
    doc_dir = settings.ocr_dir / document_id
    doc_dir.mkdir(parents=True, exist_ok=True)
    for page in pages:
        _ = (doc_dir / f"page_{page['index']}.md").write_text(page["markdown"])
    return doc_dir


def _index_pages(document_id: str, document_name: str, pages: list[OcrPage]) -> int:
    if not pages:
        return 0

    ids = [make_page_id(document_id, page["index"]) for page in pages]
    documents = [page["markdown"] for page in pages]
    metadatas: list[Metadata] = [
        {
            "document_id": document_id,
            "document_name": document_name,
            "page_number": page["index"],
            "total_pages": len(pages),
        }
        for page in pages
    ]
    with chroma_lock:
        collection = get_collection()
        _ = collection.delete(where={"document_id": document_id})
        collection.add(ids=ids, documents=documents, metadatas=metadatas)
    return len(pages)


def _delete_page_rows(session: Session, document_id: str) -> None:
    rows = session.exec(
        select(DocumentPage).where(col(DocumentPage.document_id) == document_id)
    ).all()
    for row in rows:
        session.delete(row)


def _create_page_rows(session: Session, document_id: str, pages: list[OcrPage]) -> None:
    _delete_page_rows(session, document_id)

    for page in pages:
        page_number = page["index"]
        session.add(
            DocumentPage(
                id=make_page_id(document_id, page_number),
                document_id=document_id,
                page_number=page_number,
                path=str(settings.ocr_dir / document_id / f"page_{page_number}.md"),
            )
        )


def _to_metadata(record: Document) -> DocumentMetadata:
    return DocumentMetadata(
        id=record.id,
        name=record.name,
        status=record.status,
        uploaded_at=record.uploaded_at,
        total_pages=record.total_pages,
    )


def create_document(
    session: Session,
    file_bytes: bytes,
    original_name: str,
) -> DocumentMetadata:
    document_id, saved_path = _save_upload(file_bytes, original_name)
    record = Document(
        id=document_id,
        name=saved_path.name,
        path=str(saved_path),
        uploaded_at=datetime.now(timezone.utc),
        status=DocumentStatus.PROCESSING,
        total_pages=0,
    )
    session.add(record)
    session.commit()
    session.refresh(record)
    return _to_metadata(record)


def process_document(document_id: str) -> DocumentMetadata:
    with Session(engine) as session:
        record = session.get(Document, document_id)
        if record is None:
            raise ValueError(f"Document {document_id} not found")

        try:
            pdf_path = Path(record.path)
            pages = _run_ocr(pdf_path)
            _ = _persist_pages(record.id, pages)
            _ = _index_pages(record.id, record.name, pages)
            _create_page_rows(session, record.id, pages)
            record.status = DocumentStatus.READY
            record.total_pages = len(pages)
        except Exception:
            record.status = DocumentStatus.FAILED
            raise
        finally:
            session.add(record)
            session.commit()
            session.refresh(record)

        return _to_metadata(record)


def list_documents(session: Session) -> list[DocumentMetadata]:
    rows = session.exec(select(Document).order_by(col(Document.uploaded_at).desc())).all()
    return [_to_metadata(row) for row in rows]


def get_document(session: Session, document_id: str) -> DocumentMetadata | None:
    row = session.get(Document, document_id)
    if row is None:
        return None
    return _to_metadata(row)


def delete_document(session: Session, document_id: str) -> bool:
    row = session.get(Document, document_id)
    if row is None:
        return False

    with chroma_lock:
        collection = get_collection()
        _ = collection.delete(where={"document_id": document_id})

    _delete_page_rows(session, document_id)

    upload_path = Path(row.path)
    upload_path.unlink(missing_ok=True)
    shutil.rmtree(settings.ocr_dir / document_id, ignore_errors=True)

    session.delete(row)
    session.commit()
    return True


def get_page(
    session: Session,
    document_id: str,
    page_number: int,
) -> PageResponse | None:
    row = session.get(Document, document_id)
    if row is None:
        return None
    if page_number < 0 or page_number >= row.total_pages:
        return None

    page_row = session.exec(
        select(DocumentPage).where(
            col(DocumentPage.document_id) == document_id,
            col(DocumentPage.page_number) == page_number,
        )
    ).first()
    if page_row is None:
        return None

    page_path = Path(page_row.path)
    if not page_path.exists():
        return None

    return PageResponse(
        page_id=page_row.id,
        document_id=row.id,
        document_name=row.name,
        page_number=page_number,
        total_pages=row.total_pages,
        text=page_path.read_text(),
    )


def get_page_by_id(session: Session, page_id: str) -> PageResponse | None:
    page_row = session.get(DocumentPage, page_id)
    if page_row is None:
        return None

    row = session.get(Document, page_row.document_id)
    if row is None:
        return None

    page_path = Path(page_row.path)
    if not page_path.exists():
        return None

    return PageResponse(
        page_id=page_row.id,
        document_id=row.id,
        document_name=row.name,
        page_number=page_row.page_number,
        total_pages=row.total_pages,
        text=page_path.read_text(),
    )
