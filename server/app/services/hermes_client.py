"""
Hermes API client — model provider + task delegator.

Model provider:
  Hermes runs an OpenAI-compatible endpoint at HERMES_API_URL
  (default http://127.0.0.1:8642).  It is inserted into the LLMService
  provider chain so that AugmentorAI can dispatch prompts through it.

Task delegator:
  Sends autonomous tasks to Hermes via the chat completions API.
  Hermes uses its own tools (web_search, terminal, delegate_task, etc.)
  to fulfil the request.  No direct MCP tool proxy needed.
"""

import json
import os
from typing import Optional, Dict, List, Any

import httpx

HERMES_API_URL = os.getenv("HERMES_API_URL", "http://127.0.0.1:8642")
HERMES_MODEL = os.getenv("HERMES_MODEL", "deepseek-chat")
HERMES_DEFAULT_PROVIDER = os.getenv("HERMES_DEFAULT_PROVIDER", "deepseek")
TIMEOUT = float(os.getenv("HERMES_TIMEOUT", "60"))


# ---------------------------------------------------------------------------
# Provider helpers (OpenAI-compatible chat)
# ---------------------------------------------------------------------------

def build_config(settings: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    settings = settings or {}
    return {
        "hermes_api_url": settings.get("hermes_api_url") or HERMES_API_URL,
        "hermes_model": settings.get("hermes_model") or HERMES_MODEL,
        "hermes_provider": settings.get("hermes_provider") or HERMES_DEFAULT_PROVIDER,
    }


def model_from_config(cfg: Dict[str, str]) -> str:
    return cfg["hermes_model"]


async def call_hermes(
    client: httpx.AsyncClient,
    messages: list,
    api_url: str,
    model: str,
    max_tokens: int = 800,
    temperature: float = 0.7,
) -> str:
    """Call Hermes' OpenAI-compatible /v1/chat/completions endpoint."""
    payload = {
        "model": model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    response = await client.post(
        f"{api_url}/v1/chat/completions",
        json=payload,
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
# Task Delegator — sends autonomous jobs to Hermes via chat completions
# ---------------------------------------------------------------------------

class HermesDelegator:
    """Delegates autonomous tasks to the Hermes AI agent.

    Uses the chat completions API with a delegation system prompt.
    Hermes will use its own tools (web_search, terminal, etc.) to
    accomplish the task and return the result.
    """

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
        """Send a task to Hermes for autonomous execution.

        Hermes will use its own tool chain (web search, code execution,
        file ops, etc.) to carry out the goal.
        """
        system_prompt = (
            "You are KAI (@SoyamesBot), an autonomous AI operations agent. "
            "You have access to tools: web_search, read_file, write_file, "
            "terminal, delegate_task, and memory. "
            "For this task, use your tools as needed and report back the result. "
            "Be thorough and self-contained."
        )
        user_prompt = f"## Task\n{goal}\n\n"
        if context:
            user_prompt += f"## Context\n{context}\n\n"
        user_prompt += (
            "Use your tools to complete this task. "
            "When done, provide a concise summary of what you did and the result."
        )

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
        )
        if response.status_code >= 400:
            return f"Delegation failed: HTTP {response.status_code}: {response.text[:300]}"

        data = response.json()
        choices = data.get("choices", [])
        if not choices:
            return "Delegation failed: no response from Hermes"

        return choices[0].get("message", {}).get("content", "").strip()

    async def web_search(self, query: str) -> List[Dict[str, str]]:
        """Search the web by asking Hermes to use its web_search tool."""
        result = await self.delegate(
            f"Search the web for: {query}",
            "Return the results as a JSON list of {url, title, description} objects. "
            "Only return valid JSON, nothing else.",
            max_tokens=1500,
        )
        try:
            parsed = json.loads(result)
            if isinstance(parsed, list):
                return parsed
            return [{"result": result}]
        except (json.JSONDecodeError, TypeError):
            return [{"result": result}]


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------

_delegator: Optional[HermesDelegator] = None


def get_hermes_delegator() -> HermesDelegator:
    global _delegator
    if _delegator is None:
        _delegator = HermesDelegator()
    return _delegator
