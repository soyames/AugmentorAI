from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from typing import Optional

from app.models.database import get_db, Settings

router = APIRouter()


class SettingsUpdate(BaseModel):
    ollama_url: Optional[str] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[float] = None
    input_device: Optional[str] = None
    sample_rate: Optional[int] = None
    default_language: Optional[str] = None
    auto_detect_language: Optional[bool] = None


def get_setting(db: DBSession, key: str, default: str = None) -> str:
    setting = db.query(Settings).filter(Settings.key == key).first()
    if setting:
        return setting.value
    return default


def set_setting(db: DBSession, key: str, value: str):
    setting = db.query(Settings).filter(Settings.key == key).first()
    if setting:
        setting.value = value
    else:
        setting = Settings(key=key, value=value)
        db.add(setting)
    db.commit()


@router.get("")
async def get_settings(db: DBSession = Depends(get_db)):
    return {
        "ollama_url": get_setting(db, "ollama_url", "http://localhost:11434"),
        "model": get_setting(db, "model", "llama3.1"),
        "max_tokens": int(get_setting(db, "max_tokens", "500")),
        "temperature": float(get_setting(db, "temperature", "0.7")),
        "input_device": get_setting(db, "input_device", "default"),
        "sample_rate": int(get_setting(db, "sample_rate", "16000")),
        "default_language": get_setting(db, "default_language", "en"),
        "auto_detect_language": get_setting(db, "auto_detect_language", "true") == "true",
    }


@router.post("")
async def update_settings(data: SettingsUpdate, db: DBSession = Depends(get_db)):
    if data.ollama_url is not None:
        set_setting(db, "ollama_url", data.ollama_url)
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
