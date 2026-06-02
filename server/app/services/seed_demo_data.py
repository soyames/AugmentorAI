#!/usr/bin/env python3
"""Seed demo data for the AugmentorAI analytics dashboard.

Creates realistic interview sessions with transcript chunks, AI answers,
and proper provider/latency/confidence data across multiple providers.
Run: uv run python3 -m app.services.seed_demo_data
"""
import json
import random
import uuid
from datetime import datetime, timedelta, timezone

from app.models.database import SessionLocal, Session, TranscriptChunk, AnswerSuggestion, run_migrations

# Realistic interview Q&A pairs by role
INTERVIEWS = [
    {
        "title": "Senior Python Backend Interview",
        "mode": "interview",
        "language": "en",
        "duration_minutes": 45,
        "qa": [
            ("Tell me about your experience with Python async frameworks.", "I've been working with FastAPI and async Python for about 3 years now. I built a high-throughput API handling 10k requests per second using asyncio and SQLAlchemy async sessions. We used connection pooling and Redis caching to achieve sub-50ms response times.", "Gemini", 0.85, 3200),
            ("How do you handle database migrations in production?", "We use Alembic with a CI/CD pipeline. Migrations are version-controlled and reviewed like any code change. For zero-downtime, we batch migrations in phases — schema changes first, then data backfills, then application rollouts.", "Gemini", 0.92, 4800),
            ("Explain your experience with Docker and container orchestration.", "I've been using Docker since 2018 and Kubernetes since 2020. I designed a microservices architecture with 12 services running on GKE, using Helm charts for deployment and Prometheus for monitoring. We achieved 99.95% uptime.", "DeepSeek", 0.78, 5600),
            ("How do you approach testing in a microservices architecture?", "We follow a testing pyramid approach with unit tests, integration tests with testcontainers, and end-to-end tests running in a staging environment. Each service maintains >85% code coverage. We also use contract testing with Pact to catch API breaking changes.", "DeepSeek", 0.88, 4100),
            ("What's your experience with SQL and database optimization?", "I've worked extensively with PostgreSQL — query optimization with EXPLAIN ANALYZE, indexing strategies, partition pruning. I optimized a slow reporting query from 30 seconds to 200ms by adding composite indexes and rewriting the JOIN order.", "Gemini", 0.95, 2900),
        ]
    },
    {
        "title": "Full Stack Developer Screening",
        "mode": "interview",
        "language": "en",
        "duration_minutes": 30,
        "qa": [
            ("Describe your tech stack and why you chose it.", "I primarily work with React on the frontend with TypeScript, Node.js/Express on the backend, and PostgreSQL. I chose this stack because of its strong typing, excellent package ecosystem, and broad community support. For state management, I use Zustand over Redux for simplicity.", "Gemini", 0.82, 3500),
            ("How do you handle state management in React?", "I prefer Zustand for most applications due to its minimal boilerplate. For complex apps, I use a combination of Zustand for global state and React Query for server state. This avoids the complexity of Redux while maintaining performance through selective re-rendering.", "DeepSeek", 0.76, 4200),
            ("Explain a challenging bug you fixed recently.", "We had a memory leak in a real-time dashboard component. It turned out to be an unmounted component that wasn't cleaning up WebSocket listeners. I implemented proper cleanup in useEffect return and added an AbortController pattern for all async operations. Memory dropped from 300MB to 80MB.", "Ollama (local)", 0.65, 3800),
        ]
    },
    {
        "title": "Data Science Technical Interview",
        "mode": "interview",
        "language": "en",
        "duration_minutes": 60,
        "qa": [
            ("Explain your experience with machine learning pipelines.", "I've built end-to-end ML pipelines using scikit-learn and XGBoost. One project involved a recommendation system that processed 5M user events daily, using TF-IDF for feature extraction and gradient boosting for ranking. A/B testing showed a 23% improvement in engagement.", "Gemini", 0.9, 5200),
            ("How do you handle imbalanced datasets?", "I use a combination of SMOTE for oversampling and class weights in the loss function. For one fraud detection project with only 0.1% positive cases, I also implemented anomaly detection as a first pass and then applied XGBoost with scale_pos_weight tuning. Final recall was 87% with 92% precision.", "DeepSeek", 0.88, 6100),
            ("Describe your approach to feature engineering.", "I start with domain expert interviews to identify meaningful signals. Then I use automated featuretools for candidate generation, followed by SHAP analysis for feature importance. I always validate features on out-of-time samples and monitor drift in production.", "Gemini", 0.93, 4400),
            ("Walk me through a time you productionized a model.", "I deployed a churn prediction model using FastAPI with ONNX runtime for inference. The initial model had 500ms latency which wasn't acceptable. I quantized to INT8, added Redis caching for frequent predictions, and implemented batch inference. Final p99 latency was 45ms serving 10k requests/minute.", "DeepSeek", 0.81, 5800),
        ]
    },
    {
        "title": "Frontend Engineer Practice",
        "mode": "practice",
        "language": "en",
        "duration_minutes": 25,
        "qa": [
            ("How do you ensure your React app is accessible?", "I follow WCAG 2.1 AA guidelines. I use semantic HTML, ensure proper aria labels, test with screen readers, and maintain a minimum 4.5:1 contrast ratio. We added axe-core to our CI pipeline to catch accessibility regressions automatically.", "Gemini", 0.87, 3100),
            ("What's your approach to CSS architecture?", "I use Tailwind CSS for rapid prototyping and CSS modules for component-specific styles. For the design system, we have a shared tokens file with colors, spacing, and typography. This ensures consistency while keeping the bundle size small.", "Ollama (local)", 0.58, 2700),
        ]
    },
    {
        "title": "Entretien DevOps (FR)",
        "mode": "interview",
        "language": "fr",
        "duration_minutes": 40,
        "qa": [
            ("Parlez-moi de votre expérience avec CI/CD.", "J'ai mis en place des pipelines CI/CD avec GitHub Actions et GitLab CI. Chaque pipeline comprend linting, tests unitaires, tests d'intégration, build et déploiement progressif vers production avec blue-green deployment. Le temps moyen de déploiement est de 15 minutes.", "DeepSeek", 0.79, 4900),
            ("Comment gérez-vous la sécurité des conteneurs?", "Nous utilisons Trivy pour scanner les images Docker dans le pipeline CI. Les images sont signées avec Cosign. En production, nous avons des politiques réseau Kubernetes pour restreindre la communication entre pods et un WAF pour les endpoints exposés.", "DeepSeek", 0.84, 5300),
        ]
    },
]


def seed_demo_data():
    run_migrations()
    db = SessionLocal()

    existing = db.query(Session).count()
    if existing > 0:
        print(f"Database already has {existing} sessions — skipping seed.")
        db.close()
        return

    base_time = datetime.now(timezone.utc) - timedelta(days=30)

    for idx, interview in enumerate(INTERVIEWS):
        created_at = base_time + timedelta(days=idx * 3, hours=random.randint(8, 17))
        session = Session(
            id=str(uuid.uuid4()),
            title=interview["title"],
            mode=interview["mode"],
            language=interview["language"],
            status="completed",
            ai_usage=len(interview["qa"]),
        )
        # Override created_at to spread over 30 days
        session.created_at = created_at
        session.updated_at = created_at + timedelta(minutes=interview["duration_minutes"])
        db.add(session)
        db.flush()

        for q_idx, (question, answer, provider, confidence, latency_ms) in enumerate(interview["qa"]):
            chunk_time = created_at + timedelta(minutes=q_idx * 5)
            chunk = TranscriptChunk(
                id=str(uuid.uuid4()),
                session_id=session.id,
                speaker="interviewer",
                text=question,
                language=interview["language"],
                is_question=True,
            )
            chunk.created_at = chunk_time
            db.add(chunk)
            db.flush()

            # Generate confidence details
            kw_score = confidence + random.uniform(-0.1, 0.05)
            len_score = confidence + random.uniform(-0.05, 0.1)
            llm_score = confidence + random.uniform(-0.08, 0.08)
            conf_details = {
                "keyword_match": round(max(0, min(1, kw_score)), 3),
                "length": round(max(0, min(1, len_score)), 3),
                "llm_eval": round(max(0, min(1, llm_score)), 3),
                "weights": {"keyword_match": 0.40, "length": 0.25, "llm_eval": 0.35},
                "raw_total": round(max(0, min(1, confidence + random.uniform(-0.05, 0.05))), 3),
            }

            ans_time = chunk_time + timedelta(seconds=random.randint(5, 30))
            answer_sugg = AnswerSuggestion(
                id=str(uuid.uuid4()),
                session_id=session.id,
                transcript_chunk_id=chunk.id,
                question=question,
                answer_text=answer,
                confidence=confidence,
                confidence_score=confidence,
                confidence_details=json.dumps(conf_details),
                language=interview["language"],
                provider=provider,
                latency_ms=latency_ms,
                is_fallback=provider in ("Ollama", "Ollama (local)"),
                tokens_used=len(answer.split()),
                sources=json.dumps([
                    "Resume document: experience section",
                    "Job description: requirements",
                    f"Knowledge base: {provider} best practices",
                ]),
            )
            answer_sugg.created_at = ans_time
            db.add(answer_sugg)

        print(f"  ✓ Created: {interview['title']} ({len(interview['qa'])} Q&A pairs)")

    db.commit()
    db.close()

    total_sessions = len(INTERVIEWS)
    total_qa = sum(len(i["qa"]) for i in INTERVIEWS)
    print(f"\n✅ Seeded {total_sessions} sessions with {total_qa} Q&A pairs across 30 days.")
    print(f"   Providers: Gemini, DeepSeek, Ollama (local)")
    print(f"   Languages: en ({total_sessions - 1}), fr (1)")


if __name__ == "__main__":
    seed_demo_data()
