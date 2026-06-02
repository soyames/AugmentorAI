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
    """Return the effective Ollama URL.

    If the user has explicitly set a value in the DB, honour it.
    Otherwise fall back to the OLLAMA_URL env var, then to localhost.
    """
    configured = (value or "").strip()
    if configured:
        return configured
    return os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")


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
