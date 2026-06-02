"""
Unit tests for the confidence scoring module.
"""
import json
import sys
from pathlib import Path

# Ensure the project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.confidence_scorer import (
    extract_keywords,
    compute_keyword_match_score,
    compute_length_score,
    compute_llm_self_eval_score,
    compute_confidence,
)


def test_extract_keywords():
    """Basic keyword extraction works."""
    words = extract_keywords("I led a team of 5 developers to build a microservices platform")
    assert "led" in words
    assert "team" in words
    assert "developers" in words
    assert "build" in words
    assert "microservices" in words
    assert "platform" in words
    # Stop words should be filtered
    assert "a" not in words
    assert "of" not in words
    assert "to" not in words


def test_keyword_match_high():
    """Good keyword coverage gives high score."""
    answer = "I led a team of developers to build and deliver the platform, managing the project from start to finish."
    question = "Describe your experience leading development teams."
    score, details = compute_keyword_match_score(answer, question)
    assert score >= 0.1, f"Expected some score, got {score}"
    assert "matched" in details
    assert len(details["matched"]) > 0


def test_keyword_match_low():
    """Irrelevant answer gives low score."""
    answer = "The weather is nice today and I like coffee."
    question = "Describe your experience leading development teams."
    score, details = compute_keyword_match_score(answer, question)
    assert score < 0.05, f"Expected very low score, got {score}"


def test_empty_answer_keyword_match():
    """Empty answer returns 0 score."""
    score, details = compute_keyword_match_score("", "question here")
    assert score == 0.0
    assert details.get("reason") == "empty_answer"


def test_length_score_ideal():
    """50–300 word answers get full marks."""
    answer = "word " * 100
    score, details = compute_length_score(answer)
    assert score == 1.0
    assert details["word_count"] == 100


def test_length_score_too_short():
    """Very short answers are penalized."""
    score, details = compute_length_score("I led a team.")
    assert score < 0.5
    assert details["word_count"] == 4


def test_length_score_too_long():
    """Excessively long answers are slightly penalized."""
    answer = "word " * 600
    score, details = compute_length_score(answer)
    assert score < 0.8
    assert details["word_count"] == 600


def test_llm_self_eval_with_specifics():
    """Answers with numbers, structure, and action verbs score higher."""
    answer = (
        "I led a team of 12 developers for 3 years. First, we built the microservices architecture. "
        "Specifically, I designed the API gateway and increased deployment frequency by 40%. "
        "Finally, we reduced error rates by implementing automated testing."
    )
    score = compute_llm_self_eval_score(answer, "Describe your leadership experience.")
    assert score >= 0.7, f"Expected high self-eval, got {score}"


def test_llm_self_eval_vague():
    """Vague answers get neutral or lower score."""
    answer = "I think I did some work on some projects with some people."
    score = compute_llm_self_eval_score(answer, "What did you work on?")
    assert score <= 0.6, f"Expected neutral/low, got {score}"


def test_confidence_high_quality():
    """Comprehensive answer gets high overall confidence."""
    answer = (
        "I led a team of 8 developers to build a customer-facing analytics platform. "
        "Over 2 years, we designed the system architecture, implemented real-time data processing, "
        "and integrated with 5 external APIs. I specifically managed sprint planning, code reviews, "
        "and stakeholder communication. The platform handled 1M+ daily requests with 99.9% uptime."
    )
    question = "Describe your experience leading development teams."
    score, details = compute_confidence(answer, question)
    assert score >= 0.5, f"Expected decent confidence, got {score}"
    assert "keyword_match" in details
    assert "length" in details
    assert "llm_eval" in details
    assert details["weights"]["keyword_match"] == 0.40


def test_confidence_error_answer():
    """Error responses get zero confidence."""
    score, details = compute_confidence("Error: all AI providers failed", "question")
    assert score == 0.0
    assert details.get("reason") == "error_response"


def test_confidence_empty_answer():
    """Empty answers get zero confidence."""
    score, details = compute_confidence("", "question")
    assert score == 0.0
    assert details.get("reason") == "error_response"


def test_confidence_no_llm_eval():
    """When use_llm_eval=False, weights shift to keyword + length."""
    answer = "I built a platform with my team over 2 years."
    score, details = compute_confidence(answer, "question", use_llm_eval=False)
    assert details["weights"]["llm_eval"] == 0.0
    assert details["weights"]["keyword_match"] == 0.50
    assert details["weights"]["length"] == 0.50


if __name__ == "__main__":
    # Run all tests and report
    tests = [
        test_extract_keywords,
        test_keyword_match_high,
        test_keyword_match_low,
        test_empty_answer_keyword_match,
        test_length_score_ideal,
        test_length_score_too_short,
        test_length_score_too_long,
        test_llm_self_eval_with_specifics,
        test_llm_self_eval_vague,
        test_confidence_high_quality,
        test_confidence_error_answer,
        test_confidence_empty_answer,
        test_confidence_no_llm_eval,
    ]

    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            print(f"  ✅ {test_fn.__name__}")
            passed += 1
        except AssertionError as e:
            print(f"  ❌ {test_fn.__name__}: {e}")
            failed += 1
        except Exception as e:
            print(f"  ❌ {test_fn.__name__}: {type(e).__name__}: {e}")
            failed += 1

    print(f"\n{'='*40}")
    print(f"Results: {passed} passed, {failed} failed")
    sys.exit(0 if failed == 0 else 1)
