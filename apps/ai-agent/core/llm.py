import os
from agents.extensions.models.any_llm_model import AnyLLMModel
from agents import ModelSettings
from core.settings import settings

# ── Langfuse observability via OpenTelemetry + OpenInference ─────────────────
def _setup_langfuse():
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        return
    try:
        import base64
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry import trace
        from openinference.instrumentation.openai_agents import OpenAIAgentsInstrumentor

        auth = base64.b64encode(
            f"{settings.langfuse_public_key}:{settings.langfuse_secret_key}".encode()
        ).decode()

        exporter = OTLPSpanExporter(
            endpoint=f"{settings.langfuse_host}/api/public/otel/v1/traces",
            headers={
                "Authorization": f"Basic {auth}",
                "x-langfuse-ingestion-version": "4",
            },
        )

        provider = TracerProvider()
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        OpenAIAgentsInstrumentor().instrument(tracer_provider=provider)
        print("[langfuse] OpenAI Agents instrumentation enabled")
    except Exception as e:
        print(f"[langfuse] Failed to setup instrumentation: {e}")

_setup_langfuse()

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

# Initialize AnyLLMModel for OpenRouter
openrouter_model = AnyLLMModel(
    model=os.getenv("OPENROUTER_MODEL", "openrouter/google/gemini-3.5-flash"),
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

default_model_settings = ModelSettings(include_usage=True)

def get_model():
    return openrouter_model
