import json
import time
from sqlalchemy.orm import Session as DBSession

from app.models.database import AnswerSuggestion, Session as SessionModel
from app.services.app_settings import get_llm_settings
from app.services.llm import get_llm_service
from app.services.session_context import build_answer_context
from app.services.confidence_scorer import compute_confidence


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
    _start = time.monotonic()
    result = await llm.generate_interview_answer(
        question=question,
        context=context,
        language=language,
        model=llm_settings.get("model") or "qwen2.5-coder:3b",
        settings=llm_settings,
    )
    _latency_ms = int((time.monotonic() - _start) * 1000)

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
            elif llm_settings.get("hermes_api_url"):
                provider_name = "Hermes AI"
            else:
                provider_name = "Ollama (local)"

    # Detect if fallback was used
    has_api_key = llm_settings.get("gemini_api_key") or llm_settings.get("deepseek_api_key")
    is_fallback = bool(has_api_key and provider_name in ("Ollama", "Ollama (local)") and not answer_text.startswith("Error:"))

    # Extract sources from the context — they're embedded as [Source: ...] markers
    rag_context = context.get("notes", "")
    sources_list = []
    for line in rag_context.split("\n"):
        if line.startswith("[Source:") and "]" in line:
            source_ref = line[1:line.index("]")]
            if source_ref not in sources_list:
                sources_list.append(source_ref)

    # Compute confidence score using the new algorithm
    is_error = answer_text.startswith("Error:")
    confidence, confidence_details = compute_confidence(
        answer=answer_text,
        question=question,
        context_text=rag_context if rag_context else None,
        use_llm_eval=not is_error,
    )

    answer = AnswerSuggestion(
        session_id=session_id,
        question=question,
        answer_text=answer_text,
        confidence=confidence,
        confidence_score=confidence,
        confidence_details=json.dumps(confidence_details) if confidence_details else None,
        language=language,
        provider=provider_name,
        latency_ms=_latency_ms,
        is_fallback=is_fallback,
        tokens_used=len(answer_text.split()),  # approximate: word count
        sources=json.dumps(sources_list) if sources_list else None,
    )
    db.add(answer)
    session.ai_usage = (session.ai_usage or 0) + 1
    db.commit()
    db.refresh(answer)
    return answer


async def generate_mock_question(
    db: DBSession,
    session_id: str,
    language: str = "en",
) -> str:
    session = db.query(SessionModel).filter(SessionModel.id == session_id).first()
    if not session:
        raise ValueError("Session not found")

    context = build_answer_context(db, session, "")
    llm_settings = get_llm_settings(db)
    llm = get_llm_service()

    resume_ctx = context.get("resume", "").strip()
    job_ctx = context.get("job_description", "").strip()
    transcript = context.get("transcript", "").strip()

    system_prompt = (
        f"You are an expert interviewer. The candidate is applying for the job described below.\n"
        f"JOB DESCRIPTION: {job_ctx[:1000]}\n\n"
        f"CANDIDATE RESUME: {resume_ctx[:2000]}\n\n"
        f"Your task is to generate the NEXT logical interview question to ask the candidate in {language}. "
        f"Keep the question concise, challenging but fair. Base it on their resume or previous answers. "
        f"DO NOT output anything other than the question text itself."
    )

    prompt = "Generate the first interview question."
    if transcript:
        prompt = f"Previous conversation:\n{transcript[-2000:]}\n\nGenerate the next interview question."

    result = await llm.generate(
        prompt=prompt,
        system_prompt=system_prompt,
        model=llm_settings.get("model") or "qwen2.5-coder:3b",
        max_tokens=200,
        settings=llm_settings,
    )
    return result.strip()
