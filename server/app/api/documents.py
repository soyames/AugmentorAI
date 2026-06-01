from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import aiofiles
from pathlib import Path
import os

from app.models.database import SessionLocal, get_db, Document, Resume
from app.services.rag import embed_document, extract_text_from_file

router = APIRouter()

SERVER_ROOT = Path(__file__).resolve().parents[2]
UPLOAD_DIR = SERVER_ROOT / "data" / "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def build_unique_path(filename: str, prefix: str = "") -> Path:
    safe_name = Path(filename).name
    candidate = UPLOAD_DIR / f"{prefix}{safe_name}"
    if not candidate.exists():
        return candidate

    stem = Path(safe_name).stem
    suffix = Path(safe_name).suffix
    counter = 1
    while True:
        numbered = UPLOAD_DIR / f"{prefix}{stem}_{counter}{suffix}"
        if not numbered.exists():
            return numbered
        counter += 1


def find_matching_path(filename: str, prefix: str = "") -> Optional[Path]:
    exact = UPLOAD_DIR / f"{prefix}{Path(filename).name}"
    if exact.exists():
        return exact

    stem = Path(filename).stem
    suffix = Path(filename).suffix
    matches = sorted(UPLOAD_DIR.glob(f"{prefix}{stem}*{suffix}"), key=lambda p: p.stat().st_mtime)
    if matches:
        return matches[-1]
    return None


class AttachDocumentRequest(BaseModel):
    session_id: str


class DocumentResponse(BaseModel):
    id: str
    session_id: Optional[str]
    doc_type: str
    filename: str
    embedding_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class ResumeResponse(BaseModel):
    id: str
    filename: str
    embedding_status: str
    created_at: datetime

    class Config:
        from_attributes = True


def process_uploaded_file(record_type: str, record_id: str, file_path: str):
    db = SessionLocal()
    try:
        path = Path(file_path)
        text = extract_text_from_file(path)

        if record_type == "resume":
            record = db.query(Resume).filter(Resume.id == record_id).first()
        else:
            record = db.query(Document).filter(Document.id == record_id).first()

        if not record:
            return

        record.extracted_text = text
        if text:
            embedded = embed_document(record_id, text)
            record.embedding_status = "completed" if embedded else "text_extracted"
        else:
            record.embedding_status = "no_text"
        db.commit()
    except Exception as exc:
        print(f"Upload processing failed for {record_type} {record_id}: {exc}")
        if record_type == "resume":
            record = db.query(Resume).filter(Resume.id == record_id).first()
        else:
            record = db.query(Document).filter(Document.id == record_id).first()
        if record:
            record.embedding_status = "failed"
            db.commit()
    finally:
        db.close()


@router.get("", response_model=List[DocumentResponse])
async def list_documents(db: DBSession = Depends(get_db)):
    documents = db.query(Document).order_by(Document.created_at.desc()).all()
    return documents


@router.post("", response_model=DocumentResponse)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    doc_type: str = Form(default="notes"),
    session_id: Optional[str] = Form(default=None),
    db: DBSession = Depends(get_db),
):
    stored_path = build_unique_path(file.filename)
    async with aiofiles.open(stored_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Create document record
    document = Document(
        session_id=session_id,
        doc_type=doc_type,
        filename=stored_path.name,
        embedding_status="processing",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    background_tasks.add_task(process_uploaded_file, "document", document.id, str(stored_path))

    return document


# Resume endpoints
@router.get("/resumes", response_model=List[ResumeResponse])
async def list_resumes(db: DBSession = Depends(get_db)):
    resumes = db.query(Resume).order_by(Resume.created_at.desc()).all()
    return resumes


@router.post("/resumes", response_model=ResumeResponse)
async def upload_resume(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: DBSession = Depends(get_db),
):
    stored_path = build_unique_path(file.filename, prefix="resume_")
    async with aiofiles.open(stored_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # Create resume record
    resume = Resume(filename=stored_path.name.replace("resume_", "", 1), embedding_status="processing")
    db.add(resume)
    db.commit()
    db.refresh(resume)

    background_tasks.add_task(process_uploaded_file, "resume", resume.id, str(stored_path))

    return resume


@router.delete("/resumes/{resume_id}")
async def delete_resume(resume_id: str, db: DBSession = Depends(get_db)):
    resume = db.query(Resume).filter(Resume.id == resume_id).first()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Delete file
    file_path = find_matching_path(resume.filename, prefix="resume_")
    if file_path and file_path.exists():
        file_path.unlink()

    db.delete(resume)
    db.commit()
    return {"message": "Resume deleted"}


@router.post("/{doc_id}/attach")
async def attach_document_to_session(
    doc_id: str,
    data: AttachDocumentRequest,
    db: DBSession = Depends(get_db),
):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    document.session_id = data.session_id
    db.commit()
    return {"message": "Document attached"}


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(doc_id: str, db: DBSession = Depends(get_db)):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.delete("/{doc_id}")
async def delete_document(doc_id: str, db: DBSession = Depends(get_db)):
    document = db.query(Document).filter(Document.id == doc_id).first()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete file
    file_path = find_matching_path(document.filename)
    if file_path and file_path.exists():
        file_path.unlink()

    db.delete(document)
    db.commit()
    return {"message": "Document deleted"}
