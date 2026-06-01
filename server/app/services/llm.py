"""
LLM service for answer generation using Ollama
"""
import httpx
from typing import Optional, List, Dict
import json


class OllamaService:
    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=60.0)

    async def generate(
        self,
        prompt: str,
        model: str = "llama3.1",
        system_prompt: Optional[str] = None,
        max_tokens: int = 500,
        temperature: float = 0.7,
    ) -> str:
        """
        Generate a response using Ollama.

        Args:
            prompt: The user prompt
            model: Model name
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature

        Returns:
            Generated text
        """
        try:
            messages = []

            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})

            messages.append({"role": "user", "content": prompt})

            response = await self.client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "num_predict": max_tokens,
                        "temperature": temperature,
                    },
                },
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("message", {}).get("content", "")
            else:
                return f"Error: {response.status_code}"

        except httpx.ConnectError:
            return "Error: Could not connect to Ollama. Make sure Ollama is running."
        except Exception as e:
            return f"Error: {str(e)}"

    async def generate_interview_answer(
        self,
        question: str,
        context: Dict[str, str],
        language: str = "en",
        model: str = "llama3.1",
    ) -> Dict[str, str]:
        """
        Generate an interview answer with context.

        Args:
            question: The interview question
            context: Dict with keys like 'resume', 'job_description', 'notes'
            language: Response language
            model: Model name

        Returns:
            Dict with 'short', 'detailed', and 'points' keys
        """
        system_prompt = f"""You are an interview practice assistant helping a candidate prepare answers.

Use the provided context (resume, job description, notes) when relevant.
If important information is missing from the context, acknowledge it gracefully.
Generate professional, natural-sounding responses suitable for an interview.
For behavioral questions, use the STAR method (Situation, Task, Action, Result).

Respond in: {language}

Context provided:
Resume: {context.get('resume', 'Not provided')}
Job Description: {context.get('job_description', 'Not provided')}
Notes: {context.get('notes', 'Not provided')}"""

        prompt = f"""Question: {question}

Please provide:
1. A SHORT answer (2-3 sentences, good for quick response)
2. A DETAILED answer (comprehensive, includes examples)
3. 3 KEY POINTS to remember

Format your response as:
SHORT: [answer]
DETAILED: [answer]
POINTS:
- [point 1]
- [point 2]
- [point 3]"""

        response = await self.generate(
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            max_tokens=800,
            temperature=0.7,
        )

        # Parse response
        result = {
            "short": "",
            "detailed": "",
            "points": [],
        }

        try:
            lines = response.split("\n")
            current_section = None

            for line in lines:
                line = line.strip()
                if line.startswith("SHORT:"):
                    current_section = "short"
                    result["short"] = line.replace("SHORT:", "").strip()
                elif line.startswith("DETAILED:"):
                    current_section = "detailed"
                    result["detailed"] = line.replace("DETAILED:", "").strip()
                elif line.startswith("POINTS:"):
                    current_section = "points"
                elif line.startswith("-") and current_section == "points":
                    result["points"].append(line[1:].strip())
                elif current_section == "short":
                    result["short"] += " " + line
                elif current_section == "detailed":
                    result["detailed"] += " " + line

        except Exception as e:
            # Fallback: use entire response as detailed answer
            result["detailed"] = response
            result["short"] = response[:200] + "..." if len(response) > 200 else response

        return result

    async def list_models(self) -> List[str]:
        """List available Ollama models."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            if response.status_code == 200:
                data = response.json()
                return [model["name"] for model in data.get("models", [])]
            return []
        except Exception:
            return []

    async def check_connection(self) -> bool:
        """Check if Ollama is available."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            return response.status_code == 200
        except Exception:
            return False


# Singleton instance
_ollama_service: Optional[OllamaService] = None


def get_ollama_service(base_url: str = "http://localhost:11434") -> OllamaService:
    global _ollama_service
    if _ollama_service is None or _ollama_service.base_url != base_url:
        _ollama_service = OllamaService(base_url)
    return _ollama_service
