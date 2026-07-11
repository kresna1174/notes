import os
from agents.extensions.models.any_llm_model import AnyLLMModel
from agents import ModelSettings

# ── Monkeypatch ChatCompletionChunk to prevent OpenRouter 'error' finish_reason crashes ──
try:
    from openai.types.chat.chat_completion_chunk import ChatCompletionChunk
    original_model_validate = ChatCompletionChunk.model_validate

    @classmethod
    def patched_model_validate(cls, obj, *args, **kwargs):
        allowed_service_tiers = {'auto', 'default', 'flex', 'scale', 'priority'}
        if isinstance(obj, dict):
            # Normalize finish_reason
            choices = obj.get("choices", [])
            for choice in choices:
                if isinstance(choice, dict) and choice.get("finish_reason") == "error":
                    choice["finish_reason"] = "stop"
            # Normalize service_tier
            service_tier = obj.get("service_tier")
            if service_tier is not None and service_tier not in allowed_service_tiers:
                obj["service_tier"] = "default"
        elif hasattr(obj, "choices"):
            # Normalize finish_reason
            if obj.choices:
                for choice in obj.choices:
                    if hasattr(choice, "finish_reason") and getattr(choice, "finish_reason") == "error":
                        try:
                            choice.finish_reason = "stop"
                        except Exception:
                            pass
            # Normalize service_tier
            if hasattr(obj, "service_tier"):
                try:
                    st = getattr(obj, "service_tier")
                    if st is not None and st not in allowed_service_tiers:
                        obj.service_tier = "default"
                except Exception:
                    pass
        return original_model_validate(obj, *args, **kwargs)

    ChatCompletionChunk.model_validate = patched_model_validate
except Exception:
    pass

# Disable tracing to avoid connection issues with OpenAI dashboard
os.environ["OPENAI_AGENTS_DISABLE_TRACING"] = "1"

# Initialize AnyLLMModel for OpenRouter
openrouter_model = AnyLLMModel(
    model=os.getenv("OPENROUTER_MODEL", "mistralai/mistral-7b-instruct:free"),
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

default_model_settings = ModelSettings(include_usage=True)

def get_model():
    return openrouter_model
