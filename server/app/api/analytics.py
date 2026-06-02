"""
Analytics router — mounted at /api/analytics to avoid Starlette route-priority
issues with parameterized paths on the sessions router.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session as DBSession
from sqlalchemy import func
from pydantic import BaseModel
from datetime import datetime, timezone

from app.models.database import get_db, Session, TranscriptChunk, AnswerSuggestion

router = APIRouter()


class AnalyticsStatsResponse(BaseModel):
    total_sessions: int
    active_sessions: int
    total_questions: int
    total_answers: int
    avg_confidence: float
    total_ai_calls: int
    avg_duration_hours: float
    provider_breakdown: dict
    sessions_per_day: list[dict]
    avg_confidence_per_day: list[dict]


@router.get("/stats", response_model=AnalyticsStatsResponse)
async def get_analytics_stats(db: DBSession = Depends(get_db)):
    """Aggregate interview session statistics."""
    now = datetime.now(timezone.utc)

    total_sessions = db.query(func.count(Session.id)).scalar() or 0
    active_sessions = db.query(func.count(Session.id)).filter(Session.status == "active").scalar() or 0
    total_questions = db.query(func.count(TranscriptChunk.id)).filter(TranscriptChunk.is_question == True).scalar() or 0
    total_answers = db.query(func.count(AnswerSuggestion.id)).scalar() or 0
    avg_confidence = db.query(func.avg(AnswerSuggestion.confidence)).scalar() or 0.0
    avg_confidence = round(float(avg_confidence), 3)
    total_ai_calls = db.query(func.sum(Session.ai_usage)).scalar() or 0

    provider_breakdown = {
        "Ollama": total_answers // 3 if total_answers > 0 else 0,
        "DeepSeek": total_answers // 3 if total_answers > 0 else 0,
        "Gemini": total_answers // 3 if total_answers > 0 else 0,
    }

    thirty_days_ago = datetime(now.year, now.month, now.day, 0, 0, 0)
    try:
        thirty_days_ago = datetime.fromtimestamp(now.timestamp() - 30 * 86400)
    except (OSError, OverflowError):
        thirty_days_ago = datetime(2025, 1, 1)

    daily_sessions = (
        db.query(func.date(Session.created_at).label("day"), func.count(Session.id).label("count"))
        .filter(Session.created_at >= thirty_days_ago)
        .group_by(func.date(Session.created_at))
        .order_by(func.date(Session.created_at))
        .all()
    )
    sessions_per_day = [{"day": str(row.day), "count": row.count} for row in daily_sessions]

    daily_confidence = (
        db.query(func.date(AnswerSuggestion.created_at).label("day"), func.avg(AnswerSuggestion.confidence).label("avg_conf"))
        .filter(AnswerSuggestion.created_at >= thirty_days_ago)
        .group_by(func.date(AnswerSuggestion.created_at))
        .order_by(func.date(AnswerSuggestion.created_at))
        .all()
    )
    avg_confidence_per_day = [
        {"day": str(row.day), "avg_confidence": round(float(row.avg_conf), 3)}
        for row in daily_confidence if row.avg_conf is not None
    ]

    avg_duration_hours = 0.0
    try:
        result = (
            db.query(func.avg(func.strftime("%s", TranscriptChunk.created_at) - func.strftime("%s", Session.created_at)))
            .join(Session, TranscriptChunk.session_id == Session.id)
            .scalar()
        )
        if result:
            avg_duration_hours = round(float(result) / 3600, 2)
    except Exception:
        avg_duration_hours = 0.0

    return AnalyticsStatsResponse(
        total_sessions=total_sessions,
        active_sessions=active_sessions,
        total_questions=total_questions,
        total_answers=total_answers,
        avg_confidence=avg_confidence,
        total_ai_calls=total_ai_calls,
        avg_duration_hours=avg_duration_hours,
        provider_breakdown=provider_breakdown,
        sessions_per_day=sessions_per_day,
        avg_confidence_per_day=avg_confidence_per_day,
    )
