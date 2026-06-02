"""
LLM service — Gemini primary, DeepSeek secondary, Ollama fallback
"""
import os
from typing import Optional, List, Dict, Tuple

import httpx
from dotenv import load_dotenv

load_dotenv()

ENV_GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
ENV_DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen2.5-coder:3b")

LLMSettings = Optional[Dict[str, str]]


class ProviderError(RuntimeError):
    def __init__(self, provider: str, message: str):
        super().__init__(message)
        self.provider = provider


class LLMService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=120.0)

    def _config(self, settings: LLMSettings = None) -> Dict[str, str]:
        settings = settings or {}
        return {
            "gemini_api_key": settings.get("gemini_api_key") or ENV_GEMINI_API_KEY,
            "gemini_base_url": settings.get("gemini_base_url") or GEMINI_BASE_URL,
            "gemini_model": settings.get("gemini_model") or GEMINI_MODEL,
            "deepseek_api_key": settings.get("deepseek_api_key") or ENV_DEEPSEEK_API_KEY,
            "deepseek_base_url": settings.get("deepseek_base_url") or DEEPSEEK_BASE_URL,
            "deepseek_model": settings.get("deepseek_model") or DEEPSEEK_MODEL,
            "ollama_url": settings.get("ollama_url") or OLLAMA_URL,
        }

    async def _raise_for_provider(self, provider: str, response: httpx.Response) -> None:
        preview = response.text.strip()[:300]
        raise ProviderError(
            provider,
            f"{provider} request failed with HTTP {response.status_code}: {preview or response.reason_phrase}",
        )

    async def _call_gemini(
        self,
        messages: list,
        api_key: str,
        base_url: str,
        model: str,
        max_tokens: int = 800,
        temperature: float = 0.7,
    ) -> str:
        """Call Gemini API directly."""
        if not api_key:
            raise ProviderError("Gemini", "No Gemini API key configured")

        system_prompt = ""
        contents = []
        for message in messages:
            role = message.get("role", "user")
            content = (message.get("content") or "").strip()
            if not content:
                continue
            if role == "system":
                system_prompt = content if not system_prompt else f"{system_prompt}\n\n{content}"
                continue
            contents.append(
                {
                    "role": "model" if role == "assistant" else "user",
                    "parts": [{"text": content}],
                }
            )

        payload: Dict[str, object] = {
            "contents": contents,
            "generationConfig": {
                "temperature": temperature,
                "maxOutputTokens": max_tokens,
            },
        }
        if system_prompt:
            payload["systemInstruction"] = {"parts": [{"text": system_prompt}]}

        response = await self.client.post(
            f"{base_url}/models/{model}:generateContent",
            params={"key": api_key},
            json=payload,
        )
        if response.status_code >= 400:
            await self._raise_for_provider("Gemini", response)

        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise ProviderError("Gemini", "Gemini returned no candidates")

        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(part.get("text", "") for part in parts).strip()
        if not text:
            raise ProviderError("Gemini", "Gemini returned an empty response")
        return text

    async def _call_deepseek(
        self,
        messages: list,
        api_key: str,
        base_url: str,
        model: str,
        max_tokens: int = 800,
        temperature: float = 0.7,
    ) -> str:
        """Call DeepSeek API (OpenAI-compatible)."""
        if not api_key:
            raise ProviderError("DeepSeek", "No DeepSeek API key configured")
        response = await self.client.post(
            f"{base_url}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        if response.status_code >= 400:
            await self._raise_for_provider("DeepSeek", response)

        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            raise ProviderError("DeepSeek", "DeepSeek returned no choices")

        text = choices[0].get("message", {}).get("content", "").strip()
        if not text:
            raise ProviderError("DeepSeek", "DeepSeek returned an empty response")
        return text

    async def _call_ollama(
        self,
        messages: list,
        base_url: str,
        model: str,
        max_tokens: int = 800,
        temperature: float = 0.7,
    ) -> str:
        """Call local Ollama."""
        response = await self.client.post(
            f"{base_url}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {"num_predict": max_tokens, "temperature": temperature},
            },
        )
        if response.status_code >= 400:
            await self._raise_for_provider("Ollama", response)

        text = response.json().get("message", {}).get("content", "").strip()
        if not text:
            raise ProviderError("Ollama", "Ollama returned an empty response")
        return text

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 800,
        temperature: float = 0.7,
        settings: LLMSettings = None,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        config = self._config(settings)
        attempts = []
        if config["gemini_api_key"]:
            attempts.append(
                (
                    "Gemini",
                    lambda: self._call_gemini(
                        messages,
                        config["gemini_api_key"],
                        config["gemini_base_url"],
                        config["gemini_model"],
                        max_tokens,
                        temperature,
                    ),
                )
            )
        if config["deepseek_api_key"]:
            attempts.append(
                (
                    "DeepSeek",
                    lambda: self._call_deepseek(
                        messages,
                        config["deepseek_api_key"],
                        config["deepseek_base_url"],
                        config["deepseek_model"],
                        max_tokens,
                        temperature,
                    ),
                )
            )
        attempts.append(
            (
                "Ollama",
                lambda: self._call_ollama(
                    messages,
                    config["ollama_url"],
                    model,
                    max_tokens,
                    temperature,
                ),
            )
        )

        errors = []
        for provider, runner in attempts:
            try:
                return await runner()
            except ProviderError as e:
                errors.append(f"{e.provider}: {e}")
                print(f"{e.provider} failed, falling back to the next provider: {e}")
            except Exception as e:
                errors.append(f"{provider}: {e}")
                print(f"{provider} failed, falling back to the next provider: {e}")

        return f"Error: all AI providers failed. {' | '.join(errors) if errors else 'No providers available.'}"

    async def generate_interview_answer(
        self,
        question: str,
        context: Dict[str, str],
        language: str = "en",
        model: str = DEFAULT_MODEL,
        settings: LLMSettings = None,
    ) -> Dict:
        resume_ctx = context.get("resume", "").strip()
        job_ctx = context.get("job_description", "").strip()
        notes_ctx = context.get("notes", "").strip()

        context_block = ""
        if resume_ctx:
            context_block += f"\n\nCANDIDATE RESUME:\n{resume_ctx[:2000]}"
        if job_ctx:
            context_block += f"\n\nJOB DESCRIPTION:\n{job_ctx[:1000]}"
        if notes_ctx:
            context_block += f"\n\nADDITIONAL NOTES:\n{notes_ctx[:500]}"

        system_prompt = f"""You are an expert interview coach helping a candidate succeed.
Use the provided context to give grounded, specific answers based on the candidate's actual experience.
For behavioral questions, use STAR method. Be concise but complete.
Respond in: {language}{context_block}"""

        prompt = f"""Interview question: "{question}"

Provide:
SHORT: (2-3 sentences, direct answer)
DETAILED: (full answer with examples from the resume/context above)
POINTS:
- key point 1
- key point 2
- key point 3"""

        response = await self.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            model=model,
            max_tokens=800,
            temperature=0.7,
            settings=settings,
        )

        result = {"short": "", "detailed": "", "points": []}
        current = None
        for line in response.split("\n"):
            line = line.strip()
            if line.startswith("SHORT:"):
                current = "short"
                result["short"] = line[6:].strip()
            elif line.startswith("DETAILED:"):
                current = "detailed"
                result["detailed"] = line[9:].strip()
            elif line.startswith("POINTS:"):
                current = "points"
            elif line.startswith("-") and current == "points":
                result["points"].append(line[1:].strip())
            elif current in ("short", "detailed") and line:
                result[current] += " " + line

        if not result["detailed"] and not result["short"]:
            result["detailed"] = response
            result["short"] = response[:250]

        return result

    async def list_models(self, settings: LLMSettings = None) -> List[str]:
        config = self._config(settings)
        models = []
        if config["gemini_api_key"]:
            models.extend([config["gemini_model"], "gemini-2.0-flash", "gemini-1.5-flash"])
        if config["deepseek_api_key"]:
            models.extend([config["deepseek_model"], "deepseek-chat", "deepseek-reasoner"])
        try:
            r = await self.client.get(f"{config['ollama_url']}/api/tags")
            if r.status_code == 200:
                models += [m["name"] for m in r.json().get("models", [])]
        except Exception:
            pass

        deduped = []
        for model_name in models:
            if model_name not in deduped:
                deduped.append(model_name)
        return deduped

    async def check_connection(self, settings: LLMSettings = None) -> bool:
        config = self._config(settings)
        if config["gemini_api_key"] or config["deepseek_api_key"]:
            return True
        return await self.check_ollama_connection(settings)

    async def check_ollama_connection(self, settings: LLMSettings = None) -> bool:
        config = self._config(settings)
        try:
            r = await self.client.get(f"{config['ollama_url']}/api/tags")
            return r.status_code == 200
        except Exception:
            return False


_service: Optional[LLMService] = None


def get_llm_service(base_url: str = "") -> LLMService:
    global _service
    if _service is None:
        _service = LLMService()
    return _service


def get_ollama_service(base_url: str = "") -> LLMService:
    return get_llm_service(base_url)
