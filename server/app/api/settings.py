from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from typing import Optional
import os

from app.models.database import get_db
from app.services.app_settings import effective_ollama_url, get_llm_settings, get_setting, set_setting

router = APIRouter()


class SettingsUpdate(BaseModel):
    gemini_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None
    clear_gemini_api_key: Optional[bool] = None
    clear_deepseek_api_key: Optional[bool] = None
    ollama_url: Optional[str] = None
    hermes_api_url: Optional[str] = None
    hermes_model: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    input_device: Optional[str] = None
    sample_rate: Optional[int] = None
    default_language: Optional[str] = None
    auto_detect_language: Optional[bool] = None


@router.get("")
async def get_settings(db: DBSession = Depends(get_db)):
    llm_settings = get_llm_settings(db)
    return {
        "gemini_configured": bool(llm_settings.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")),
        "deepseek_configured": bool(llm_settings.get("deepseek_api_key") or os.getenv("DEEPSEEK_API_KEY", "")),
        "ollama_url": effective_ollama_url(get_setting(db, "ollama_url", "")),
        "hermes_api_url": get_setting(db, "hermes_api_url", os.getenv("HERMES_API_URL", "http://127.0.0.1:8642")),
        "hermes_model": get_setting(db, "hermes_model", os.getenv("HERMES_MODEL", "deepseek-chat")),
        "model": get_setting(db, "model", "qwen2.5-coder:3b"),
        "max_tokens": int(get_setting(db, "max_tokens", "500")),
        "temperature": float(get_setting(db, "temperature", "0.7")),
        "input_device": get_setting(db, "input_device", "default"),
        "sample_rate": int(get_setting(db, "sample_rate", "16000")),
        "default_language": get_setting(db, "default_language", "en"),
        "auto_detect_language": get_setting(db, "auto_detect_language", "true") == "true",
    }


@router.post("")
async def update_settings(data: SettingsUpdate, db: DBSession = Depends(get_db)):
    if data.clear_gemini_api_key:
        set_setting(db, "gemini_api_key", "")
    elif data.gemini_api_key is not None and data.gemini_api_key.strip():
        set_setting(db, "gemini_api_key", data.gemini_api_key.strip())
    if data.clear_deepseek_api_key:
        set_setting(db, "deepseek_api_key", "")
    elif data.deepseek_api_key is not None and data.deepseek_api_key.strip():
        set_setting(db, "deepseek_api_key", data.deepseek_api_key.strip())
    if data.ollama_url is not None:
        set_setting(db, "ollama_url", data.ollama_url)
    if data.hermes_api_url is not None:
        set_setting(db, "hermes_api_url", data.hermes_api_url)
    if data.hermes_model is not None:
        set_setting(db, "hermes_model", data.hermes_model)
    if data.model is not None:
        set_setting(db, "model", data.model)
    if data.max_tokens is not None:
        set_setting(db, "max_tokens", str(data.max_tokens))
    if data.temperature is not None:
        set_setting(db, "temperature", str(data.temperature))
    if data.input_device is not None:
        set_setting(db, "input_device", data.input_device)
    if data.sample_rate is not None:
        set_setting(db, "sample_rate", str(data.sample_rate))
    if data.default_language is not None:
        set_setting(db, "default_language", data.default_language)
    if data.auto_detect_language is not None:
        set_setting(db, "auto_detect_language", str(data.auto_detect_language).lower())

    return {"message": "Settings updated"}


@router.get("/models")
async def list_available_models(db: DBSession = Depends(get_db)):
    """Return configured provider status and available model names."""
    from app.services.llm import get_ollama_service as _get_svc

    llm_settings = get_llm_settings(db)
    svc = _get_svc()
    by_provider = await svc.list_models(llm_settings)
    all_models = (
        by_provider.get("gemini", [])
        + by_provider.get("deepseek", [])
        + by_provider.get("hermes", [])
        + by_provider.get("ollama", [])
    )
    providers = [
        {
            "id": "gemini",
            "name": "Gemini",
            "configured": bool(llm_settings.get("gemini_api_key") or os.getenv("GEMINI_API_KEY", "")),
            "models": by_provider.get("gemini", []),
        },
        {
            "id": "deepseek",
            "name": "DeepSeek",
            "configured": bool(llm_settings.get("deepseek_api_key") or os.getenv("DEEPSEEK_API_KEY", "")),
            "models": by_provider.get("deepseek", []),
        },
        {
            "id": "hermes",
            "name": "Hermes AI",
            "configured": True,
            "models": by_provider.get("hermes", []),
        },
        {
            "id": "ollama",
            "name": "Ollama",
            "configured": await svc.check_ollama_connection(llm_settings),
            "models": by_provider.get("ollama", []),
        },
    ]
    return {"models": all_models, "providers": providers}
