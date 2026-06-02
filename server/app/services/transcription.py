"""
Transcription service using faster-whisper
"""
import os
import traceback
from typing import Optional, Tuple
import numpy as np

# Try to import faster-whisper, fallback to placeholder if not available
try:
    from faster_whisper import WhisperModel
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False


class TranscriptionService:
    def __init__(self, model_size: str = "base", device: str = "cpu"):
        self.model_size = model_size
        self.device = device
        self.model = None

    def _load_model(self):
        """Load the Whisper model."""
        try:
            self.model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type="int8" if self.device == "cpu" else "float16",
            )
        except Exception as e:
            print(f"Failed to load Whisper model: {e}")
            traceback.print_exc()
            self.model = None

    def transcribe(
        self,
        audio_data: bytes,
        language: Optional[str] = None,
    ) -> Tuple[str, str, float]:
        """
        Transcribe audio data.

        Args:
            audio_data: Raw audio bytes
            language: Optional language code (auto-detect if None)

        Returns:
            Tuple of (transcribed_text, detected_language, confidence)
        """
        if not WHISPER_AVAILABLE or self.model is None:
            if WHISPER_AVAILABLE:
                self._load_model()
            if self.model is None:
                return "Whisper not available. Install faster-whisper.", "en", 0.0

        try:
            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0

            # Transcribe
            segments, info = self.model.transcribe(
                audio_array,
                language=language,
                beam_size=5,
                vad_filter=True,
            )

            # Combine segments
            text = " ".join(segment.text for segment in segments)
            detected_language = info.language
            confidence = info.language_probability

            return text.strip(), detected_language, confidence

        except Exception as e:
            print(f"Transcription error: {e}")
            traceback.print_exc()
            return "", "en", 0.0

    def detect_question(self, text: str) -> bool:
        """
        Detect if the text is likely a question.

        Args:
            text: Transcribed text

        Returns:
            True if the text appears to be a question
        """
        if not text:
            return False

        # Simple heuristics for question detection
        question_words = [
            "what", "why", "how", "when", "where", "who", "which",
            "can you", "could you", "would you", "do you", "are you",
            "tell me", "describe", "explain", "walk me through",
        ]

        text_lower = text.lower().strip()

        # Check for question mark
        if text.strip().endswith("?"):
            return True

        # Check for question words at the start
        for word in question_words:
            if text_lower.startswith(word):
                return True

        return False


# Singleton instance
_transcription_service: Optional[TranscriptionService] = None


def get_transcription_service() -> TranscriptionService:
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service
