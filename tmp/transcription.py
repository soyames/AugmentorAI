# Encode the fixed file
$content = @"
"""
Transcription service using faster-whisper
"""
import os
import traceback
from typing import Optional, Tuple
import numpy as np
import re

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
        try:
            self.model = WhisperModel(
                self.model_size, device=self.device,
                compute_type="int8" if self.device == "cpu" else "float16",
            )
        except Exception as e:
            print(f"Failed to load Whisper model: {e}")
            traceback.print_exc()
            self.model = None

    def transcribe(self, audio_data: bytes, language: Optional[str] = None) -> Tuple[str, str, float]:
        if not WHISPER_AVAILABLE or self.model is None:
            if WHISPER_AVAILABLE:
                self._load_model()
            if self.model is None:
                return "Whisper not available.", "en", 0.0
        try:
            audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32) / 32768.0
            # Skip near-silence
            rms = np.sqrt(np.mean(audio_array ** 2))
            if rms < 0.005:
                return "", "en", 0.0
            segments, info = self.model.transcribe(
                audio_array, language=language, beam_size=5, vad_filter=True,
            )
            text = " ".join(segment.text for segment in segments)
            return text.strip(), info.language, info.language_probability
        except Exception as e:
            print(f"Transcription error: {e}")
            traceback.print_exc()
            return "", "en", 0.0

    def detect_question(self, text: str, language: str = "en") -> bool:
        if not text or not text.strip():
            return False
        text_stripped = text.strip()
        text_lower = text_stripped.lower()
        if "?" in text_stripped or "?" in text_stripped:
            return True
        word_count = len(text_stripped.split())
        question_patterns = {
            "en": [
                r"^(what|why|how|when|where|who|which)\b",
                r"^(can|could|would|do|did|does|are|is|have|has|will|shall|may|might)\s+(you|we|they|i|he|she|it|this|that|there|anyone)",
                r"^(tell me|describe|explain|walk me through|talk about|discuss|elaborate)",
                r"^(have you|did you|will you|are you|do you|could you|would you|can you)",
                r"^(is there|are there|is it|are they|was it|were they)",
                r"what('s| is) (your|the|a)",
                r"how (do|does|would|could|can|about)",
                r"^(list|name|give|define|clarify|summarize)\b",
            ],
            "fr": [
                r"^(qu'est-ce|quoi|pourquoi|comment|quand|ou|qui|quel|quelle|quels|quelles)\b",
                r"^(est-ce que|est-ce)",
                r"^(puis-je|peux-tu|peut-on|pourriez-vous|voudriez-vous|avez-vous|etes-vous|a-t-on)",
                r"(parlez-moi|decrivez|expliquez|racontez)",
                r"est-ce\s",
                r"^(que|qu')\s",
                r"^[a-z].*\-?vous\s",
                r"^[a-z].*\-?t-?[a-z]{2}\s",
                r"^(liste|donne|nomme|definis|clarifie|resume)\b",
                r"^(quest-ce|qu-est-ce)\b",
            ],
        }
        patterns = question_patterns.get(language, []) + question_patterns["en"]
        for pattern in patterns:
            if re.search(pattern, text_lower, re.IGNORECASE):
                return True
        if word_count <= 3:
            interrogative = {"en": ["what","why","how","when","where","who","which","whom","whose"], "fr": ["quoi","pourquoi","comment","quand","ou","qui","quel","quelle"]}
            words = interrogative.get(language, []) + interrogative["en"]
            first_word = text_lower.split()[0] if text_lower.split() else ""
            if first_word in words:
                return True
        if word_count > 25:
            return False
        return False

_transcription_service: Optional[TranscriptionService] = None

def get_transcription_service() -> TranscriptionService:
    global _transcription_service
    if _transcription_service is None:
        _transcription_service = TranscriptionService()
    return _transcription_service
"@ | Set-Content "$env:TEMP\transcription_fixed.py" -Encoding utf8

