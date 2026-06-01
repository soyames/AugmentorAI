import os

from sqlalchemy.orm import Session as DBSession

from app.models.database import Settings


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


def effective_ollama_url(value: str = "") -> str:
    env_url = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
    configured = (value or "").strip()
    if not configured:
        return env_url

    local_urls = (
        "http://localhost:11434",
        "http://127.0.0.1:11434",
        "http://0.0.0.0:11434",
    )
    if env_url not in local_urls and configured in local_urls:
        return env_url
    return configured


def get_llm_settings(db: DBSession) -> dict[str, str]:
    keys = [
        "gemini_api_key",
        "deepseek_api_key",
        "ollama_url",
        "model",
    ]
    rows = db.query(Settings).filter(Settings.key.in_(keys)).all()
    settings = {row.key: row.value or "" for row in rows}
    settings["ollama_url"] = effective_ollama_url(settings.get("ollama_url", ""))
    return settings
