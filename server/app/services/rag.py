"""
RAG service -- PDF extraction + ChromaDB embeddings
"""
import sys
from pathlib import Path
from typing import Optional, List
import chromadb

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "chroma"
DB_PATH.mkdir(parents=True, exist_ok=True)

_client: Optional[chromadb.Client] = None


def log(msg: str):
    """Emit a log line visible in container stdout/stderr."""
    print(f"[rag] {msg}", flush=True)


def get_chroma():
    global _client
    if _client is None:
        log(f"Initializing ChromaDB PersistentClient at {DB_PATH}")
        _client = chromadb.PersistentClient(path=str(DB_PATH))
    return _client


def extract_text_from_pdf(file_path: Path) -> str:
    """Extract text from a PDF file using pypdf."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(file_path))
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text.strip()
    except Exception as e:
        log(f"PDF extraction error for {file_path.name}: {e}")
        return ""


def extract_text_from_docx(file_path: Path) -> str:
    """Extract text from a .doc or .docx file using python-docx."""
    try:
        from docx import Document
        doc = Document(str(file_path))
        text = "\n".join(para.text for para in doc.paragraphs)
        return text.strip()
    except Exception as e:
        log(f"DOCX extraction error for {file_path.name}: {e}")
        return ""


def extract_text_from_file(file_path: Path) -> str:
    """Extract text from any supported file."""
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    elif suffix in (".txt", ".md"):
        try:
            return file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            log(f"Text file read error for {file_path.name}: {e}")
            return ""
    elif suffix in (".doc", ".docx"):
        return extract_text_from_docx(file_path)
    log(f"Unsupported file type: {suffix}")
    return ""


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping chunks."""
    words = text.split()
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i : i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    return chunks


def embed_document(doc_id: str, text: str, collection_name: str = "documents") -> bool:
    """Store document chunks in ChromaDB."""
    try:
        chroma = get_chroma()
        collection = chroma.get_or_create_collection(collection_name)
        chunks = chunk_text(text)
        if not chunks:
            log(f"embed_document({doc_id}): no chunks generated from text (len={len(text)})")
            return False
        collection.upsert(
            ids=[f"{doc_id}_{i}" for i in range(len(chunks))],
            documents=chunks,
            metadatas=[{"doc_id": doc_id, "chunk": i} for i in range(len(chunks))],
        )
        log(f"embed_document({doc_id}): stored {len(chunks)} chunks in collection '{collection_name}'")
        return True
    except Exception as e:
        log(f"embed_document({doc_id}) failed: {type(e).__name__}: {e}")
        return False


def query_documents(question: str, doc_ids: List[str] = None, n_results: int = 5, collection_name: str = "documents") -> str:
    """Query ChromaDB for relevant chunks."""
    try:
        chroma = get_chroma()
        collection = chroma.get_or_create_collection(collection_name)
        where = {"doc_id": {"$in": doc_ids}} if doc_ids else None
        results = collection.query(
            query_texts=[question],
            n_results=min(n_results, collection.count() or 1),
            where=where,
        )
        chunks = results.get("documents", [[]])[0]
        return "\n\n".join(chunks)
    except Exception as e:
        log(f"query_documents failed: {type(e).__name__}: {e}")
        return ""
