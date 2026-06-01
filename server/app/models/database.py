from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from datetime import datetime
import uuid
import os
from pathlib import Path

SERVER_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SQLITE_DB = SERVER_ROOT / "data" / "augmentor.db"
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_DB.as_posix()}")

engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **engine_kwargs)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def generate_uuid():
    return str(uuid.uuid4())


class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    mode = Column(String, default="practice")
    language = Column(String, default="en")
    status = Column(String, default="active")
    ai_usage = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    documents = relationship("Document", back_populates="session")
    transcript_chunks = relationship("TranscriptChunk", back_populates="session")
    answer_suggestions = relationship("AnswerSuggestion", back_populates="session")


class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=True)
    doc_type = Column(String, nullable=False)  # cv, job_description, notes
    filename = Column(String, nullable=False)
    extracted_text = Column(Text, nullable=True)
    embedding_status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="documents")


class TranscriptChunk(Base):
    __tablename__ = "transcript_chunks"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    speaker = Column(String, default="unknown")
    text = Column(Text, nullable=False)
    language = Column(String, default="en")
    timestamp_start = Column(Float, nullable=True)
    timestamp_end = Column(Float, nullable=True)
    is_question = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="transcript_chunks")


class AnswerSuggestion(Base):
    __tablename__ = "answer_suggestions"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    transcript_chunk_id = Column(String, ForeignKey("transcript_chunks.id"), nullable=True)
    question = Column(Text, nullable=True)
    answer_text = Column(Text, nullable=False)
    confidence = Column(Float, default=0.0)
    language = Column(String, default="en")
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="answer_suggestions")


class Resume(Base):
    __tablename__ = "resumes"

    id = Column(String, primary_key=True, default=generate_uuid)
    filename = Column(String, nullable=False)
    extracted_text = Column(Text, nullable=True)
    embedding_status = Column(String, default="pending")
    created_at = Column(DateTime, default=datetime.utcnow)


class Settings(Base):
    __tablename__ = "settings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String, unique=True, nullable=False)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


def create_tables():
    # Ensure data directory exists
    os.makedirs(SERVER_ROOT / "data", exist_ok=True)
    Base.metadata.create_all(bind=engine)
