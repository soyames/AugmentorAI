from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
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

    class Config:
        from_attributes = True


class TranscriptResponse(BaseModel):
    id: str
    speaker: str
    text: str
    language: str
    timestamp_start: Optional[float]
    timestamp_end: Optional[float]
    is_question: bool
    created_at: datetime

    class Config:
        from_attributes = True


class GenerateAnswerRequest(BaseModel):
    question: str
    language: str = "en"


class AnswerResponse(BaseModel):
    id: str
    question: Optional[str]
    answer_text: str
    confidence: float
    language: str
    created_at: datetime

    class Config:
        from_attributes = True


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

    from app.services.llm import get_ollama_service
    ollama = get_ollama_service()

    # Load resume context from DB + RAG
    from app.models.database import Document, Resume as ResumeModel
    from app.services.rag import query_documents, extract_text_from_file
    from pathlib import Path

    SERVER_ROOT = Path(__file__).resolve().parents[2]
    UPLOAD_DIR = SERVER_ROOT / "data" / "uploads"

    # Get resume text (use extracted_text if available, else extract from file)
    resume_text = ""
    resumes = db.query(ResumeModel).order_by(ResumeModel.created_at.desc()).all()
    if resumes:
        r = resumes[0]
        if r.extracted_text:
            resume_text = r.extracted_text
        else:
            f = UPLOAD_DIR / f"resume_{r.filename}"
            if not f.exists():
                f = UPLOAD_DIR / r.filename
            if f.exists():
                resume_text = extract_text_from_file(f)
                r.extracted_text = resume_text
                db.commit()

    # RAG: query ChromaDB for relevant context
    rag_context = query_documents(data.question, n_results=3)
    if rag_context:
        resume_text = (resume_text + "\n\n" + rag_context).strip()

    context = {
        "resume": resume_text,
        "job_description": session.description or "",
        "notes": "",
    }

    ollama_available = await ollama.check_connection()

    if ollama_available:
        result = await ollama.generate_interview_answer(
            question=data.question,
            context=context,
            language=data.language,
        )
        answer_text = result.get("detailed") or result.get("short", "")
        if not answer_text:
            answer_text = "Ollama returned an empty response. Try rephrasing the question."
        confidence = 0.85
    else:
        answer_text = (
            "Ollama is not running. Start Ollama and pull a model "
            "(e.g. 'ollama pull llama3.1') to get AI-generated answers."
        )
        confidence = 0.0

    answer = AnswerSuggestion(
        session_id=session_id,
        question=data.question,
        answer_text=answer_text,
        confidence=confidence,
        language=data.language,
    )
    db.add(answer)
    session.ai_usage += 1
    db.commit()
    db.refresh(answer)

    return answer


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
