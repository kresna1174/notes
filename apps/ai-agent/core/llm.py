import os
from agents.extensions.models.any_llm_model import AnyLLMModel

# Disable tracing to avoid connection issues with OpenAI dashboard
os.environ["OPENAI_AGENTS_DISABLE_TRACING"] = "1"

# Inisialisasi AnyLLMModel untuk OpenRouter
openrouter_model = AnyLLMModel(
    model=os.getenv("OPENROUTER_MODEL", "google/gemini-2.5-flash:free"),
    base_url=os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"),
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

def get_model():
    return openrouter_model
