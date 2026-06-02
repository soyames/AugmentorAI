import asyncio
import json
import uuid
from datetime import datetime, timezone
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


async def _stream_answer_and_send(session_id: str, chunk_id: str, question: str, language: str):
    """Stream answer tokens in real-time via WebSocket, then store final result."""
    import time as time_module
    from app.models.database import Session as SessionModel
    from app.services.llm import get_llm_service
    from app.services.app_settings import get_llm_settings
    from app.services.session_context import build_answer_context
    from app.services.confidence_scorer import compute_confidence

    answer_db = SessionLocal()
    answer_id = str(uuid.uuid4())
    try:
        session = answer_db.query(SessionModel).filter(SessionModel.id == session_id).first()
        if not session:
            raise ValueError("Session not found")

        context = build_answer_context(answer_db, session, question)
        llm_settings = get_llm_settings(answer_db)
        llm = get_llm_service()

        _start = time_module.monotonic()
        provider, token_gen, get_full_text = await llm.generate_interview_answer_stream(
            question=question,
            context=context,
            language=language,
            model=llm_settings.get("model") or "qwen2.5-coder:3b",
            settings=llm_settings,
        )
        _latency_ms = int((time_module.monotonic() - _start) * 1000)

        # Stream tokens to frontend
        token_count = 0
        async for token in token_gen:
            token_count += 1
            await send_to_session(session_id, {
                "type": "answer_chunk",
                "answerId": answer_id,
                "token": token,
                "transcriptChunkId": chunk_id,
                "provider": provider,
            })

        full_text = get_full_text()
        if not full_text.strip():
            full_text = "No AI response was generated. Please try again."

        # Detect fallback
        has_api_key = llm_settings.get("gemini_api_key") or llm_settings.get("deepseek_api_key")
        is_fallback = bool(has_api_key and provider in ("Ollama", "Ollama (local)") and not full_text.startswith("Error:"))

        # Extract sources from context
        rag_context = context.get("notes", "")
        sources_list = []
        for line in rag_context.split("\n"):
            if line.startswith("[Source:") and "]" in line:
                source_ref = line[1:line.index("]")]
                if source_ref not in sources_list:
                    sources_list.append(source_ref)

        # Compute confidence
        is_error = full_text.startswith("Error:")
        confidence, confidence_details = compute_confidence(
            answer=full_text,
            question=question,
            context_text=rag_context if rag_context else None,
            use_llm_eval=not is_error,
        )

        # Store in DB
        from app.models.database import AnswerSuggestion
        answer = AnswerSuggestion(
            id=answer_id,
            session_id=session_id,
            transcript_chunk_id=chunk_id,
            question=question,
            answer_text=full_text,
            confidence=confidence,
            confidence_score=confidence,
            confidence_details=json.dumps(confidence_details) if confidence_details else None,
            language=language,
            provider=provider,
            latency_ms=_latency_ms,
            is_fallback=is_fallback,
            tokens_used=len(full_text.split()),
            sources=json.dumps(sources_list) if sources_list else None,
        )
        answer_db.add(answer)
        session.ai_usage = (session.ai_usage or 0) + 1
        answer_db.commit()
        answer_db.refresh(answer)

        # Send final answer
        conf_details = None
        if answer.confidence_details:
            try:
                conf_details = json.loads(answer.confidence_details)
            except (json.JSONDecodeError, TypeError):
                conf_details = None

        await send_to_session(session_id, {
            "type": "answer",
            "answer": {
                "id": answer.id,
                "question": answer.question or question,
                "answer_text": answer.answer_text,
                "confidence": answer.confidence,
                "language": answer.language,
                "provider": answer.provider or "unknown",
                "is_fallback": answer.is_fallback if hasattr(answer, 'is_fallback') else False,
                "sources": answer.sources,
                "timestamp": answer.created_at.strftime("%H:%M:%S"),
                "transcriptChunkId": chunk_id,
            },
        })

        await send_to_session(session_id, {
            "type": "confidence_update",
            "answerId": answer.id,
            "transcriptChunkId": chunk_id,
            "confidence": answer.confidence,
            "confidence_score": answer.confidence_score,
            "details": conf_details,
            "provider": answer.provider or "unknown",
            "is_fallback": answer.is_fallback if hasattr(answer, 'is_fallback') else False,
        })

    except Exception as e:
        print(f"Streaming answer failed: {e}")
        error_msg = str(e)
        if "all AI providers failed" in error_msg:
            error_msg = "All AI providers failed. Check your Gemini/DeepSeek API keys and ensure Ollama is running."
        elif "404" in error_msg and "Ollama" in error_msg:
            error_msg = "Ollama model not found (HTTP 404). Pull the model first or configure a different fallback model."
        await send_to_session(session_id, {
            "type": "answer_error",
            "question": question,
            "error": error_msg,
            "provider": "none",
            "is_fallback": True,
        })
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
            is_question = transcription_service.detect_question(text, language=language)

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
                    "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
                    "isQuestion": chunk.is_question,
                },
            })

            config = session_configs.get(session_id, {"auto_generate": True, "language": language})
            normalized_question = chunk.text.strip().lower()
            if chunk.is_question and config.get("auto_generate", True):
                if recent_questions.get(session_id) != normalized_question:
                    recent_questions[session_id] = normalized_question
                    task = asyncio.create_task(
                        _stream_answer_and_send(
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
