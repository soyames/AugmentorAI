"""
Coding Interview Engine — detects, classifies, and structures coding answers.
Plugs into AugmentorAI's existing WebSocket -> LLM pipeline.
No separate app, no separate flow.
"""
import re
import signal
from typing import Optional, Dict, List, Tuple, Any


class CodingQuestionClassifier:
    """Classifies interview questions into: coding, behavioral, system_design, trivia."""

    CODING_KEYWORDS = [
        "write a function", "implement", "algorithm", "complexity",
        "leetcode", "hackerrank", "codepad", "coderpad",
        "function that", "solve this", "code", "write code",
        "time complexity", "space complexity", "big o",
        "optimize", "recursion", "dynamic programming",
        "binary search", "sort this", "traverse", "tree",
        "graph", "linked list", "reverse", "palindrome",
        "anagram", "two sum", "fibonacci", "factorial",
        "merge", "in-place", "in place",
        "o(n", "o(log", "o(1)", "o(n ",
        "string manipulation", "array of", "hash map",
        "breadth-first", "depth-first", "bfs", "dfs",
        "sliding window", "two pointer", "pointers",
    ]

    SYSTEM_DESIGN_KEYWORDS = [
        "design", "architecture", "system design",
        "how would you build", "how would you design",
        "microservice", "distributed", "scale to",
        "database design", "api design", "high-level design",
        "load balancer", "rate limit", "consistent hashing",
    ]

    BEHAVIORAL_PATTERNS = [
        r"tell me about a time", r"describe a situation",
        r"have you ever", r"give me an example",
        r"how (did|would) you (handle|deal|manage)",
        r"what (was|is) your (biggest|greatest)",
        r"why (should|do) we", r"where do you see yourself",
        r"talk about yourself", r"what are your (strengths|weaknesses)",
        r"tell me about yourself",
        r"why (do|did) you (want|choose|apply)",
        r"describe a (challenge|conflict|difficult)",
    ]

    def classify(self, question: str) -> str:
        """Classify a question into one of four categories."""
        q = question.lower().strip()
        cleaned = re.sub(r'^(can you|could you|please|would you|i need you to)\s+', '', q)

        # Coding keywords
        if any(kw in cleaned for kw in self.CODING_KEYWORDS):
            return "coding"

        if re.search(r'(write|implement|code)\b.*\b(function|method|class|algorithm|solution)', cleaned):
            return "coding"

        # System design
        if any(kw in cleaned for kw in self.SYSTEM_DESIGN_KEYWORDS):
            return "system_design"

        # Behavioral patterns
        for pattern in self.BEHAVIORAL_PATTERNS:
            if re.search(pattern, cleaned):
                return "behavioral"

        return "trivia"

    def is_coding_question(self, question: str) -> bool:
        return self.classify(question) == "coding"


# Role-aware system prompts
CODING_SYSTEM_PROMPT = """You are an expert coding interview assistant helping a candidate in a live interview.

CRITICAL — Format every answer exactly like this:

## Approach
[2-3 sentences explaining the algorithm/strategy]

## Complexity
- Time: O(?)
- Space: O(?)

## Code
```python
[clean, working solution]
```

## Test Cases
- Input: ... -> Output: ...
- Input: ... -> Output: ...

RULES:
- Write working code, not pseudocode
- Explain the approach BEFORE the code
- Always include complexity analysis
- If multiple approaches exist, mention the trade-off briefly"""

BEHAVIORAL_SYSTEM_PROMPT = """You are an expert interview coach. Use the STAR method (Situation, Task, Action, Result) for all behavioral questions.

RULES:
- Base answers on the candidate's actual resume/experience
- Be specific — mention technologies, teams, outcomes
- 2-3 sentences for situation/task, then detailed action and result
- If the resume lacks relevant experience, suggest a general framework the candidate can adapt"""

SYSTEM_DESIGN_SYSTEM_PROMPT = """You are an expert system design interview coach.

Walk through the design systematically:
1. Requirements — functional + non-functional
2. High-level design — components and data flow
3. Deep dive — key components in detail
4. Trade-offs — alternatives and why you chose this approach

RULES:
- Be structured but conversational
- Focus on key decisions
- Mention realistic technologies (databases, caches, queues)
- Always discuss trade-offs"""

TRIVIA_SYSTEM_PROMPT = """You are an expert interview coach. Answer knowledge questions directly and accurately.

Format:
SHORT ANSWER: [1 sentence]
DETAILED: [2-3 sentences with context if available from the candidate's background]

Be concise. If you don't know, say so honestly."""

CODING_USER_TEMPLATE = """Coding Interview Question: "{question}"

Provide the full answer with approach, complexity, code, and test cases.
If the candidate's background context is relevant, reference it.

{context}"""

BEHAVIORAL_USER_TEMPLATE = """Interview question: "{question}"

Using the STAR method, provide a clear answer based on the candidate's actual experience.

Candidate background:
{context}"""

SYSTEM_DESIGN_USER_TEMPLATE = """System Design Question: "{question}"

Walk through the design systematically following the requirements -> high-level -> deep-dive -> trade-offs format.

Context: {context}"""

TRIVIA_USER_TEMPLATE = """Question: "{question}"

Provide SHORT ANSWER and DETAILED sections.

Context: {context}"""


PROMPT_MAP = {
    "coding": (CODING_SYSTEM_PROMPT, CODING_USER_TEMPLATE, 1200),
    "behavioral": (BEHAVIORAL_SYSTEM_PROMPT, BEHAVIORAL_USER_TEMPLATE, 800),
    "system_design": (SYSTEM_DESIGN_SYSTEM_PROMPT, SYSTEM_DESIGN_USER_TEMPLATE, 1000),
    "trivia": (TRIVIA_SYSTEM_PROMPT, TRIVIA_USER_TEMPLATE, 600),
}


def get_prompts_for_type(question_type: str) -> tuple:
    return PROMPT_MAP.get(question_type, PROMPT_MAP["trivia"])


# Lightweight code execution sandbox (Phase 2 foundation)
class CodeSandbox:
    """Sandboxed code execution for verifying solutions."""

    def __init__(self, timeout: int = 10):
        self.timeout = timeout

    def run_python(self, code: str, test_cases: List[Tuple[Any, Any]]) -> List[Dict]:
        """Run Python function against test cases."""
        results = []
        for inp, expected in test_cases:
            result = self._execute(code, inp, expected)
            results.append(result)
        return results

    def _execute(self, code: str, inp: Any, expected: Any) -> dict:
        """Execute one test case with timeout."""
        try:
            exec_globals = {"__builtins__": __builtins__}
            compiled = compile(code.strip(), '<sandbox>', 'exec')
            exec(compiled, exec_globals)

            func = None
            for name, obj in exec_globals.items():
                if callable(obj) and hasattr(obj, '__code__') and not name.startswith('_'):
                    func = obj
                    break

            if func is None:
                return {"passed": False, "error": "No function found in code", "expected": expected, "actual": None}

            class TimeoutError(Exception):
                pass

            def handler(signum, frame):
                raise TimeoutError("Timed out")

            original_handler = signal.signal(signal.SIGALRM, handler)
            signal.alarm(self.timeout)

            try:
                if isinstance(inp, dict):
                    actual = func(**inp)
                elif isinstance(inp, (list, tuple)):
                    actual = func(*inp)
                else:
                    actual = func(inp)

                passed = actual == expected
                return {"passed": passed, "expected": expected, "actual": actual, "error": None}
            except TimeoutError:
                return {"passed": False, "expected": expected, "actual": None, "error": "Timed out"}
            except Exception as e:
                return {"passed": False, "expected": expected, "actual": None, "error": str(e)}
            finally:
                signal.alarm(0)
                signal.signal(signal.SIGALRM, original_handler)

        except SyntaxError as e:
            return {"passed": False, "expected": expected, "actual": None, "error": f"SyntaxError: {e.msg}"}
        except Exception as e:
            return {"passed": False, "expected": expected, "actual": None, "error": str(e)}

    def analyze_complexity(self, code: str) -> dict:
        """Static complexity hint (heuristic)."""
        lines = code.split('\n')
        code_lines = [l for l in lines if l.strip() and not l.strip().startswith('#')]

        loop_count = 0
        nested_loops = 0
        current_indent = 0
        in_loop = False

        for line in code_lines:
            stripped = line.lstrip()
            indent = (len(line) - len(stripped)) // 4
            is_loop = any(k in stripped for k in ['for ', 'while '])

            if is_loop:
                loop_count += 1
                if indent > current_indent and in_loop:
                    nested_loops += 1
                current_indent = indent
                in_loop = True
            else:
                if indent <= current_indent and in_loop:
                    in_loop = False

        has_recursion = False
        func_body = '\n'.join(code_lines)
        func_match = re.search(r'def\s+(\w+)\(', code)
        if func_match:
            func_name = func_match.group(1)
            if func_name in func_body[func_body.index(func_name) + len(func_name):]:
                has_recursion = True

        has_sort = 'sort(' in code or 'sorted(' in code
        has_dict = any(k in code for k in ['{}', 'dict(', 'defaultdict', 'Counter'])
        has_set = 'set(' in code

        if has_sort and nested_loops > 0:
            complexity = "O(n log n)" if nested_loops == 1 else "O(n² log n)"
        elif has_sort:
            complexity = "O(n log n)"
        elif nested_loops > 1:
            complexity = f"O(n^{nested_loops + 1})"
        elif nested_loops == 1:
            complexity = "O(n²)"
        elif loop_count == 1:
            complexity = "O(n)"
        elif loop_count == 0 and has_recursion:
            complexity = "O(2^n)"
        elif loop_count == 0:
            complexity = "O(1)"
        else:
            complexity = "O(n)"

        space = "O(n)" if (has_dict or has_set or 'list(' in code or '[' in code or 'array' in code) else "O(1)"

        return {
            "time": complexity,
            "space": space,
            "loops": loop_count,
            "nested_loops": nested_loops,
            "has_recursion": has_recursion,
        }


_classifier: Optional[CodingQuestionClassifier] = None
_sandbox: Optional[CodeSandbox] = None


def get_classifier() -> CodingQuestionClassifier:
    global _classifier
    if _classifier is None:
        _classifier = CodingQuestionClassifier()
    return _classifier


def get_sandbox() -> CodeSandbox:
    global _sandbox
    if _sandbox is None:
        _sandbox = CodeSandbox()
    return _sandbox
