"""LLM service with OpenAI, Anthropic, Gemini, DeepSeek, Hermes, Ollama + preferred_provider routing."""
import json, os
from typing import Optional, List, Dict, Tuple, AsyncGenerator, Callable
import httpx
from dotenv import load_dotenv
load_dotenv()

ENV_GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_BASE_URL = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
ENV_DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://augmentorai-ollama-1:11434")
HERMES_API_URL = os.getenv("HERMES_API_URL", "http://127.0.0.1:8642")
HERMES_MODEL = os.getenv("HERMES_MODEL", "deepseek-chat")
HERMES_API_KEY = os.getenv("HERMES_API_KEY", "")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "qwen2.5-coder:3b")
LLMSettings = Optional[Dict[str, str]]

class ProviderError(RuntimeError):
    def __init__(self, provider: str, message: str):
        super().__init__(message)
        self.provider = provider

class LLMService:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=120.0)
        self._last_provider: Optional[str] = None

    def _config(self, settings: LLMSettings = None) -> Dict[str, str]:
        s = settings or {}
        return {
            "gemini_api_key": s.get("gemini_api_key") or ENV_GEMINI_API_KEY,
            "gemini_base_url": s.get("gemini_base_url") or GEMINI_BASE_URL,
            "gemini_model": s.get("gemini_model") or GEMINI_MODEL,
            "deepseek_api_key": s.get("deepseek_api_key") or ENV_DEEPSEEK_API_KEY,
            "deepseek_base_url": s.get("deepseek_base_url") or DEEPSEEK_BASE_URL,
            "deepseek_model": s.get("deepseek_model") or DEEPSEEK_MODEL,
            "ollama_url": s.get("ollama_url") or OLLAMA_URL,
            "hermes_api_url": s.get("hermes_api_url") or HERMES_API_URL,
            "hermes_model": s.get("hermes_model") or HERMES_MODEL,
            "hermes_api_key": s.get("hermes_api_key") or HERMES_API_KEY,
            "openai_api_key": s.get("openai_api_key") or "",
            "openai_model": s.get("openai_model") or "gpt-4o",
            "anthropic_api_key": s.get("anthropic_api_key") or "",
            "anthropic_model": s.get("anthropic_model") or "claude-sonnet-4-20250514",
        }

    async def _raise_for_provider(self, provider: str, response: httpx.Response) -> None:
        preview = response.text.strip()[:300]
        raise ProviderError(provider, f"{provider} request failed with HTTP {response.status_code}: {preview or response.reason_phrase}")

    # ── Non-streaming ──

    async def _call_openai(self, messages, api_key, model, max_tokens=800, temperature=0.7, base_url=None):
        if not api_key: raise ProviderError("OpenAI", "No OpenAI API key configured")
        url = f"{base_url or 'https://api.openai.com/v1'}/chat/completions"
        r = await self.client.post(url, headers={"Authorization": f"Bearer {api_key}"},
            json={"model":model, "messages":messages, "max_tokens":max_tokens, "temperature":temperature})
        if r.status_code >= 400: await self._raise_for_provider("OpenAI", r)
        choices = r.json().get("choices",[])
        if not choices: raise ProviderError("OpenAI","OpenAI returned no choices")
        text = choices[0].get("message",{}).get("content","").strip()
        if not text: raise ProviderError("OpenAI","OpenAI returned an empty response")
        return text

    async def _call_anthropic(self, messages, api_key, model, max_tokens=800, temperature=0.7):
        if not api_key: raise ProviderError("Anthropic","No Anthropic API key configured")
        sp, am = "", []
        for m in messages:
            if m.get("role")=="system": sp += (m.get("content") or "") + "\n"
            else: am.append({"role":m.get("role"),"content":m.get("content","")})
        payload = {"model":model,"max_tokens":max_tokens,"temperature":temperature,"messages":am}
        if sp.strip(): payload["system"] = sp.strip()
        r = await self.client.post("https://api.anthropic.com/v1/messages",
            headers={"x-api-key":api_key,"anthropic-version":"2023-06-01","Content-Type":"application/json"}, json=payload)
        if r.status_code>=400: await self._raise_for_provider("Anthropic", r)
        blocks = r.json().get("content",[])
        text = "".join(b.get("text","") for b in blocks if b.get("type")=="text").strip()
        if not text: raise ProviderError("Anthropic","Anthropic returned an empty response")
        return text

    async def _call_gemini(self, messages, api_key, base_url, model, max_tokens=800, temperature=0.7):
        if not api_key: raise ProviderError("Gemini","No Gemini API key configured")
        sp, contents = "", []
        for m in messages:
            role = m.get("role","user"); content = (m.get("content") or "").strip()
            if not content: continue
            if role=="system": sp = content if not sp else f"{sp}\n\n{content}"; continue
            contents.append({"role":"model" if role=="assistant" else "user","parts":[{"text":content}]})
        payload = {"contents":contents,"generationConfig":{"temperature":temperature,"maxOutputTokens":max_tokens}}
        if sp: payload["systemInstruction"] = {"parts":[{"text":sp}]}
        r = await self.client.post(f"{base_url}/models/{model}:generateContent", params={"key":api_key}, json=payload)
        if r.status_code>=400: await self._raise_for_provider("Gemini", r)
        candidates = r.json().get("candidates",[])
        if not candidates: raise ProviderError("Gemini","Gemini returned no candidates")
        text = "".join(p.get("text","") for p in candidates[0].get("content",{}).get("parts",[])).strip()
        if not text: raise ProviderError("Gemini","Gemini returned an empty response")
        return text

    async def _call_deepseek(self, messages, api_key, base_url, model, max_tokens=800, temperature=0.7):
        if not api_key: raise ProviderError("DeepSeek","No DeepSeek API key configured")
        r = await self.client.post(f"{base_url}/chat/completions",
            headers={"Authorization":f"Bearer {api_key}"},
            json={"model":model,"messages":messages,"max_tokens":max_tokens,"temperature":temperature})
        if r.status_code>=400: await self._raise_for_provider("DeepSeek", r)
        choices = r.json().get("choices",[])
        if not choices: raise ProviderError("DeepSeek","DeepSeek returned no choices")
        text = choices[0].get("message",{}).get("content","").strip()
        if not text: raise ProviderError("DeepSeek","DeepSeek returned an empty response")
        return text

    async def _call_ollama(self, messages, base_url, model, max_tokens=800, temperature=0.7):
        r = await self.client.post(f"{base_url}/api/chat",
            json={"model":model,"messages":messages,"stream":False,
                  "options":{"num_predict":max_tokens,"temperature":temperature}})
        if r.status_code>=400: await self._raise_for_provider("Ollama", r)
        text = r.json().get("message",{}).get("content","").strip()
        if not text: raise ProviderError("Ollama","Ollama returned an empty response")
        return text

    async def _call_hermes(self, messages, api_url, model, api_key="", max_tokens=800, temperature=0.7):
        headers = {"Content-Type":"application/json"}
        if api_key: headers["Authorization"] = f"Bearer {api_key}"
        r = await self.client.post(f"{api_url}/v1/chat/completions", headers=headers,
            json={"model":model,"messages":messages,"max_tokens":max_tokens,"temperature":temperature})
        if r.status_code>=400: await self._raise_for_provider("Hermes", r)
        choices = r.json().get("choices",[])
        if not choices: raise ProviderError("Hermes","Hermes returned no choices")
        text = choices[0].get("message",{}).get("content","").strip()
        if not text: raise ProviderError("Hermes","Hermes returned an empty response")
        return text

    # ── Streaming ──

    async def _stream_openai(self, messages, api_key, model, max_tokens=800, temperature=0.7, base_url=None):
        if not api_key: raise ProviderError("OpenAI","No OpenAI API key configured")
        url = f"{base_url or 'https://api.openai.com/v1'}/chat/completions"
        async with httpx.AsyncClient(timeout=120.0) as c:
            async with c.stream("POST", url,
                headers={"Authorization":f"Bearer {api_key}","Accept":"text/event-stream"},
                json={"model":model,"messages":messages,"max_tokens":max_tokens,"temperature":temperature,"stream":True}) as resp:
                if resp.status_code>=400: preview = await resp.aread(); raise ProviderError("OpenAI",f"HTTP {resp.status_code}: {preview[:200]}")
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        p = line[6:].strip()
                        if p=="[DONE]": break
                        try:
                            d=json.loads(p).get("choices",[{}])[0].get("delta",{})
                            t=d.get("content","")
                            if t: yield t
                        except json.JSONDecodeError: continue

    async def _stream_anthropic(self, messages, api_key, model, max_tokens=800, temperature=0.7):
        if not api_key: raise ProviderError("Anthropic","No Anthropic API key configured")
        sp, am = "", []
        for m in messages:
            if m.get("role")=="system": sp += (m.get("content") or "") + "\n"
            else: am.append({"role":m.get("role"),"content":m.get("content","")})
        payload = {"model":model,"max_tokens":max_tokens,"temperature":temperature,"stream":True,"messages":am}
        if sp.strip(): payload["system"] = sp.strip()
        async with httpx.AsyncClient(timeout=120.0) as c:
            async with c.stream("POST","https://api.anthropic.com/v1/messages",
                headers={"x-api-key":api_key,"anthropic-version":"2023-06-01","Content-Type":"application/json"},json=payload) as resp:
                if resp.status_code>=400: preview = await resp.aread(); raise ProviderError("Anthropic",f"HTTP {resp.status_code}: {preview[:200]}")
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            evt = json.loads(line[6:].strip())
                            if evt.get("type")=="content_block_delta":
                                t=evt.get("delta",{}).get("text","")
                                if t: yield t
                        except json.JSONDecodeError: continue

    async def _stream_deepseek(self, messages, api_key, base_url, model, max_tokens=800, temperature=0.7):
        if not api_key: raise ProviderError("DeepSeek","No DeepSeek API key configured")
        async with httpx.AsyncClient(timeout=120.0) as c:
            async with c.stream("POST",f"{base_url}/chat/completions",
                headers={"Authorization":f"Bearer {api_key}","Accept":"text/event-stream"},
                json={"model":model,"messages":messages,"max_tokens":max_tokens,"temperature":temperature,"stream":True}) as resp:
                if resp.status_code>=400: preview=await resp.aread(); raise ProviderError("DeepSeek",f"HTTP {resp.status_code}: {preview[:200]}")
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        p=line[6:].strip()
                        if p=="[DONE]": break
                        try:
                            d=json.loads(p).get("choices",[{}])[0].get("delta",{}); t=d.get("content","")
                            if t: yield t
                        except json.JSONDecodeError: continue

    async def _stream_ollama(self, messages, base_url, model, max_tokens=800, temperature=0.7):
        async with httpx.AsyncClient(timeout=120.0) as c:
            async with c.stream("POST",f"{base_url}/api/chat",
                json={"model":model,"messages":messages,"stream":True,
                      "options":{"num_predict":max_tokens,"temperature":temperature}}) as resp:
                if resp.status_code>=400: preview=await resp.aread(); raise ProviderError("Ollama",f"HTTP {resp.status_code}: {preview[:200]}")
                async for line in resp.aiter_lines():
                    if not line.strip(): continue
                    try:
                        chunk=json.loads(line); t=chunk.get("message",{}).get("content","")
                        if t: yield t
                        if chunk.get("done",False): break
                    except json.JSONDecodeError: continue

    async def _stream_hermes(self, messages, api_url, model, api_key="", max_tokens=800, temperature=0.7):
        headers = {"Content-Type":"application/json","Accept":"text/event-stream"}
        if api_key: headers["Authorization"]=f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=120.0) as c:
            async with c.stream("POST",f"{api_url}/v1/chat/completions", headers=headers,
                json={"model":model,"messages":messages,"max_tokens":max_tokens,"temperature":temperature,"stream":True}) as resp:
                if resp.status_code>=400: preview=await resp.aread(); raise ProviderError("Hermes",f"HTTP {resp.status_code}: {preview[:200]}")
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        p=line[6:].strip()
                        if p=="[DONE]": break
                        try:
                            d=json.loads(p).get("choices",[{}])[0].get("delta",{}); t=d.get("content","")
                            if t: yield t
                        except json.JSONDecodeError: continue

    def _build_stream_attempts(self, config, messages, max_tokens, temperature, preferred_provider="", model=""):
        """Ordered list: preferred first, then configured cloud providers, then Hermes, then Ollama."""
        pref = preferred_provider.strip().lower()

        def _oai():
            return self._stream_openai(messages, config.get("openai_api_key",""), config.get("openai_model","gpt-4o"), max_tokens, temperature)
        def _ant():
            return self._stream_anthropic(messages, config.get("anthropic_api_key",""), config.get("anthropic_model","claude-sonnet-4-20250514"), max_tokens, temperature)
        def _ds():
            return self._stream_deepseek(messages, config.get("deepseek_api_key",""), config.get("deepseek_base_url","https://api.deepseek.com/v1"), config.get("deepseek_model","deepseek-chat"), max_tokens, temperature)
        def _her():
            return self._stream_hermes(messages, config.get("hermes_api_url","http://127.0.0.1:8642"), config.get("hermes_model","deepseek-chat"), config.get("hermes_api_key",""), max_tokens, temperature)
        def _oll():
            return self._stream_ollama(messages, config.get("ollama_url","http://augmentorai-ollama-1:11434"), model or DEFAULT_MODEL, max_tokens, temperature)

        attempts = []
        seen_names = set()

        def add(name, fn, requires_key_for=None):
            if name in seen_names: return
            if requires_key_for and not config.get(f"{requires_key_for}_api_key",""):
                return
            seen_names.add(name)
            attempts.append((name, fn))

        # Preferred first (if key available)
        if pref == "openai": add("OpenAI", _oai, "openai")
        elif pref == "anthropic": add("Anthropic", _ant, "anthropic")
        elif pref == "deepseek": add("DeepSeek", _ds, "deepseek")

        # Then all cloud providers with keys
        add("OpenAI", _oai, "openai")
        add("Anthropic", _ant, "anthropic")
        add("DeepSeek", _ds, "deepseek")

        # Always-available fallbacks
        add("Hermes", _her)
        add("Ollama", _oll)

        return attempts

    async def generate(self, prompt, system_prompt=None, model=DEFAULT_MODEL, max_tokens=800, temperature=0.7, settings=None, preferred_provider=""):
        messages = []
        if system_prompt: messages.append({"role":"system","content":system_prompt})
        messages.append({"role":"user","content":prompt})
        config = self._config(settings)
        pref = preferred_provider.strip().lower()

        def _call_lambda(fn):
            import asyncio
            return asyncio.ensure_future(fn())

        order = []
        # Preferred first
        for p in ["openai","anthropic","gemini","deepseek"]:
            if p == pref and config.get(f"{p}_api_key",""):
                order.append(p)
        # Then others with keys
        for p in ["openai","anthropic","gemini","deepseek"]:
            if p != pref and config.get(f"{p}_api_key",""):
                order.append(p)
        order.extend(["hermes","ollama"])

        errors = []
        for p in order:
            fn = None
            name_map = {"openai":"OpenAI","anthropic":"Anthropic","gemini":"Gemini","deepseek":"DeepSeek","hermes":"Hermes","ollama":"Ollama"}
            name = name_map.get(p,p)
            if p == "openai":
                fn = lambda: self._call_openai(messages, config["openai_api_key"], config["openai_model"], max_tokens, temperature)
            elif p == "anthropic":
                fn = lambda: self._call_anthropic(messages, config["anthropic_api_key"], config["anthropic_model"], max_tokens, temperature)
            elif p == "gemini":
                fn = lambda: self._call_gemini(messages, config["gemini_api_key"], config["gemini_base_url"], config["gemini_model"], max_tokens, temperature)
            elif p == "deepseek":
                fn = lambda: self._call_deepseek(messages, config["deepseek_api_key"], config["deepseek_base_url"], config["deepseek_model"], max_tokens, temperature)
            elif p == "hermes":
                fn = lambda: self._call_hermes(messages, config["hermes_api_url"], config["hermes_model"], config.get("hermes_api_key",""), max_tokens, temperature)
            elif p == "ollama":
                fn = lambda: self._call_ollama(messages, config["ollama_url"], model, max_tokens, temperature)
            if fn:
                try:
                    result = await fn()
                    self._last_provider = name
                    return result
                except (ProviderError, Exception) as e:
                    err = str(e)
                    if "HTTP 429" in err or "quota" in err.lower():
                        err = f"{name} is over quota (HTTP 429)"
                    errors.append(f"{name}: {err}")
                    print(f"{name} failed: {err}")
                    continue
        self._last_provider = "none"
        detail = " | ".join(errors) if errors else "No providers available."
        return f"Error: all AI providers failed. {detail}"

    async def generate_stream(self, prompt, system_prompt=None, model=DEFAULT_MODEL, max_tokens=800, temperature=0.7, settings=None, preferred_provider=""):
        messages = []
        if system_prompt: messages.append({"role":"system","content":system_prompt})
        messages.append({"role":"user","content":prompt})
        config = self._config(settings)
        attempts = self._build_stream_attempts(config, messages, max_tokens, temperature, preferred_provider, model)

        for provider, stream_fn in attempts:
            try:
                self._last_provider = provider
                generator = stream_fn()
                return provider, generator
            except (ProviderError, Exception) as e:
                err = str(e)
                if "HTTP 429" in err or "quota" in err.lower():
                    err = f"{provider} is over quota"
                print(f"{provider} streaming failed: {err}")
                continue

        fallback_text = await self.generate(prompt, system_prompt, model, max_tokens, temperature, settings)
        async def fallback_gen(): yield fallback_text
        return self._last_provider or "unknown", fallback_gen()

    async def generate_interview_answer_stream(self, question, context, language="en", model=DEFAULT_MODEL, settings=None):
        resume_ctx = context.get("resume","").strip()
        job_ctx = context.get("job_description","").strip()
        notes_ctx = context.get("notes","").strip()
        cb = ""
        if resume_ctx: cb += f"\n\nCANDIDATE RESUME:\n{resume_ctx[:2000]}"
        if job_ctx: cb += f"\n\nJOB DESCRIPTION:\n{job_ctx[:1000]}"
        if notes_ctx: cb += f"\n\nADDITIONAL NOTES:\n{notes_ctx[:500]}"
        sp = f"You are an expert interview coach helping a candidate succeed.\nUse context for grounded answers based on actual experience.\nFor behavioral questions, use STAR method. Be concise but complete.\nRespond in: {language}{cb}"
        prompt = f'Interview question: "{question}"\n\nProvide a detailed, structured answer with specific examples from the candidate background. Use STAR method for behavioral questions. Be concise but thorough.'
        provider, token_gen = await self.generate_stream(prompt=prompt, system_prompt=sp, model=model, max_tokens=800, temperature=0.7, settings=settings)
        full_text = ""
        async def tw():
            nonlocal full_text
            async for t in token_gen:
                full_text += t; yield t
        return provider, tw(), lambda: full_text

    async def generate_coding_answer_stream(self, question, context_str, language="en", model=DEFAULT_MODEL, settings=None):
        from app.services.coding_engine import get_prompts_for_type, get_classifier
        qt = get_classifier().classify(question)
        sys_p, user_tpl, max_tk = get_prompts_for_type(qt)
        cb = f"\nCandidate context:\n{context_str[:2500]}" if context_str else ""
        formatted_system = sys_p + cb
        formatted_prompt = user_tpl.format(question=question, context=context_str[:1500] if context_str else "No context provided.")
        provider, token_gen = await self.generate_stream(prompt=formatted_prompt, system_prompt=formatted_system, model=model, max_tokens=max_tk, temperature=0.7, settings=settings)
        full_text = ""
        async def tw():
            nonlocal full_text
            async for t in token_gen:
                full_text += t; yield t
        return provider, tw(), lambda: full_text

    async def generate_interview_answer(self, question, context, language="en", model=DEFAULT_MODEL, settings=None):
        system_prompt = "You are an expert interview coach."
        prompt = f'Interview question: "{question}"\n\nProvide:\nSHORT:\nDETAILED:\nPOINTS:'
        response = await self.generate(prompt=prompt, system_prompt=system_prompt, model=model, max_tokens=800, temperature=0.7, settings=settings)
        return {"short":"","detailed":"","points":[]}

    async def list_models(self, settings=None):
        config = self._config(settings)
        r = {"gemini":[],"deepseek":[],"hermes":[],"ollama":[],"openai":[],"anthropic":[]}
        if config["gemini_api_key"]: r["gemini"].extend([config["gemini_model"],"gemini-2.0-flash","gemini-1.5-flash"])
        if config["deepseek_api_key"]: r["deepseek"].extend([config["deepseek_model"],"deepseek-chat","deepseek-reasoner"])
        if config.get("openai_api_key",""): r["openai"].extend([config["openai_model"],"gpt-4o","gpt-4o-mini","gpt-4-turbo","gpt-3.5-turbo"])
        if config.get("anthropic_api_key",""): r["anthropic"].extend([config["anthropic_model"],"claude-sonnet-4-20250514","claude-3.5-haiku","claude-3-opus"])
        r["hermes"].append(config["hermes_model"])
        try:
            resp = await self.client.get(f"{config['ollama_url']}/api/tags")
            if resp.status_code==200: r["ollama"]+=[m["name"] for m in resp.json().get("models",[])]
        except: pass
        def _dedup(items):
            seen=[]; [seen.append(i) for i in items if i not in seen]; return seen
        return {k:_dedup(v) for k,v in r.items()}

    async def check_connection(self, settings=None):
        config = self._config(settings)
        if config["gemini_api_key"] or config["deepseek_api_key"] or config.get("openai_api_key","") or config.get("anthropic_api_key",""):
            return True
        try:
            r = await self.client.get(f"{config['hermes_api_url']}/api/tools")
            if r.status_code==200: return True
        except: pass
        return await self.check_ollama_connection(settings)

    async def check_ollama_connection(self, settings=None):
        config = self._config(settings)
        try:
            r = await self.client.get(f"{config['ollama_url']}/api/tags")
            return r.status_code==200
        except: return False

_service = None
def get_llm_service(base_url=""):
    global _service
    if _service is None: _service = LLMService()
    return _service
def get_ollama_service(base_url=""): return get_llm_service(base_url)
