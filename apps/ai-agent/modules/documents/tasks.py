from core.celery_app import celery_app
from modules.documents.methods import process_document


@celery_app.task(
    name="modules.documents.tasks.process_document_task",
    bind=True,
    max_retries=3,
    default_retry_delay=10,
)
def process_document_task(self, document_id: str) -> dict:
    try:
        metadata = process_document(document_id)
        return metadata.model_dump(mode="json")
    except Exception as exc:
        raise self.retry(exc=exc)
