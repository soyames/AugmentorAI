from sqlalchemy import create_engine, Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, inspect, text
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


def log(msg: str):
    """Emit a log line visible in container stdout/stderr."""
    print(f"[db] {msg}", flush=True)


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

    # Relationships — cascade delete children when a session is removed
    documents = relationship("Document", back_populates="session", cascade="all, delete-orphan")
    transcript_chunks = relationship("TranscriptChunk", back_populates="session", cascade="all, delete-orphan")
    answer_suggestions = relationship("AnswerSuggestion", back_populates="session", cascade="all, delete-orphan")


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
    confidence_score = Column(Float, nullable=True)  # detailed scoring breakdown score
    confidence_details = Column(Text, nullable=True)  # JSON: breakdown of scoring factors
    language = Column(String, default="en")
    sources = Column(Text, nullable=True)  # JSON list of source document references
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


def run_migrations():
    """Run schema migrations for columns added after initial creation."""
    try:
        inspector = inspect(engine)
        columns = [c["name"] for c in inspector.get_columns("answer_suggestions")]
        with engine.connect() as conn:
            if "confidence_score" not in columns:
                conn.execute(text("ALTER TABLE answer_suggestions ADD COLUMN confidence_score FLOAT"))
                log("Migration: added confidence_score column to answer_suggestions")
            if "confidence_details" not in columns:
                conn.execute(text("ALTER TABLE answer_suggestions ADD COLUMN confidence_details TEXT"))
                log("Migration: added confidence_details column to answer_suggestions")
            conn.commit()
    except Exception as e:
        log(f"Migration warning: {e}")


def create_tables():
    # Ensure data directory exists
    os.makedirs(SERVER_ROOT / "data", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    run_migrations()
