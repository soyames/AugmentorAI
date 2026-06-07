import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.models.database import SessionLocal, TranscriptChunk
from app.models.database import Session as SessionModel
from app.services.session_ai import generate_and_store_answer
from app.services.transcription import get_transcription_service
from app.services.coding_engine import get_classifier as get_coding_classifier

router = APIRouter()

# Store active connections and per-session streaming settings
active_connections: Dict[str, WebSocket] = {}
session_configs: Dict[str, Dict[str, Any]] = {}
recent_questions: Dict[str, str] = {}


async def _stream_coding_answer_and_send(session_id: str, chunk_id: str, question: str, language: str):
    """Stream a coding interview answer using role-specific prompts (approach + complexity + code + tests)."""
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

        # Build context string from dict
        resume_ctx = context.get("resume", "").strip()
        job_ctx = context.get("job_description", "").strip()
        notes_ctx = context.get("notes", "").strip()
        context_str = ""
        if resume_ctx:
            context_str += f"RESUME:\n{resume_ctx[:2000]}\n\n"
        if job_ctx:
            context_str += f"JOB DESCRIPTION:\n{job_ctx[:1000]}\n\n"
        if notes_ctx:
            context_str += f"DOCUMENTS:\n{notes_ctx[:1000]}"

        _start = time_module.monotonic()
        provider, token_gen, get_full_text = await llm.generate_coding_answer_stream(
            question=question,
            context_str=context_str,
            language=language,
            model=llm_settings.get("model") or "qwen2.5-coder:3b",
            settings=llm_settings,
            preferred_provider=session_configs.get(session_id, {}).get("preferred_provider", ""),
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
                "questionType": "coding",
            })

        full_text = get_full_text()
        if not full_text.strip():
            full_text = "No AI response was generated. Please try again."

        has_api_key = llm_settings.get("gemini_api_key") or llm_settings.get("deepseek_api_key")
        is_fallback = bool(has_api_key and provider in ("Ollama", "Ollama (local)") and not full_text.startswith("Error:"))

        rag_context = notes_ctx
        sources_list = []
        for line in rag_context.split("\n"):
            if line.startswith("[Source:") and "]" in line:
                source_ref = line[1:line.index("]")]
                if source_ref not in sources_list:
                    sources_list.append(source_ref)

        is_error = full_text.startswith("Error:")
        confidence, confidence_details = compute_confidence(
            answer=full_text,
            question=question,
            context_text=rag_context if rag_context else None,
            use_llm_eval=not is_error,
        )

        # Detect if answer contains code markers
        has_code = "```" in full_text
        from app.services.coding_engine import CodingQuestionClassifier
        qtype = CodingQuestionClassifier().classify(question)

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
                "question_type": qtype,
                "has_code": has_code,
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
            "question_type": qtype,
            "has_code": has_code,
        })

    except Exception as e:
        print(f"Coding answer streaming failed: {e}")
        error_msg = str(e)[:200]
        if "all AI providers failed" in error_msg:
            error_msg = "All AI providers failed."
        await send_to_session(session_id, {
            "type": "answer_error",
            "question": question,
            "error": error_msg,
            "provider": "none",
            "is_fallback": True,
        })
    finally:
        answer_db.close()


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
            preferred_provider=session_configs.get(session_id, {}).get("preferred_provider", ""),
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
        error_msg = str(e)[:200]
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


async def _stream_meeting_response(session_id: str, chunk_id: str, text: str, language: str):
    """Stream quick meeting talking points �?" brief expert bullets for live meetings."""
    import time as time_module
    from app.services.llm import get_llm_service
    from app.services.app_settings import get_llm_settings
    from app.services.conversation import build_conversation_context

    answer_db = SessionLocal()
    answer_id = str(uuid.uuid4())
    try:
        llm_settings = get_llm_settings(answer_db)
        llm = get_llm_service()
        context = build_conversation_context(answer_db, session_id, max_exchanges=5)

        system_prompt = (
            "You are a discreet real-time meeting coach. "
            "When you hear what someone just said, give 2-3 SHORT talking points the listener can say to sound expert. "
            "Rules: each bullet under 12 words, start each with '�?�', be direct and authoritative, "
            "no filler phrases. If a question was asked, answer it first in one sentence. "
            f"Respond in language code: {language}."
        )
        user_prompt = (
            f"Meeting context:\n{context[:600] if context else 'No prior context.'}\n\n"
            f"Just heard: \"{text}\"\n\nGive 2-3 concise talking points:"
        )

        _start = time_module.monotonic()
        provider, token_gen = await llm.generate_stream(
            prompt=user_prompt,
            system_prompt=system_prompt,
            model=llm_settings.get("model") or "qwen2.5-coder:3b",
            max_tokens=150,
            temperature=0.7,
            settings=llm_settings,
            preferred_provider=session_configs.get(session_id, {}).get("preferred_provider", ""),
        )
        _latency_ms = int((time_module.monotonic() - _start) * 1000)

        full_text = ""
        async for token in token_gen:
            full_text += token
            await send_to_session(session_id, {
                "type": "answer_chunk",
                "answerId": answer_id,
                "token": token,
                "transcriptChunkId": chunk_id,
                "provider": provider,
            })

        if not full_text.strip():
            full_text = text

        from app.models.database import AnswerSuggestion
        answer = AnswerSuggestion(
            id=answer_id,
            session_id=session_id,
            transcript_chunk_id=chunk_id,
            question=text,
            answer_text=full_text,
            confidence=0.7,
            language=language,
            provider=provider,
            latency_ms=_latency_ms,
        )
        answer_db.add(answer)
        answer_db.commit()

        await send_to_session(session_id, {
            "type": "answer",
            "answer": {
                "id": answer.id,
                "question": text,
                "answer_text": full_text,
                "confidence": 0.7,
                "language": language,
                "provider": provider,
                "is_fallback": False,
                "sources": None,
                "timestamp": answer.created_at.strftime("%H:%M:%S") if answer.created_at else "",
                "transcriptChunkId": chunk_id,
            },
        })
    except Exception as e:
        print(f"Meeting response failed: {e}")
        await send_to_session(session_id, {
            "type": "answer_error",
            "question": text,
            "error": str(e)[:200] if str(e) else "AI provider unavailable",
            "provider": "none",
            "is_fallback": True,
        })
    finally:
        answer_db.close()


async def _stream_conversation_response(session_id: str, chunk_id: str, text: str, language: str):
    """Stream a conversational response for continuous discussion mode."""
    import time as time_module
    from app.services.llm import get_llm_service
    from app.services.app_settings import get_llm_settings
    from app.services.conversation import generate_conversation_response

    answer_db = SessionLocal()
    answer_id = str(uuid.uuid4())
    try:
        llm_settings = get_llm_settings(answer_db)
        llm = get_llm_service()

        _start = time_module.monotonic()
        provider, token_gen = await llm.generate_stream(
            prompt=f'The last thing said was: "{text}"\n\nRespond naturally and conversationally.',
            system_prompt="You are a helpful AI assistant in a live conversation. Respond naturally and concisely (2-4 sentences).",
            model=llm_settings.get("model") or "qwen2.5-coder:3b",
            max_tokens=400,
            temperature=0.8,
            settings=llm_settings,
            preferred_provider=session_configs.get(session_id, {}).get("preferred_provider", ""),
        )
        _latency_ms = int((time_module.monotonic() - _start) * 1000)

        # Accumulate tokens locally while streaming
        full_text = ""
        async for token in token_gen:
            full_text += token
            await send_to_session(session_id, {
                "type": "answer_chunk", "answerId": answer_id, "token": token,
                "transcriptChunkId": chunk_id, "provider": provider,
            })

        if not full_text.strip():
            full_text = text

        from app.models.database import AnswerSuggestion
        answer = AnswerSuggestion(
            id=answer_id, session_id=session_id, transcript_chunk_id=chunk_id,
            question=text, answer_text=full_text, confidence=0.5,
            language=language, provider=provider, latency_ms=_latency_ms,
        )
        answer_db.add(answer)
        answer_db.commit()

        await send_to_session(session_id, {
            "type": "answer",
            "answer": {
                "id": answer.id, "question": text, "answer_text": full_text,
                "confidence": 0.5, "language": language, "provider": provider,
                "is_fallback": False, "sources": None,
                "timestamp": answer.created_at.strftime("%H:%M:%S") if answer.created_at else "",
                "transcriptChunkId": chunk_id,
            },
        })
    except Exception as e:
        print(f"Conversation response failed: {e}")
        await send_to_session(session_id, {
            "type": "answer_error", "question": text,
            "error": str(e)[:200] if str(e) else "AI provider unavailable",
            "provider": "none", "is_fallback": True,
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
                    if payload.get("preferred_provider"):
                        config["preferred_provider"] = str(payload["preferred_provider"])
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

            # Detect question type for routing + DB
            question_type = None
            if is_question:
                from app.services.coding_engine import CodingQuestionClassifier
                question_type = CodingQuestionClassifier().classify(text.strip())

            # Save to DB
            chunk = TranscriptChunk(
                id=str(uuid.uuid4()),
                session_id=session_id,
                speaker="interviewer",
                text=text.strip(),
                language=language,
                is_question=is_question,
                question_type=question_type if is_question else None,
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
                    "questionType": question_type,
                },
            })

            config = session_configs.get(session_id, {"auto_generate": True, "language": language})
            normalized_question = chunk.text.strip().lower()

            # Detect session mode
            session_model = db.query(SessionModel).filter(SessionModel.id == session_id).first()
            session_mode = session_model.mode if session_model else "practice"
            is_conversation = session_mode == "conversation"
            is_meeting = session_mode == "meeting"
            is_coding_mode = session_mode == "coding"

            # Auto-detect coding questions even in practice mode
            coding_classifier = get_coding_classifier()
            is_coding_question = is_coding_mode or coding_classifier.is_coding_question(chunk.text.strip())

            # Meeting + conversation respond to all speech; coding responds to all; interview only to questions
            should_respond = (
                config.get("auto_generate", True)
                and (is_conversation or is_meeting or is_coding_mode or chunk.is_question)
                and recent_questions.get(session_id) != normalized_question
            )

            if should_respond:
                recent_questions[session_id] = normalized_question
                lang = str(config.get("language") or language)
                if is_meeting:
                    task = asyncio.create_task(
                        _stream_meeting_response(
                            session_id=session_id,
                            chunk_id=chunk.id,
                            text=chunk.text.strip(),
                            language=lang,
                        )
                    )
                elif is_conversation:
                    task = asyncio.create_task(
                        _stream_conversation_response(
                            session_id=session_id,
                            chunk_id=chunk.id,
                            text=chunk.text.strip(),
                            language=lang,
                        )
                    )
                elif is_coding_question:
                    task = asyncio.create_task(
                        _stream_coding_answer_and_send(
                            session_id=session_id,
                            chunk_id=chunk.id,
                            question=chunk.text.strip(),
                            language=lang,
                        )
                    )
                else:
                    task = asyncio.create_task(
                        _stream_answer_and_send(
                            session_id=session_id,
                            chunk_id=chunk.id,
                            question=chunk.text.strip(),
                            language=lang,
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

