"""
Hermes agent bridge — exposes Hermes delegation via REST API.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any

from app.services.hermes_client import get_hermes_delegator

router = APIRouter(prefix="/api/hermes", tags=["hermes"])


class DelegateRequest(BaseModel):
    goal: str
    context: str = ""


@router.get("/health")
async def hermes_health():
    """Check if Hermes API is reachable."""
    client = get_hermes_delegator()
    try:
        result = await client.delegate('say "ok" and nothing else', max_tokens=10)
        return {"status": "connected", "ping": result.strip().lower() == "ok"}
    except Exception as e:
        return {"status": "unreachable", "error": str(e)}


@router.post("/delegate")
async def delegate_to_hermes(req: DelegateRequest):
    """Delegate a task to Hermes for autonomous execution."""
    client = get_hermes_delegator()
    try:
        result = await client.delegate(req.goal, req.context)
        return {"result": result}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/search")
async def web_search(query: str):
    """Web search via Hermes."""
    client = get_hermes_delegator()
    try:
        results = await client.web_search(query)
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
