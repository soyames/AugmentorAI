from pathlib import Path

from sqlalchemy.orm import Session as DBSession

from app.models.database import Document as DocumentModel
from app.models.database import Resume as ResumeModel
from app.models.database import TranscriptChunk
from app.services.rag import extract_text_from_file, query_documents

SERVER_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = SERVER_ROOT / "data" / "uploads"


def load_resume_text(db: DBSession) -> str:
    """Load the most recent resume text from DB or disk."""
    resume_text = ""
    resumes = db.query(ResumeModel).order_by(ResumeModel.created_at.desc()).all()
    if not resumes:
        return resume_text

    resume = resumes[0]
    if resume.extracted_text:
        return resume.extracted_text

    candidates = [UPLOAD_DIR / f"resume_{resume.filename}", UPLOAD_DIR / resume.filename]
    for file_path in candidates:
        if file_path.exists():
            resume_text = extract_text_from_file(file_path)
            resume.extracted_text = resume_text
            db.commit()
            break

    return resume_text


def load_session_documents_text(db: DBSession, session_id: str) -> str:
    """Load attached session document text from DB or disk."""
    parts = []
    documents = (
        db.query(DocumentModel)
        .filter(DocumentModel.session_id == session_id)
        .order_by(DocumentModel.created_at.desc())
        .all()
    )
    for document in documents:
        text = document.extracted_text or ""
        if not text:
            file_path = UPLOAD_DIR / document.filename
            if file_path.exists():
                text = extract_text_from_file(file_path)
                document.extracted_text = text
                document.embedding_status = "text_extracted" if text else document.embedding_status
                db.commit()
        if text:
            parts.append(f"{document.filename}:\n{text[:2000]}")
    return "\n\n".join(parts)


def load_transcript_context(db: DBSession, session_id: str) -> str:
    """Use the live discussion itself as context when documents are missing or incomplete."""
    chunks = (
        db.query(TranscriptChunk)
        .filter(TranscriptChunk.session_id == session_id)
        .order_by(TranscriptChunk.created_at.desc())
        .limit(20)
        .all()
    )
    chunks = list(reversed(chunks))
    return "\n".join(f"{chunk.speaker}: {chunk.text}" for chunk in chunks if chunk.text)


def build_answer_context(db: DBSession, session, question: str) -> dict:
    """Build a compact context block for answer generation."""
    resume_text = load_resume_text(db)
    document_text = load_session_documents_text(db, session.id)
    rag_context = query_documents(question, n_results=3)
    transcript_context = load_transcript_context(db, session.id)

    # Always include transcript context as a dedicated section when available
    parts = []
    if document_text:
        parts.append(document_text)
    if transcript_context:
        parts.append(f"RECENT LIVE DISCUSSION:\n{transcript_context}")
    notes = "\n\n".join(parts)
    if rag_context:
        notes = (notes + "\n\nRELEVANT DOCUMENT CHUNKS:\n" + rag_context).strip()

    return {
        "resume": resume_text,
        "job_description": session.description or "",
        "transcript": transcript_context,
        "notes": notes,
    }
