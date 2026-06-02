import asyncio
import json
import uuid
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.database import SessionLocal, TranscriptChunk
from app.services.session_ai import generate_and_store_answer
from app.services.transcription import get_transcription_service

router = APIRouter()

# Store active connections and per-session streaming settings
active_connections: Dict[str, WebSocket] = {}
session_configs: Dict[str, Dict[str, Any]] = {}
recent_questions: Dict[str, str] = {}


def _consume_task_result(task: asyncio.Task) -> None:
    try:
        task.result()
    except asyncio.CancelledError:
        pass
    except Exception as exc:
        print(f"Live answer task failed: {exc}")


async def _generate_and_send_answer(session_id: str, chunk_id: str, question: str, language: str):
    answer_db = SessionLocal()
    try:
        answer = await generate_and_store_answer(
            db=answer_db,
            session_id=session_id,
            question=question,
            language=language,
        )

        await send_to_session(
            session_id,
            {
                "type": "answer",
                "answer": {
                    "id": answer.id,
                    "question": answer.question or question,
                    "answer_text": answer.answer_text,
                    "confidence": answer.confidence,
                    "language": answer.language,
                    "provider": getattr(answer, "_provider", "unknown"),
                    "is_fallback": getattr(answer, "_is_fallback", False),
                    "timestamp": answer.created_at.strftime("%H:%M:%S"),
                    "transcriptChunkId": chunk_id,
                },
            },
        )
    except Exception as e:
        print(f"Live answer generation failed: {e}")
        error_msg = str(e)
        # Clean up error messages for display
        if "all AI providers failed" in error_msg:
            error_msg = "All AI providers failed. Check your Gemini/DeepSeek API keys and ensure Ollama is running."
        elif "Gemini" in error_msg and "Ollama" in error_msg:
            error_msg = f"AI providers unavailable. {error_msg[:200]}"
        elif "404" in error_msg and "Ollama" in error_msg:
            error_msg = "Ollama model not found (HTTP 404). Pull the model first or configure a different fallback model."
        await send_to_session(
            session_id,
            {
                "type": "answer_error",
                "question": question,
                "error": error_msg,
                "provider": "none",
                "is_fallback": True,
            },
        )
    finally:
        answer_db.close()


@router.websocket("/sessions/{session_id}/stream")
async def websocket_stream(websocket: WebSocket, session_id: str):
    await websocket.accept()
    active_connections[session_id] = websocket
    session_configs[session_id] = {"auto_generate": True, "language": "en"}

    transcription_service = get_transcription_service()
    db = SessionLocal()
    pending_tasks: set[asyncio.Task] = set()

    try:
        while True:
            message = await websocket.receive()

            if message.get("text") is not None:
                try:
                    payload = json.loads(message["text"])
                except json.JSONDecodeError:
                    continue

                if payload.get("type") == "config":
                    config = session_configs.setdefault(session_id, {"auto_generate": True, "language": "en"})
                    if "autoReply" in payload:
                        config["auto_generate"] = bool(payload.get("autoReply"))
                    if "auto_generate" in payload:
                        config["auto_generate"] = bool(payload.get("auto_generate"))
                    if payload.get("language"):
                        config["language"] = str(payload["language"])
                continue

            # Receive audio data (raw PCM int16 bytes at 16kHz)
            data = message.get("bytes")
            if not data:
                continue

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

            config = session_configs.get(session_id, {"auto_generate": True, "language": language})
            normalized_question = chunk.text.strip().lower()
            if chunk.is_question and config.get("auto_generate", True):
                if recent_questions.get(session_id) != normalized_question:
                    recent_questions[session_id] = normalized_question
                    task = asyncio.create_task(
                        _generate_and_send_answer(
                            session_id=session_id,
                            chunk_id=chunk.id,
                            question=chunk.text.strip(),
                            language=str(config.get("language") or language),
                        )
                    )
                    pending_tasks.add(task)
                    task.add_done_callback(lambda t: (_consume_task_result(t), pending_tasks.discard(t)))

    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        for task in pending_tasks:
            task.cancel()
        if session_id in active_connections:
            del active_connections[session_id]
        if session_id in session_configs:
            del session_configs[session_id]
        if session_id in recent_questions:
            del recent_questions[session_id]
        db.close()


async def send_to_session(session_id: str, message: dict):
    """Send a message to a specific session's WebSocket connection."""
    if session_id in active_connections:
        await active_connections[session_id].send_json(message)
