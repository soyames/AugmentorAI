from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import uuid
from datetime import datetime

from app.services.transcription import get_transcription_service
from app.models.database import SessionLocal, TranscriptChunk

router = APIRouter()

# Store active connections
active_connections: Dict[str, WebSocket] = {}


@router.websocket("/sessions/{session_id}/stream")
async def websocket_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    active_connections[session_id] = websocket

    transcription_service = get_transcription_service()
    db = SessionLocal()

    try:
        while True:
            # Receive audio data (raw PCM int16 bytes at 16kHz)
            data = await websocket.receive_bytes()

            # Skip very small chunks (silence / keep-alive)
            if len(data) < 200:
                continue

            # Transcribe audio
            text, language, confidence = transcription_service.transcribe(data)

            if not text or not text.strip():
                continue

            # Detect if it's a question
            is_question = transcription_service.detect_question(text)

            # Save to DB
            chunk = TranscriptChunk(
                id=str(uuid.uuid4()),
                session_id=session_id,
                speaker="interviewer",
                text=text.strip(),
                language=language,
                is_question=is_question,
            )
            db.add(chunk)
            db.commit()
            db.refresh(chunk)

            # Send transcript update back to client
            await websocket.send_json({
                "type": "transcript",
                "chunk": {
                    "id": chunk.id,
                    "speaker": chunk.speaker,
                    "text": chunk.text,
                    "language": chunk.language,
                    "timestamp": datetime.utcnow().strftime("%H:%M:%S"),
                    "isQuestion": chunk.is_question,
                },
            })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        if session_id in active_connections:
            del active_connections[session_id]
        db.close()


async def send_to_session(session_id: str, message: dict):
    """Send a message to a specific session's WebSocket connection."""
    if session_id in active_connections:
        await active_connections[session_id].send_json(message)
