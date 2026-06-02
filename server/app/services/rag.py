"""
RAG service -- PDF extraction + ChromaDB embeddings
"""
import os
# Suppress ChromaDB telemetry before the library is imported
os.environ.setdefault("CHROMA_TELEMETRY_ENABLED", "false")
os.environ.setdefault("CHROMA_SERVER_TELEMETRY_ENABLED", "false")

import sys
from pathlib import Path
from typing import Optional, List, Any
import chromadb
from chromadb.config import Settings

DB_PATH = Path(__file__).resolve().parents[2] / "data" / "chroma"
DB_PATH.mkdir(parents=True, exist_ok=True)

_client: Optional[Any] = None


def log(msg: str):
    """Emit a log line visible in container stdout/stderr."""
    print(f"[rag] {msg}", flush=True)


def get_chroma() -> Any:
    """Get or create the ChromaDB client singleton with telemetry disabled."""
    global _client
    if _client is None:
        log(f"Initializing ChromaDB PersistentClient at {DB_PATH}")
        _client = chromadb.PersistentClient(
            path=str(DB_PATH),
            settings=Settings(
                anonymized_telemetry=False,
            ),
        )
    return _client


# ---------------------------------------------------------------------------
# PDF extraction
# ---------------------------------------------------------------------------

def extract_text_from_pdf(file_path: Path) -> str:
    """Extract text from a PDF file using pypdf.

    Returns concatenated page text with page markers for context.
    Falls back page-by-page so a single corrupt page doesn't kill the
    entire extraction.
    """
    try:
        from pypdf import PdfReader
        reader = PdfReader(str(file_path))
        pages_text = []
        for i, page in enumerate(reader.pages):
            try:
                text = page.extract_text()
                if text and text.strip():
                    pages_text.append(f"[Page {i + 1}]\n{text.strip()}")
            except Exception as page_err:
                log(f"PDF page {i + 1} extraction error: {page_err}")
                continue
        result = "\n\n".join(pages_text)
        log(f"extract_text_from_pdf({file_path.name}): {len(pages_text)} pages, "
            f"{len(result)} chars extracted")
        return result
    except ImportError:
        log("pypdf not installed — cannot extract PDF text")
        return ""
    except Exception as e:
        log(f"PDF extraction error for {file_path.name}: {type(e).__name__}: {e}")
        return ""


# ---------------------------------------------------------------------------
# DOCX extraction
# ---------------------------------------------------------------------------

def extract_text_from_docx(file_path: Path) -> str:
    """Extract text from a .doc or .docx file using python-docx."""
    try:
        from docx import Document
        doc = Document(str(file_path))
        text = "\n".join(para.text for para in doc.paragraphs)
        log(f"extract_text_from_docx({file_path.name}): {len(text)} chars extracted")
        return text.strip()
    except ImportError:
        log("python-docx not installed — cannot extract DOCX text")
        return ""
    except Exception as e:
        log(f"DOCX extraction error for {file_path.name}: {type(e).__name__}: {e}")
        return ""


# ---------------------------------------------------------------------------
# Generic file text extraction (dispatches by extension)
# ---------------------------------------------------------------------------

def extract_text_from_file(file_path: Path) -> str:
    """Extract text from any supported file type.

    Supported: .pdf, .txt, .md, .doc, .docx
    """
    suffix = file_path.suffix.lower()
    if suffix == ".pdf":
        return extract_text_from_pdf(file_path)
    elif suffix in (".txt", ".md"):
        try:
            text = file_path.read_text(encoding="utf-8", errors="ignore")
            log(f"extract_text_from_file({file_path.name}): {len(text)} chars read")
            return text.strip()
        except Exception as e:
            log(f"Text file read error for {file_path.name}: {type(e).__name__}: {e}")
            return ""
    elif suffix in (".doc", ".docx"):
        return extract_text_from_docx(file_path)
    log(f"Unsupported file type: {suffix} for {file_path.name}")
    return ""


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """Split text into overlapping word-level chunks.

    Args:
        text: The input text to chunk.
        chunk_size: Number of words per chunk (default 500).
        overlap: Number of overlapping words between consecutive chunks (default 50).

    Returns:
        List of chunk strings.
    """
    words = text.split()
    if not words:
        return []
    chunks = []
    i = 0
    while i < len(words):
        chunk = " ".join(words[i: i + chunk_size])
        chunks.append(chunk)
        i += chunk_size - overlap
    log(f"chunk_text: {len(words)} words \u2192 {len(chunks)} chunks (size={chunk_size}, "
        f"overlap={overlap})")
    return chunks


# ---------------------------------------------------------------------------
# Embedding
# ---------------------------------------------------------------------------

def embed_document(doc_id: str, text: str, collection_name: str = "documents") -> bool:
    """Store document chunks in ChromaDB.

    Args:
        doc_id: Unique document identifier.
        text: Full document text to chunk and embed.
        collection_name: ChromaDB collection name (default "documents").

    Returns:
        True if embedding succeeded, False otherwise.
    """
    try:
        chroma = get_chroma()
        collection = chroma.get_or_create_collection(collection_name)
        chunks = chunk_text(text)
        if not chunks:
            log(f"embed_document({doc_id}): no chunks generated from text "
                f"(len={len(text)})")
            return False

        collection.upsert(
            ids=[f"{doc_id}_{i}" for i in range(len(chunks))],
            documents=chunks,
            metadatas=[{"doc_id": doc_id, "chunk": i, "total_chunks": len(chunks)}
                       for i in range(len(chunks))],
        )
        log(f"embed_document({doc_id}): stored {len(chunks)} chunks in "
            f"collection '{collection_name}'")
        return True
    except Exception as e:
        log(f"embed_document({doc_id}) failed: {type(e).__name__}: {e}")
        return False


# ---------------------------------------------------------------------------
# Query
# ---------------------------------------------------------------------------

def query_documents(
    question: str,
    doc_ids: Optional[List[str]] = None,
    n_results: int = 5,
    collection_name: str = "documents",
) -> str:
    """Query ChromaDB for chunks relevant to the question.

    Args:
        question: The user's question.
        doc_ids: Optional list of document IDs to restrict the search to.
        n_results: Maximum number of chunks to return.
        collection_name: ChromaDB collection name (default "documents").

    Returns:
        Concatenated chunk text, or empty string on failure.
    """
    try:
        chroma = get_chroma()
        collection = chroma.get_or_create_collection(collection_name)
        count = collection.count()
        if count == 0:
            log(f"query_documents: collection '{collection_name}' is empty")
            return ""
        where_filter = {"doc_id": {"$in": doc_ids}} if doc_ids else None
        results = collection.query(
            query_texts=[question],
            n_results=min(n_results, count),
            where=where_filter,
        )
        documents = results.get("documents")
        metadatas = results.get("metadatas", [])
        chunks = documents[0] if documents and len(documents) > 0 else []
        chunk_metas = metadatas[0] if metadatas and len(metadatas) > 0 else []
        log(f"query_documents: returned {len(chunks)} chunks "
            f"(n_results={n_results}, collection='{collection_name}')")
        if not chunks:
            return ""
        # Include source metadata inline for citation
        parts = []
        for i, (chunk, meta) in enumerate(zip(chunks, chunk_metas)):
            source = f"[Source: {meta.get('doc_id', 'unknown')[:8]} chunk {meta.get('chunk', i)}/{meta.get('total_chunks', '?')}]" if meta else ""
            parts.append(f"{source}\n{chunk}" if source else chunk)
        return "\n\n".join(parts)
    except Exception as e:
        log(f"query_documents failed: {type(e).__name__}: {e}")
        return ""
