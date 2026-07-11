import json
import os
import re

from modules.schemas import ChatAttachment


def normalize_content(content) -> str:
    if not content:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for part in content:
            parts.append(normalize_content(part))
        return "".join(parts)
    if isinstance(content, dict):
        text_val = content.get("text")
        if isinstance(text_val, dict):
            return text_val.get("value", "")
        elif isinstance(text_val, str):
            return text_val
        if "value" in content:
            return content.get("value")
        return str(content)

    if hasattr(content, "text"):
        text_attr = content.text
        if hasattr(text_attr, "value"):
            return text_attr.value
        elif isinstance(text_attr, str):
            return text_attr
    if hasattr(content, "value"):
        return content.value
    return str(content)


def sse(payload: dict):
    return f"data: {json.dumps(payload)}\n\n"


def vercel_data(payload):
    """Vercel AI Data Stream Protocol - type 2 (data part)."""
    return f"2:{json.dumps([payload])}\n"


def safe_jsonable(value):
    return json.loads(json.dumps(value, default=str))


def parse_attachment(attachment: ChatAttachment) -> str:
    full_path = os.path.join("..", "web", attachment.filePath)

    if not os.path.exists(full_path):
        full_path = attachment.filePath
        if not os.path.exists(full_path):
            return f"[Error: File {attachment.filename} not found on server]"

    ext = os.path.splitext(attachment.filename)[1].lower()

    try:
        if ext == '.pdf':
            import pypdf
            reader = pypdf.PdfReader(full_path)
            text_parts = []
            for i, page in enumerate(reader.pages):
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(f"--- Page {i+1} ---\n{page_text}")
            return "\n\n".join(text_parts)

        elif ext in ['.csv', '.xlsx', '.xls']:
            import pandas as pd
            if ext == '.csv':
                df = pd.read_csv(full_path)
            else:
                df = pd.read_excel(full_path)
            return df.to_markdown(index=False)

        elif ext in ['.txt', '.md', '.json']:
            with open(full_path, 'r', encoding='utf-8', errors='ignore') as f:
                return f.read()

        elif ext in ['.png', '.jpg', '.jpeg', '.webp']:
            return f"[Image Attachment: {attachment.filename} uploaded at {attachment.filePath}]"

        else:
            return f"[Unsupported file type: {attachment.filename}]"

    except Exception as e:
        return f"[Error parsing file {attachment.filename}: {str(e)}]"
