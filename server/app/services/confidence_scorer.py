"""
Confidence scoring for AI-generated interview answers.

Scoring factors:
1. Keyword match score — how many CV/session keywords appear in the answer
2. Length normalization — penalizes very short or excessively long answers
3. LLM self-eval — optional: ask the model to rate its own answer
"""

import json
import re
from typing import Any, Dict, List, Optional, Tuple


# Default keyword bank for common interview competency themes
DEFAULT_KEYWORDS = {
    "experience", "skill", "project", "team", "lead", "manage",
    "develop", "implement", "design", "build", "create", "solve",
    "result", "achieve", "improve", "optimize", "deliver", "launch",
    "collaborate", "communicate", "analyze", "research", "test",
    "deploy", "integrate", "maintain", "support", "mentor", "train",
    "strategy", "planning", "execution", "quality", "efficiency",
    "customer", "stakeholder", "deadline", "budget", "metric",
    "responsibility", "leadership", "innovation", "growth",
}


def extract_keywords(text: str) -> set:
    """Extract meaningful keywords from text (lowercased, stripped of punctuation)."""
    words = re.findall(r"[a-zA-Z]+(?:'[a-zA-Z]+)?", text.lower())
    # Filter out very short words and common stop words
    stop_words = {
        "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "as", "is", "was", "are", "were", "be",
        "been", "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "shall", "can", "not",
        "no", "nor", "so", "if", "then", "else", "than", "that", "this",
        "these", "those", "it", "its", "my", "your", "his", "her", "our",
        "their", "i", "you", "he", "she", "we", "they", "me", "him", "us",
        "them", "what", "which", "who", "whom", "when", "where", "why",
        "how", "all", "each", "every", "both", "few", "more", "most",
        "some", "any", "none", "one", "two", "other", "another",
    }
    return {w for w in words if len(w) > 2 and w not in stop_words}


def compute_keyword_match_score(
    answer: str,
    question: str,
    cv_keywords: Optional[List[str]] = None,
    context_text: Optional[str] = None,
) -> Tuple[float, Dict[str, Any]]:
    """
    Score how well the answer covers relevant keywords from the question, CV, and context.

    Returns (score 0.0–1.0, details dict).
    """
    details: Dict[str, Any] = {"matched": [], "unmatched": []}
    answer_keywords = extract_keywords(answer)
    if not answer_keywords:
        return 0.0, {"reason": "empty_answer", "matched": [], "unmatched": []}

    # Combine relevant keyword sources
    relevant = set(DEFAULT_KEYWORDS)
    if question:
        relevant |= extract_keywords(question)
    if cv_keywords:
        relevant |= {kw.lower() for kw in cv_keywords}
    if context_text:
        relevant |= extract_keywords(context_text)

    matched = answer_keywords & relevant
    unmatched = relevant - answer_keywords

    details["matched"] = sorted(list(matched))[:20]
    details["unmatched"] = sorted(list(unmatched))[:20]
    details["total_relevant"] = len(relevant)

    if not relevant:
        return 0.5, details  # neutral if no reference keywords

    # Score: ratio of relevant keywords covered
    raw_score = len(matched) / max(len(relevant), 1)
    # Apply diminishing returns — covering 40% of keywords is already good
    score = min(1.0, raw_score * 1.8)
    details["raw_score"] = round(raw_score, 3)
    return round(score, 3), details


def compute_length_score(answer: str) -> Tuple[float, Dict[str, Any]]:
    """
    Score based on answer length. Very short answers (<30 words) score low.
    Ideal range: 50–300 words.
    Very long (>500 words) also penalized slightly.
    """
    words = answer.split()
    word_count = len(words)

    if word_count < 10:
        return 0.1, {"word_count": word_count, "reason": "too_short"}
    if word_count < 30:
        score = 0.3 + 0.5 * (word_count - 10) / 20
        return round(score, 3), {"word_count": word_count}
    if word_count <= 300:
        return 1.0, {"word_count": word_count}
    if word_count <= 500:
        score = 1.0 - 0.3 * (word_count - 300) / 200
        return round(score, 3), {"word_count": word_count}

    return 0.6, {"word_count": word_count, "reason": "too_long"}


def compute_llm_self_eval_score(
    answer: str,
    question: str,
    context_text: Optional[str] = None,
) -> float:
    """
    Optional LLM self-evaluation of answer quality.
    Uses keyword heuristics as a lightweight approximation.
    Returns 0.5 as neutral (this is a placeholder for future LLM eval).
    """
    # Check for key structural elements that indicate quality
    has_specifics = bool(re.search(r"\b\d+\s*(years?|months?|people|projects?|team)s?\b", answer, re.IGNORECASE))
    has_structure = bool(re.search(r"\b(first|second|third|finally|additionally|moreover|specifically|for example)\b", answer, re.IGNORECASE))
    has_action_verb = bool(re.search(r"\b(led|built|created|designed|developed|implemented|managed|delivered|launched|increased|reduced)\b", answer, re.IGNORECASE))

    score = 0.5  # neutral baseline
    if has_specifics:
        score += 0.2
    if has_structure:
        score += 0.15
    if has_action_verb:
        score += 0.15

    return round(min(1.0, score), 3)


def compute_confidence(
    answer: str,
    question: str = "",
    cv_keywords: Optional[List[str]] = None,
    context_text: Optional[str] = None,
    use_llm_eval: bool = True,
) -> Tuple[float, Dict[str, Any]]:
    """
    Compute a comprehensive confidence score for an AI-generated answer.

    Returns (confidence 0.0–1.0, details dict).

    Weights:
    - Keyword match: 40%
    - Length normalization: 25%
    - LLM self-eval (heuristic): 35%

    When use_llm_eval is False (e.g., error responses), LLM weight shifts to length.
    """
    if not answer or answer.startswith("Error:"):
        return 0.0, {"reason": "error_response", "factors": {}}

    kw_score, kw_details = compute_keyword_match_score(answer, question, cv_keywords, context_text)
    len_score, len_details = compute_length_score(answer)

    if use_llm_eval:
        llm_score = compute_llm_self_eval_score(answer, question, context_text)
        weights = {"keyword_match": 0.40, "length": 0.25, "llm_eval": 0.35}
    else:
        llm_score = 0.5
        weights = {"keyword_match": 0.50, "length": 0.50, "llm_eval": 0.0}

    total = (
        kw_score * weights["keyword_match"]
        + len_score * weights["length"]
        + llm_score * weights["llm_eval"]
    )

    details = {
        "keyword_match": {"score": kw_score, **kw_details},
        "length": {"score": len_score, **len_details},
        "llm_eval": {"score": llm_score},
        "weights": weights,
        "raw_total": round(total, 3),
    }

    return round(total, 3), details
