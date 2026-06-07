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

            # Skip near-silence (quiet mic = wasted compute)
            rms = float(np.sqrt(np.mean(audio_array ** 2)))
            if rms < 0.005:
                return "", "en", 0.0

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

    def detect_question(self, text: str, language: str = "en") -> bool:
        """Detect if text is a question — regex-based, multi-language."""
        import re

        if not text or not text.strip():
            return False

        text_stripped = text.strip()
        text_lower = text_stripped.lower()

        # Universal: question mark anywhere
        if "?" in text_stripped or "\uff1f" in text_stripped:
            return True

        word_count = len(text_stripped.split())

        # Language-specific patterns (regex, word-boundary)
        patterns_by_lang = {
            "en": [
                r"^(what|why|how|when|where|who|which)\b",
                r"^(can|could|would|do|did|does|are|is|have|has|will|shall)\s+(you|we|they|i|he|she|it|this|that|there)",
                r"^(tell me|describe|explain|walk me through|talk about|discuss|elaborate)",
                r"^(have you|did you|will you|are you|do you|could you|would you|can you)",
                r"^(is there|are there|is it|are they|was it|were they)",
                r"what('s| is) (your|the|a)",
                r"how (do|does|would|could|can|about)",
                r"^(list|name|give|define|clarify|summarize)\b",
            ],
            "fr": [
                r"^(qu'est-ce|quoi|pourquoi|comment|quand|o\xf9|qui|quel|quelle|quels|quelles)\b",
                r"^(est-ce que|est-ce)",
                r"^(puis-je|peux-tu|peut-on|pourriez-vous|voudriez-vous|avez-vous|\xeates-vous|a-t-on)",
                r"(parlez-moi|d\xe9crivez|expliquez|racontez)",
                r"est-ce\s",
                r"^(que|qu')\s",
                r"^(liste|donne|nomme|d\xe9finis|clarifie|r\xe9sume)\b",
                r"^(quest-ce|qu-est-ce)\b",
            ],
        }

        patterns = patterns_by_lang.get(language, []) + patterns_by_lang["en"]
        for pattern in patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return True

        # Short text: first word is interrogative?
        if word_count <= 3:
            interrogative_words = {
                "en": ["what", "why", "how", "when", "where", "who", "which"],
                "fr": ["quoi", "pourquoi", "comment", "quand", "ou", "qui", "quel", "quelle"],
            }
            words = interrogative_words.get(language, []) + interrogative_words["en"]
            first_word = text_lower.split()[0] if text_lower.split() else ""
            if first_word in words:
                return True

        return False


# Singleton instance
_transcription_service: Optional[TranscriptionService] = None


def get_transcription_service() -> TranscriptionService:
    global _transcription_service
    if _transcription_service is None:
        model_size = os.getenv("WHISPER_MODEL_SIZE", "tiny")
        _transcription_service = TranscriptionService(model_size=model_size)
        # Eagerly load the model so the first WebSocket message isn't slow
        _transcription_service._load_model()
    return _transcription_service
