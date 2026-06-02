from sqlalchemy.orm import Session as DBSession

from app.models.database import AnswerSuggestion, Session as SessionModel
from app.services.app_settings import get_llm_settings
from app.services.llm import get_llm_service
from app.services.session_context import build_answer_context


async def generate_and_store_answer(
    db: DBSession,
    session_id: str,
    question: str,
    language: str = "en",
) -> AnswerSuggestion:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise ValueError("Session not found")

    context = build_answer_context(db, session, question)
    llm_settings = get_llm_settings(db)

    llm = get_llm_service()
    result = await llm.generate_interview_answer(
        question=question,
        context=context,
        language=language,
        model=llm_settings.get("model") or "qwen2.5-coder:3b",
        settings=llm_settings,
    )

    answer_text = result.get("detailed") or result.get("short", "")
    if not answer_text:
        answer_text = "No AI response was generated. Please try again."

    # Determine which provider actually responded and detect fallback
    if answer_text.startswith("Error: all AI providers failed"):
        provider_name = "none (all providers failed)"
    elif answer_text.startswith("Error:"):
        provider_name = "unknown"
    else:
        # Use the _last_provider tracked by LLMService.generate()
        provider_name = getattr(llm, '_last_provider', None) or "unknown"
        # Heuristic fallback for provider detection
        if provider_name == "unknown":
            if llm_settings.get("gemini_api_key"):
                provider_name = "Gemini"
            elif llm_settings.get("deepseek_api_key"):
                provider_name = "DeepSeek"
            else:
                provider_name = "Ollama (local)"

    # Detect if fallback was used: answer succeeded but multiple providers are configured
    has_api_key = llm_settings.get("gemini_api_key") or llm_settings.get("deepseek_api_key")
    is_fallback = bool(has_api_key and provider_name in ("Ollama", "Ollama (local)") and not answer_text.startswith("Error:"))

    answer = AnswerSuggestion(
        session_id=session_id,
        question=question,
        answer_text=answer_text,
        confidence=0.85 if not answer_text.startswith("Error:") else 0.0,
        language=language,
    )
    # Attach runtime metadata so API responses can include provider info
    answer._provider = provider_name
    answer._is_fallback = is_fallback
    db.add(answer)
    session.ai_usage = (session.ai_usage or 0) + 1
    db.commit()
    db.refresh(answer)
    return answer
