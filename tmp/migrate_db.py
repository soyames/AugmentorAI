# Write the clean migration file
import sqlite3
db_path = '/app/server/app/instance/augmentorai.db'
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("PRAGMA table_info(transcript_chunks)")
cols = [c[1] for c in cur.fetchall()]
print('transcript_chunks columns:', cols)
if 'question_type' not in cols:
    cur.execute('ALTER TABLE transcript_chunks ADD COLUMN question_type VARCHAR')
    print('Added question_type to transcript_chunks')
cur.execute("PRAGMA table_info(answer_suggestions)")
cols2 = [c[1] for c in cur.fetchall()]
print('answer_suggestions columns:', cols2)
if 'question_type' not in cols2:
    cur.execute('ALTER TABLE answer_suggestions ADD COLUMN question_type VARCHAR')
    print('Added question_type to answer_suggestions')
conn.commit()
conn.close()
print('Done')
"| Set-Content "$env:TEMP\migrate_clean.py" -Encoding ascii

# Copy to container and run
docker cp "$env:TEMP\migrate_clean.py" augmentorai-server-1:/tmp/migrate.py
docker exec augmentorai-server-1 python /tmp/migrate.py
docker restart augmentorai-server-1