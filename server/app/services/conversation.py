"""Conversation AI — ambient discussion assistant without documents.

Generates natural responses in any conversation by using the
conversation history itself as context. No document uploads needed.
"""
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import desc

from app.models.database import AnswerSuggestion, TranscriptChunk
from app.services.app_settings import get_llm_settings
from app.services.llm import get_llm_service


def build_conversation_context(db: DBSession, session_id: str, max_exchanges: int = 10) -> str:
    """Build a conversation history summary from recent transcript + answers."""
    chunks = (
        db.query(TranscriptChunk)
        .filter(TranscriptChunk.session_id == session_id)
        .order_by(desc(TranscriptChunk.created_at))
        .limit(max_exchanges)
        .all()
    )
    chunks = list(reversed(chunks))

    answers = {
        a.transcript_chunk_id: a
        for a in db.query(AnswerSuggestion)
        .filter(AnswerSuggestion.session_id == session_id)
        .all()
    }

    lines = []
    topics_seen = set()
    for chunk in chunks:
        speaker = "You" if chunk.speaker == "interviewer" else "Other"
        text = chunk.text.strip()
        if not text:
            continue
        lines.append(f"{speaker}: {text}")

        # Add AI response if available
        if chunk.id in answers:
            ans = answers[chunk.id]
            lines.append(f"AI: {ans.answer_text[:300]}")
            # Track discussed topics from the response
            if ans.sources and ans.sources != "[]":
                try:
                    import json
                    for src in json.loads(ans.sources):
                        topics_seen.add(src)
                except (json.JSONDecodeError, TypeError):
                    pass

    context = "\n".join(lines)
    if topics_seen:
        context += f"\n\nKnown topics: {', '.join(topics_seen)}"

    return context


async def generate_conversation_response(
    db: DBSession,
    session_id: str,
    last_text: str,
    language: str = "en",
    use_history: bool = True,
) -> dict:
    """Generate a natural response in any conversation without requiring documents."""
    llm_settings = get_llm_settings(db)
    llm = get_llm_service()

    # Build context from conversation history
    context = ""
    if use_history:
        context = build_conversation_context(db, session_id)
        # Truncate to avoid token limits
        if len(context) > 3000:
            context = context[-3000:]

    system_prompt = f"""You are a helpful AI assistant in a live conversation. Respond naturally and conversationally.

Guidelines:
- Be concise but substantive (2-4 sentences usually)
- If asked a question, answer it directly
- If the person is making a statement, acknowledge it and offer a thoughtful response
- You don't need to always give "structured answers" — be natural
- Ask clarifying questions when needed
- Use the conversation history for context
- Respond in: {language}"""

    user_prompt = f"""Recent conversation:
{context or "No previous conversation context."}

The last thing said was: "{last_text}"

Respond naturally and helpfully. Keep it conversational. Don't use S/R/A/R format unless asked."""

    response = await llm.generate(
        prompt=user_prompt,
        system_prompt=system_prompt,
        model=llm_settings.get("model") or "qwen2.5-coder:3b",
        max_tokens=500,
        temperature=0.8,
        settings=llm_settings,
    )

    # Extract provider info
    provider = getattr(llm, "_last_provider", "unknown")

    return {
        "text": response,
        "provider": provider,
        "is_fallback": provider in ("Ollama", "Ollama (local)"),
    }
