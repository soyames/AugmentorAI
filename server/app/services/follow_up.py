"""Generate smart follow-up questions based on interview context."""
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc

from app.models.database import AnswerSuggestion, TranscriptChunk
from app.services.app_settings import get_llm_settings
from app.services.llm import get_llm_service


async def generate_follow_up_questions(
    db: DBSession,
    session_id: str,
    last_question: str,
    last_answer: str,
    conversation_history: list[dict] = None,
    count: int = 3,
) -> list[str]:
    """Generate context-aware follow-up questions for the interviewer."""
    llm_settings = get_llm_settings(db)
    llm = get_llm_service()

    # Build conversation context from recent Q&A
    recent_answers = (
        db.query(AnswerSuggestion)
        .filter(AnswerSuggestion.session_id == session_id)
        .order_by(desc(AnswerSuggestion.created_at))
        .limit(5)
        .all()
    )

    history_lines = []
    for ans in reversed(recent_answers):
        if ans.question:
            history_lines.append(f"Q: {ans.question}")
            history_lines.append(f"A: {ans.answer_text[:300]}")

    # Add the current Q&A if not in history
    current_qa = f"Q: {last_question}\nA: {last_answer[:500]}"
    if not history_lines or history_lines[-2:] != current_qa.split("\n"):
        history_lines.append(f"Q: {last_question}")
        history_lines.append(f"A: {last_answer[:500]}")

    history_text = "\n".join(history_lines[-8:])  # Last 4 Q&A pairs

    prompt = f"""You are an expert interview coach. Based on the conversation so far, suggest {count} smart follow-up questions the interviewer should ask next.

The questions should:
- Dig deeper into specific topics the candidate mentioned
- Address any gaps or vague areas in their answers  
- Use STAR method probes (Situation, Task, Action, Result)
- Be specific and contextual — not generic interview questions

Recent conversation:
{history_text}

Return ONLY the questions, one per line, numbered. Do NOT include any explanation or commentary."""

    response = await llm.generate(
        prompt=prompt,
        system_prompt="You are an expert interview coach. Generate specific, contextual follow-up questions.",
        model=llm_settings.get("model") or "qwen2.5-coder:3b",
        max_tokens=400,
        temperature=0.8,
        settings=llm_settings,
    )

    # Parse numbered list
    questions = []
    for line in response.strip().split("\n"):
        line = line.strip()
        # Strip numbering like "1.", "1)", "1-"
        if line and line[0].isdigit():
            line = line.split(".", 1)[-1].strip() if "." in line[:4] else line
            line = line.split(")", 1)[-1].strip() if ")" in line[:4] else line
        if line and len(line) > 10 and not line.lower().startswith("here"):
            questions.append(line)

    return questions[:count]
