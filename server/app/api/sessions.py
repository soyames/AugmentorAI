from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime

from app.models.database import get_db, Session, TranscriptChunk, AnswerSuggestion

router = APIRouter()


class SessionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    mode: str = "practice"
    language: str = "en"


class SessionResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    mode: str
    language: str
    status: str
    ai_usage: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TranscriptResponse(BaseModel):
    id: str
    speaker: str
    text: str
    language: str
    timestamp_start: Optional[float]
    timestamp_end: Optional[float]
    is_question: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class GenerateAnswerRequest(BaseModel):
    question: str
    language: str = "en"


class AnswerResponse(BaseModel):
    id: str
    question: Optional[str]
    answer_text: str
    confidence: float
    language: str
    provider: str = "unknown"
    is_fallback: bool = False
    sources: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


@router.get("", response_model=List[SessionResponse])
async def list_sessions(db: DBSession = Depends(get_db)):
    sessions = db.query(Session).order_by(Session.created_at.desc()).all()
    return sessions


@router.post("", response_model=SessionResponse)
async def create_session(data: SessionCreate, db: DBSession = Depends(get_db)):
    session = Session(
        title=data.title,
        description=data.description,
        mode=data.mode,
        language=data.language,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/{session_id}")
async def delete_session(session_id: str, db: DBSession = Depends(get_db)):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}


@router.post("/{session_id}/mock-question")
async def create_mock_question(session_id: str, data: GenerateAnswerRequest, db: DBSession = Depends(get_db)):
    from app.services.session_ai import generate_mock_question
    try:
        question = await generate_mock_question(db, session_id, data.language)
        return {"question": question}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{session_id}/transcript", response_model=List[TranscriptResponse])
async def get_transcript(session_id: str, db: DBSession = Depends(get_db)):
    chunks = (
        db.query(TranscriptChunk)
        .filter(TranscriptChunk.session_id == session_id)
        .order_by(TranscriptChunk.created_at)
        .all()
    )
    return chunks


@router.post("/{session_id}/generate-answer", response_model=AnswerResponse)
async def generate_answer(
    session_id: str,
    data: GenerateAnswerRequest,
    db: DBSession = Depends(get_db),
):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    from app.services.session_ai import generate_and_store_answer

    answer = await generate_and_store_answer(
        db=db,
        session_id=session_id,
        question=data.question,
        language=data.language,
    )

    response_dict = {
        "id": answer.id,
        "question": answer.question,
        "answer_text": answer.answer_text,
        "confidence": answer.confidence,
        "language": answer.language,
        "provider": answer.provider or "unknown",
        "is_fallback": answer.is_fallback if hasattr(answer, 'is_fallback') else False,
        "sources": answer.sources,
        "created_at": answer.created_at,
    }
    return response_dict


@router.get("/{session_id}/answers", response_model=List[AnswerResponse])
async def get_answers(session_id: str, db: DBSession = Depends(get_db)):
    answers = (
        db.query(AnswerSuggestion)
        .filter(AnswerSuggestion.session_id == session_id)
        .order_by(AnswerSuggestion.created_at.desc())
        .all()
    )
    return answers


@router.post("/{session_id}/switch-language")
async def switch_language(
    session_id: str,
    language: str,
    db: DBSession = Depends(get_db),
):
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.language = language
    db.commit()

    return {"message": f"Language switched to {language}"}


class FollowUpRequest(BaseModel):
    question: str
    answer: str
    count: int = 3


@router.post("/{session_id}/follow-up-questions")
async def get_follow_up_questions(
    session_id: str,
    data: FollowUpRequest,
    db: DBSession = Depends(get_db),
):
    from app.services.follow_up import generate_follow_up_questions

    questions = await generate_follow_up_questions(
        db=db,
        session_id=session_id,
        last_question=data.question,
        last_answer=data.answer,
        count=data.count,
    )
    return {"questions": questions}


@router.post("/{session_id}/conversation")
async def conversation_response(
    session_id: str,
    data: GenerateAnswerRequest,
    db: DBSession = Depends(get_db),
):
    """Generate a conversational response without requiring documents.
    
    Uses conversation history as context instead of uploaded resumes/docs.
    Designed for the ambient conversation AI mode.
    """
    from app.services.conversation import generate_conversation_response

    result = await generate_conversation_response(
        db=db,
        session_id=session_id,
        last_text=data.question,
        language=data.language,
    )

    return result
