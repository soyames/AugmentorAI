"""
End-to-end test for PDF text extraction + ChromaDB embedding pipeline.

Usage:
    server/.venv/bin/python test_rag_pipeline.py

Tests:
1. PDF text extraction with pypdf
2. Text chunking
3. ChromaDB embedding storage
4. ChromaDB query / retrieval
5. Full round-trip: file → extract → embed → query
"""

import sys
import os
import tempfile
import shutil
from pathlib import Path

# Ensure app module is importable
sys.path.insert(0, str(Path(__file__).resolve().parent / "server" / "app"))

# Import RAG service
from services.rag import (
    extract_text_from_file,
    extract_text_from_pdf,
    chunk_text,
    embed_document,
    query_documents,
    get_chroma,
    DB_PATH,
)

TEST_COLLECTION = "test_pipeline"


def log(msg: str):
    print(f"  [test] {msg}", flush=True)


def test_pdf_extraction() -> bool:
    """Create a minimal PDF with text content and extract it."""
    from pypdf import PdfWriter, PdfReader

    log("=== Test 1: PDF text extraction ===")

    # Write a raw PDF with embedded text via a manual content stream
    raw_pdf = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792]
   /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 157 >>
stream
BT
/F1 12 Tf
100 700 Td
(Hello World from AugmentorAI PDF test) Tj
ET
BT
/F1 12 Tf
100 680 Td
(This is a second line of text for testing.) Tj
ET
BT
/F1 12 Tf
100 660 Td
(PDF extraction should capture this text.) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000476 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
528
%%EOF"""

    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
        f.write(raw_pdf)
        pdf_path = f.name

    text = extract_text_from_pdf(Path(pdf_path))
    log(f"Extracted text: {repr(text[:120])}...")

    assert "Hello World" in text, f"Expected 'Hello World', got: {repr(text[:100])}"
    assert "AugmentorAI" in text, f"Expected 'AugmentorAI'"
    assert "second line" in text, f"Expected 'second line'"

    os.unlink(pdf_path)
    log("PASS: PDF text extraction works!")
    return True


def test_chunking() -> bool:
    """Verify chunk_text produces correct overlapping chunks."""
    log("=== Test 2: Text chunking ===")

    # Generate 100 words
    words = [f"word{i}" for i in range(100)]
    text = " ".join(words)

    chunks = chunk_text(text, chunk_size=20, overlap=5)
    log(f"100 words chunked (size=20, overlap=5): {len(chunks)} chunks")

    assert len(chunks) == 7, f"Expected 7 chunks (100/15 = 6.67 rounded up), got {len(chunks)}"

    # Check overlap: chunk 0 ends before word14, chunk 1 starts with word15
    c0_words = chunks[0].split()
    c1_words = chunks[1].split()
    assert "word14" in c0_words, f"Expected word14 near end of chunk 0"
    assert c1_words[0] == "word15", f"First word of chunk 1 should be 'word15', got '{c1_words[0]}'"

    # Last chunk should have exactly word90-word99 (10 words)
    last_words = chunks[-1].split()
    assert last_words[0] == "word90", f"Last chunk should start with 'word90', got '{last_words[0]}'"
    assert last_words[-1] == "word99", f"Last chunk should end with 'word99', got '{last_words[-1]}'"

    log("PASS: Chunking works correctly with overlap!")
    return True


def test_empty_text_handling() -> bool:
    """Verify edge cases in chunking and extraction."""
    log("=== Test 3: Edge cases ===")

    assert chunk_text("") == [], "Empty text should yield no chunks"
    assert chunk_text("hello") == ["hello"], "Single word should produce one chunk"
    assert chunk_text("   ") == [], "Whitespace-only should yield no chunks"

    log("PASS: All edge cases handled correctly!")
    return True


def test_chromadb_embed_and_query() -> bool:
    """Test embedding storage and query in ChromaDB."""
    log("=== Test 4: ChromaDB embed + query round-trip ===")

    import chromadb
    from chromadb.config import Settings

    with tempfile.TemporaryDirectory() as tmpdir:
        from services import rag
        original_client = rag._client
        rag._client = chromadb.PersistentClient(
            path=os.path.join(tmpdir, "chroma_test"),
            settings=Settings(anonymized_telemetry=False),
        )

        try:
            doc_text = """
            Machine learning is a subset of artificial intelligence that enables systems
            to learn and improve from experience without being explicitly programmed.
            Deep learning uses neural networks with many layers to model complex patterns.
            Transformer architectures like BERT and GPT revolutionized natural language
            processing by using self-attention mechanisms. These models can be fine-tuned
            for specific tasks like classification, summarization, and question answering.
            """

            doc_id = "test_doc_001"

            success = embed_document(doc_id, doc_text, TEST_COLLECTION)
            assert success, "embed_document should return True"

            results = query_documents(
                "What is deep learning?",
                doc_ids=[doc_id],
                n_results=3,
                collection_name=TEST_COLLECTION,
            )
            log(f"Query (filtered) results: {len(results)} chars")
            assert "machine learning" in results.lower() or "deep learning" in results.lower(), \
                f"Expected relevant content, got: {results[:200]}"

            results2 = query_documents(
                "Transformer architectures",
                n_results=3,
                collection_name=TEST_COLLECTION,
            )
            assert len(results2) > 0, "Query without doc filter should return results"
            assert "transformer" in results2.lower() or "BERT" in results2, \
                f"Expected transformer/BERT, got: {results2[:200]}"

            log("PASS: ChromaDB embed + query round-trip works!")

            chroma = rag.get_chroma()
            try:
                chroma.delete_collection(TEST_COLLECTION)
            except Exception:
                pass

        finally:
            rag._client = original_client

    return True


def test_file_extraction_dispatchers() -> bool:
    """Verify extract_text_from_file dispatches correctly by extension."""
    log("=== Test 5: File extension dispatch ===")

    # TXT file
    with tempfile.NamedTemporaryFile(suffix=".txt", mode="w", delete=False) as f:
        f.write("Hello from a text file!")
        txt_path = f.name
    text = extract_text_from_file(Path(txt_path))
    assert "Hello from a text file" in text, f"TXT extraction failed: {repr(text)}"
    os.unlink(txt_path)
    log("TXT dispatch: PASS")

    # MD file
    with tempfile.NamedTemporaryFile(suffix=".md", mode="w", delete=False) as f:
        f.write("# Markdown Title\n\nSome **bold** content.")
        md_path = f.name
    text = extract_text_from_file(Path(md_path))
    assert "Markdown Title" in text, f"MD extraction failed: {repr(text)}"
    assert "bold" in text, f"MD extraction missed content: {repr(text)}"
    os.unlink(md_path)
    log("MD dispatch: PASS")

    # Unknown extension
    with tempfile.NamedTemporaryFile(suffix=".xyz", mode="w", delete=False) as f:
        f.write("Should not be extracted")
        xyz_path = f.name
    text = extract_text_from_file(Path(xyz_path))
    assert text == "", f"Unknown extension should return empty, got: {repr(text)}"
    os.unlink(xyz_path)
    log("Unknown extension dispatch: PASS")

    log("PASS: All file dispatchers work correctly!")
    return True


def main():
    print("=" * 60)
    print("RAG Pipeline Test Suite")
    print("=" * 60)
    print()

    tests = [
        ("PDF text extraction", test_pdf_extraction),
        ("Text chunking", test_chunking),
        ("Edge cases", test_empty_text_handling),
        ("ChromaDB embed + query", test_chromadb_embed_and_query),
        ("File extension dispatch", test_file_extraction_dispatchers),
    ]

    passed = 0
    failed = 0

    for name, test_fn in tests:
        try:
            test_fn()
            passed += 1
            print()
        except Exception as e:
            print(f"  FAIL: {name}: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
            print()

    print("=" * 60)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 60)

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
