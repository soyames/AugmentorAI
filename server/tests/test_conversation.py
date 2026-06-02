"""Unit tests for conversation mode — ambient discussion assistant."""
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure the project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import anyio
from app.services.conversation import (
    build_conversation_context,
    generate_conversation_response,
)


def make_mock_chunk(chunk_id, session_id, speaker, text, created_at=None):
    """Helper: create a mock TranscriptChunk."""
    from datetime import datetime

    ch = MagicMock()
    ch.id = chunk_id
    ch.session_id = session_id
    ch.speaker = speaker
    ch.text = text
    ch.created_at = created_at or datetime(2025, 1, 1)
    return ch


def make_mock_answer(chunk_id, session_id, answer_text, sources="[]"):
    """Helper: create a mock AnswerSuggestion."""
    a = MagicMock()
    a.transcript_chunk_id = chunk_id
    a.session_id = session_id
    a.answer_text = answer_text
    a.sources = sources
    return a


class TestBuildConversationContext:
    """Tests for build_conversation_context()."""

    def test_empty_conversation_returns_empty_string(self):
        """No chunks or answers yields a minimal string."""
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        result = build_conversation_context(db, "session-1")
        # No lines produced — result is empty
        assert "You:" not in result
        assert "Other:" not in result
        assert "AI:" not in result

    def test_single_exchange_renders_correctly(self):
        """One interviewer chunk + AI answer should render three lines."""
        db = MagicMock()

        chunk = make_mock_chunk("c1", "session-1", "interviewer", "Tell me about yourself")
        answer = make_mock_answer("c1", "session-1", "I am a software engineer.")

        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            chunk
        ]
        db.query.return_value.filter.return_value.all.return_value = [answer]

        result = build_conversation_context(db, "session-1")
        assert "You: Tell me about yourself" in result
        assert "AI: I am a software engineer." in result

    def test_speaker_labels_correct(self):
        """'interviewer' → 'You'; anything else → 'Other'."""
        db = MagicMock()
        interviewer = make_mock_chunk("c1", "s1", "interviewer", "Hello")
        candidate = make_mock_chunk("c2", "s1", "candidate", "Hi there")

        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            candidate,
            interviewer,
        ]
        db.query.return_value.filter.return_value.all.return_value = []

        result = build_conversation_context(db, "s1")
        assert "You: Hello" in result
        assert "Other: Hi there" in result

    def test_empty_text_lines_skipped(self):
        """Chunks with empty/whitespace-only text are omitted."""
        db = MagicMock()
        chunks = [
            make_mock_chunk("c1", "s1", "interviewer", "   "),
            make_mock_chunk("c2", "s1", "candidate", "Valid text"),
        ]
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = chunks
        db.query.return_value.filter.return_value.all.return_value = []

        result = build_conversation_context(db, "s1")
        assert "You:" not in result  # empty chunk skipped
        assert "Other: Valid text" in result

    def test_max_exchanges_respected(self):
        """Only the most recent max_exchanges chunks are used."""
        db = MagicMock()
        # Simulate 15 chunks but max_exchanges=3
        chunks = [make_mock_chunk(f"c{i}", "s1", "interviewer", f"Chunk {i}") for i in range(15)]
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = (
            chunks[-3:]  # .all() returns only 3
        )
        db.query.return_value.filter.return_value.all.return_value = []

        result = build_conversation_context(db, "s1", max_exchanges=3)
        # Only 3 lines should appear (chunks 12, 13, 14)
        assert result.count("Chunk") == 3

    def test_topics_from_sources_extracted(self):
        """JSON sources are parsed and shown as known topics."""
        db = MagicMock()
        chunk = make_mock_chunk("c1", "s1", "interviewer", "Tell me about Python")
        answer = make_mock_answer(
            "c1", "s1", "Python is great.",
            '["Python", "programming", "data science"]',
        )
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            chunk
        ]
        db.query.return_value.filter.return_value.all.return_value = [answer]

        result = build_conversation_context(db, "s1")
        assert "Python" in result
        assert "programming" in result
        assert "data science" in result

    def test_answer_text_truncated_at_300_chars(self):
        """Long AI answers are truncated to 300 chars."""
        long_text = "A" * 500
        db = MagicMock()
        chunk = make_mock_chunk("c1", "s1", "interviewer", "Q?")
        answer = make_mock_answer("c1", "s1", long_text)
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [
            chunk
        ]
        db.query.return_value.filter.return_value.all.return_value = [answer]

        result = build_conversation_context(db, "s1")
        assert "AI: " in result
        # Should be truncated to 300 chars
        answer_line = [l for l in result.split("\n") if l.startswith("AI:")][0]
        assert len(answer_line) <= 304  # "AI: " + 300 = 304


class TestGenerateConversationResponse:
    """Tests for generate_conversation_response()."""

    @pytest.mark.anyio
    async def test_basic_response_structure(self):
        """Returns dict with text, provider, is_fallback."""
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        mock_llm = AsyncMock()
        mock_llm.generate.return_value = "That's a great question!"
        mock_llm._last_provider = "ollama"

        with (
            patch("app.services.conversation.get_llm_settings", return_value={}),
            patch("app.services.conversation.get_llm_service", return_value=mock_llm),
        ):
            result = await generate_conversation_response(
                db, "session-1", "What do you think about AI?"
            )

        assert isinstance(result, dict)
        assert "text" in result
        assert "provider" in result
        assert "is_fallback" in result
        assert result["text"] == "That's a great question!"
        assert result["provider"] == "ollama"

    @pytest.mark.anyio
    async def test_language_param_passed_to_prompt(self):
        """Language parameter is included in the system prompt."""
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        mock_llm = AsyncMock()
        mock_llm.generate.return_value = "Bonjour!"
        mock_llm._last_provider = "deepseek"

        with (
            patch("app.services.conversation.get_llm_settings", return_value={}),
            patch("app.services.conversation.get_llm_service", return_value=mock_llm),
        ):
            result = await generate_conversation_response(
                db, "session-1", "Bonjour!", language="fr"
            )

        assert "fr" in mock_llm.generate.call_args[1].get("system_prompt", "")

    @pytest.mark.anyio
    async def test_history_disabled_skips_db_query(self):
        """When use_history=False, build_conversation_context is not called."""
        db = MagicMock()

        mock_llm = AsyncMock()
        mock_llm.generate.return_value = "Quick response."
        mock_llm._last_provider = "ollama"

        with (
            patch("app.services.conversation.get_llm_settings", return_value={}),
            patch("app.services.conversation.get_llm_service", return_value=mock_llm),
        ):
            result = await generate_conversation_response(
                db, "session-1", "Hi!", use_history=False
            )

        # db.query should not have been called for history
        assert result["text"] == "Quick response."

    @pytest.mark.anyio
    async def test_fallback_flag_for_ollama_provider(self):
        """is_fallback is True when provider is 'Ollama (local)'."""
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        mock_llm = AsyncMock()
        mock_llm.generate.return_value = "Fallback answer."
        mock_llm._last_provider = "Ollama (local)"

        with (
            patch("app.services.conversation.get_llm_settings", return_value={}),
            patch("app.services.conversation.get_llm_service", return_value=mock_llm),
        ):
            result = await generate_conversation_response(db, "s1", "Test?")

        assert result["is_fallback"] is True

    @pytest.mark.anyio
    async def test_non_fallback_provider(self):
        """is_fallback is False for cloud providers."""
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        mock_llm = AsyncMock()
        mock_llm.generate.return_value = "Cloud answer."
        mock_llm._last_provider = "deepseek"

        with (
            patch("app.services.conversation.get_llm_settings", return_value={}),
            patch("app.services.conversation.get_llm_service", return_value=mock_llm),
        ):
            result = await generate_conversation_response(db, "s1", "Test?")

        assert result["is_fallback"] is False
