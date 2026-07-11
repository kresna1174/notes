from mistralai.client import Mistral

from core.settings import settings

mistral_client = Mistral(api_key=settings.mistralai_api_key)
