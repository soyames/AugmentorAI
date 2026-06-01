"""
RAG service — PDF extraction + ChromaDB embeddings
"""
import os
from pathlib import Path
from typing import Optional, List
import chromadb
from chromadb.config import Settings

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "chroma"
DB_PATH.mkdir(parents=True, exist_ok=True)

_client: Optional[chromadb.Client] = None

def get_chroma():
    global _client
    if _client is None:
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
        print(f"PDF extraction error: {e}")
        return ""


def extract_text_from_file(file_path: Path) -> str:
    """Extract text from any supported file."""
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    elif suffix in (".txt", ".md"):
        try:
            return file_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return ""
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
            return False
        collection.upsert(
            ids=[f"{doc_id}_{i}" for i in range(len(chunks))],
            documents=chunks,
            metadatas=[{"doc_id": doc_id, "chunk": i} for i in range(len(chunks))],
        )
        return True
    except Exception as e:
        print(f"Embedding error: {e}")
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
        print(f"Query error: {e}")
        return ""
