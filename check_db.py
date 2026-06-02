"""Check existing DB records."""
import sys; sys.path.insert(0, 'server')
from app.models.database import SessionLocal, Document, Resume
db = SessionLocal()
docs = db.query(Document).all()
resumes = db.query(Resume).all()
print('Documents:', [(d.id[:8], d.filename, d.embedding_status) for d in docs])
print('Resumes:', [(r.id[:8], r.filename, r.embedding_status) for r in resumes])
db.close()
