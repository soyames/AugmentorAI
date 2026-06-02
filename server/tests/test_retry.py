"""Test the retry_pending_embeddings function."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.api.documents import retry_pending_embeddings
from app.models.database import SessionLocal, Document, Resume

# Show before state
db = SessionLocal()
docs = db.query(Document).all()
resumes = db.query(Resume).all()
print('BEFORE:')
print('  Documents:', [(d.id[:8], d.filename, d.embedding_status) for d in docs])
print('  Resumes:', [(r.id[:8], r.filename, r.embedding_status) for r in resumes])
db.close()

# Run retry
print('\nRunning retry_pending_embeddings...')
retry_pending_embeddings()

# Show after state
db = SessionLocal()
docs = db.query(Document).all()
resumes = db.query(Resume).all()
print('\nAFTER:')
print('  Documents:', [(d.id[:8], d.filename, d.embedding_status) for d in docs])
print('  Resumes:', [(r.id[:8], r.filename, r.embedding_status) for r in resumes])
db.close()

# Check chroma
from app.services.rag import get_chroma
c = get_chroma()
try:
    col = c.get_collection("documents")
    count = col.count()
    print(f'\nChromaDB total documents: {count}')
except Exception as e:
    print(f'\nChromaDB error: {e}')
