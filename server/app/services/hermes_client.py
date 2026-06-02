"""
Hermes API client — model provider + task delegator.
"""

import json
import os
from typing import Optional, Dict, List, Any

import httpx

HERMES_API_URL = os.getenv("HERMES_API_URL", "http://127.0.0.1:8642")
HERMES_MODEL = os.getenv("HERMES_MODEL", "deepseek-chat")
HERMES_API_KEY = os.getenv("HERMES_API_KEY", "")
TIMEOUT = float(os.getenv("HERMES_TIMEOUT", "60"))


def _headers() -> Dict[str, str]:
    h = {"Content-Type": "application/json"}
    if HERMES_API_KEY:
        h["Authorization"] = f"Bearer {HERMES_API_KEY}"
    return h


# ---------------------------------------------------------------------------
# Provider helpers (OpenAI-compatible chat)
# ---------------------------------------------------------------------------

def build_config(settings: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    settings = settings or {}
    return {
        "hermes_api_url": settings.get("hermes_api_url") or HERMES_API_URL,
        "hermes_model": settings.get("hermes_model") or HERMES_MODEL,
        "hermes_api_key": settings.get("hermes_api_key") or HERMES_API_KEY,
    }


async def call_hermes(
    client: httpx.AsyncClient,
    messages: list,
    api_url: str,
    model: str,
    api_key: str = "",
    max_tokens: int = 800,
    temperature: float = 0.7,
) -> str:
    """Call Hermes' OpenAI-compatible /v1/chat/completions endpoint."""
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    response = await client.post(
        f"{api_url}/v1/chat/completions",
        json=payload,
        headers=headers,
        timeout=TIMEOUT + 10,
    )
    if response.status_code >= 400:
        preview = response.text.strip()[:300]
        raise RuntimeError(
            f"Hermes provider returned HTTP {response.status_code}: {preview}"
        )
    data = response.json()
    choices = data.get("choices", [])
    if not choices:
        raise RuntimeError("Hermes provider returned no choices")
    text = choices[0].get("message", {}).get("content", "").strip()
    if not text:
        raise RuntimeError("Hermes provider returned an empty response")
    return text


# ---------------------------------------------------------------------------
# Task Delegator
# ---------------------------------------------------------------------------

class HermesDelegator:
    """Sends autonomous tasks to the Hermes AI agent via chat completions."""

    def __init__(self, api_url: str = HERMES_API_URL, model: str = HERMES_MODEL):
        self.api_url = api_url.rstrip("/")
        self.model = model
        self._client = httpx.AsyncClient(timeout=TIMEOUT)

    async def close(self) -> None:
        await self._client.aclose()

    async def delegate(
        self,
        goal: str,
        context: str = "",
        max_tokens: int = 2000,
    ) -> str:
        system_prompt = (
            "You are KAI (@SoyamesBot), an autonomous AI operations agent. "
            "You have access to tools: web_search, terminal, read_file, write_file, "
            "delegate_task, and memory. "
            "Complete the task using your tools and report the result concisely."
        )
        user_prompt = f"## Task\n{goal}\n\n"
        if context:
            user_prompt += f"## Context\n{context}\n\n"
        user_prompt += "When done, provide a concise summary of what you did and the result."

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        payload = {
            "model": self.model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.5,
        }

        response = await self._client.post(
            f"{self.api_url}/v1/chat/completions",
            json=payload,
            headers=_headers(),
        )
        if response.status_code >= 400:
            return f"Delegation failed: HTTP {response.status_code}: {response.text[:300]}"

        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            return "Delegation failed: no response from Hermes"

        return choices[0].get("message", {}).get("content", "").strip()

    async def web_search(self, query: str) -> List[Dict[str, str]]:
        result = await self.delegate(
            f"Search the web for: {query}",
            "Return results as a JSON list of {url, title, description}. Only return valid JSON.",
            max_tokens=1500,
        )
        try:
            parsed = json.loads(result)
            if isinstance(parsed, list):
                return parsed
            return [{"result": result}]
        except (json.JSONDecodeError, TypeError):
            return [{"result": result}]


_delegator: Optional[HermesDelegator] = None


def get_hermes_delegator() -> HermesDelegator:
    global _delegator
    if _delegator is None:
        _delegator = HermesDelegator()
    return _delegator
