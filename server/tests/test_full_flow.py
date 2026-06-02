"""Full integration test of the document upload -> embedding flow."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import os
from pathlib import Path
from app.models.database import SessionLocal, Document, engine, Base
from app.services.rag import get_chroma, embed_document, extract_text_from_file
from app.api.documents import process_uploaded_file

# Ensure tables exist
Base.metadata.create_all(bind=engine)

# Clean up any existing test data
db = SessionLocal()
db.query(Document).filter(Document.filename == "test_embedding.txt").delete()
db.commit()
db.close()

# Clean chroma test data
try:
    c = get_chroma()
    c.delete_collection("documents")
except Exception:
    pass

# Create a test file
uploads_dir = Path(__file__).resolve().parent / "server" / "data" / "uploads"
os.makedirs(uploads_dir, exist_ok=True)
test_file = uploads_dir / "test_embedding.txt"
test_file.write_text("This is test content for the embedding pipeline. " * 20)

# Step 1: Simulate what upload_document does
db = SessionLocal()
document = Document(
    session_id=None,
    doc_type="notes",
    filename=test_file.name,
    embedding_status="processing",
)
db.add(document)
db.commit()
db.refresh(document)
doc_id = document.id
db.close()

print(f"Created document with id: {doc_id}")

# Step 2: Run background task
process_uploaded_file("document", doc_id, str(test_file))

# Step 3: Verify DB status
db = SessionLocal()
record = db.query(Document).filter(Document.id == doc_id).first()
print(f"Embedding status: {record.embedding_status}")
print(f"Extracted text length: {len(record.extracted_text) if record.extracted_text else 0}")
db.close()

# Step 4: Verify ChromaDB has data
c = get_chroma()
try:
    col = c.get_collection("documents")
    count = col.count()
    print(f"ChromaDB documents count: {count}")
    if count > 0:
        print("SUCCESS: ChromaDB has persisted documents!")
    else:
        print("FAILURE: ChromaDB is empty")
except Exception as e:
    print(f"Error getting collection: {e}")

# Check the directory
chroma_dir = "/home/opc/projects/AugmentorAI/server/data/chroma"
print(f"Chroma dir: {os.listdir(chroma_dir)}")
