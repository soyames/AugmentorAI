"""
LLM service — DeepSeek primary, Ollama fallback
"""
import httpx
import os
from typing import Optional, List, Dict
from dotenv import load_dotenv

load_dotenv()

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen2.5-coder:3b")


class LLMService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=60.0)

    async def _call_deepseek(self, messages: list, max_tokens: int = 800, temperature: float = 0.7) -> str:
        """Call DeepSeek API (OpenAI-compatible)."""
        if not DEEPSEEK_API_KEY:
            raise ValueError("No DeepSeek API key")
        response = await self.client.post(
            f"{DEEPSEEK_BASE_URL}/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_API_KEY}"},
            json={
                "model": "deepseek-chat",
                "messages": messages,
                "max_tokens": max_tokens,
                "temperature": temperature,
            },
        )
        response.raise_for_status()
        return response.json()["choices"][0]["message"]["content"]

    async def _call_ollama(self, messages: list, model: str, max_tokens: int = 800, temperature: float = 0.7) -> str:
        """Call local Ollama."""
        response = await self.client.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model,
                "messages": messages,
                "stream": False,
                "options": {"num_predict": max_tokens, "temperature": temperature},
            },
        )
        response.raise_for_status()
        return response.json().get("message", {}).get("content", "")

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        model: str = DEFAULT_MODEL,
        max_tokens: int = 800,
        temperature: float = 0.7,
    ) -> str:
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        # Try DeepSeek first (cheapest + best quality)
        if DEEPSEEK_API_KEY:
            try:
                return await self._call_deepseek(messages, max_tokens, temperature)
            except Exception as e:
                print(f"DeepSeek failed, falling back to Ollama: {e}")

        # Fallback to Ollama (free, local)
        try:
            return await self._call_ollama(messages, model, max_tokens, temperature)
        except Exception as e:
            return f"Error: Both DeepSeek and Ollama unavailable. {e}"

    async def generate_interview_answer(
        self,
        question: str,
        context: Dict[str, str],
        language: str = "en",
        model: str = DEFAULT_MODEL,
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
        )

        result = {"short": "", "detailed": "", "points": []}
        current = None
        for line in response.split("\n"):
            line = line.strip()
            if line.startswith("SHORT:"):
                current = "short"; result["short"] = line[6:].strip()
            elif line.startswith("DETAILED:"):
                current = "detailed"; result["detailed"] = line[9:].strip()
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

    async def list_models(self) -> List[str]:
        models = []
        if DEEPSEEK_API_KEY:
            models.extend(["deepseek-chat", "deepseek-reasoner"])
        try:
            r = await self.client.get(f"{OLLAMA_URL}/api/tags")
            if r.status_code == 200:
                models += [m["name"] for m in r.json().get("models", [])]
        except Exception:
            pass
        return models

    async def check_connection(self) -> bool:
        if DEEPSEEK_API_KEY:
            return True
        try:
            r = await self.client.get(f"{OLLAMA_URL}/api/tags")
            return r.status_code == 200
        except Exception:
            return False


_service: Optional[LLMService] = None

def get_ollama_service(base_url: str = "") -> LLMService:
    global _service
    if _service is None:
        _service = LLMService()
    return _service
