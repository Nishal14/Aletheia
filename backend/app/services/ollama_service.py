"""
LLM service supporting both local Ollama and cloud providers
(Groq, Together AI, OpenRouter, or any OpenAI-compatible endpoint).

Set PROVIDER in .env to switch:
  PROVIDER=ollama          → uses OLLAMA_BASE_URL (default, local)
  PROVIDER=groq            → uses api.groq.com, requires API_KEY
  PROVIDER=together        → uses api.together.xyz, requires API_KEY
  PROVIDER=openrouter      → uses openrouter.ai, requires API_KEY
  PROVIDER=openai          → uses api.openai.com, requires API_KEY
"""
import httpx
import json
import re
from typing import AsyncGenerator, List, Dict, Optional
from app.config import settings

# ── Provider base URLs ────────────────────────────────────────────────────────
_PROVIDER_URLS = {
    "groq":       "https://api.groq.com/openai/v1",
    "together":   "https://api.together.xyz/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "openai":     "https://api.openai.com/v1",
}

# ── Recommended free/cheap models per provider ────────────────────────────────
_PROVIDER_DEFAULT_MODELS = {
    "groq":       "llama-3.1-8b-instant",
    "together":   "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
    "openrouter": "qwen/qwen-2.5-7b-instruct",
    "openai":     "gpt-4o-mini",
}


def _is_cloud() -> bool:
    return settings.PROVIDER != "ollama"


def _api_base_url() -> str:
    if settings.API_BASE_URL:
        return settings.API_BASE_URL.rstrip("/")
    return _PROVIDER_URLS.get(settings.PROVIDER, settings.OLLAMA_BASE_URL)


def _chat_headers() -> dict:
    if _is_cloud() and settings.API_KEY:
        return {"Authorization": f"Bearer {settings.API_KEY}"}
    return {}


def _effective_model(model: Optional[str], primary: bool = True) -> str:
    if model:
        return model
    if _is_cloud():
        return (settings.PRIMARY_MODEL
                if settings.PRIMARY_MODEL != "qwen3:4b"
                else _PROVIDER_DEFAULT_MODELS.get(settings.PROVIDER, "llama-3.1-8b-instant"))
    return settings.PRIMARY_MODEL if primary else settings.VERIFIER_MODEL


class OllamaService:
    """Unified LLM service: Ollama locally, OpenAI-compatible API in the cloud."""

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.primary_model = settings.PRIMARY_MODEL
        self.verifier_model = settings.VERIFIER_MODEL
        self.embedding_model = settings.EMBEDDING_MODEL

    async def health_check(self) -> bool:
        try:
            url = (f"{_api_base_url()}/models" if _is_cloud()
                   else f"{self.base_url}/api/tags")
            headers = _chat_headers()
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(url, headers=headers)
                return r.status_code in (200, 401)  # 401 = key wrong but API reachable
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            if _is_cloud():
                url = f"{_api_base_url()}/models"
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(url, headers=_chat_headers())
                    data = r.json()
                    return [m.get("id", "") for m in data.get("data", [])]
            else:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    r = await client.get(f"{self.base_url}/api/tags")
                    data = r.json()
                    return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    # ── Embeddings ─────────────────────────────────────────────────────────────

    async def get_embedding(self, text: str) -> List[float]:
        ep = settings.EMBEDDING_PROVIDER
        if ep == "jina":
            return await self._jina_embed(text)
        if ep in ("together", "openai", "openrouter", "groq"):
            return await self._openai_embed(text)
        # Default: Ollama embed
        return await self._ollama_embed(text)

    async def _ollama_embed(self, text: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.embedding_model, "input": text},
                )
                data = r.json()
                embeddings = data.get("embeddings", [[]])
                return embeddings[0] if embeddings else []
        except Exception:
            return []

    async def _openai_embed(self, text: str) -> List[float]:
        """Works with Together AI, OpenAI, or any OpenAI-compatible embed endpoint."""
        key = settings.EMBEDDING_API_KEY or settings.API_KEY or ""
        base = _api_base_url()
        model = settings.EMBEDDING_MODEL
        # Together AI embed model name mapping
        if settings.EMBEDDING_PROVIDER == "together" and model == "nomic-embed-text":
            model = "togethercomputer/m2-bert-80M-8k-retrieval"
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(
                    f"{base}/embeddings",
                    headers={"Authorization": f"Bearer {key}"},
                    json={"model": model, "input": text},
                )
                data = r.json()
                return data["data"][0]["embedding"]
        except Exception:
            return []

    async def _jina_embed(self, text: str) -> List[float]:
        key = settings.EMBEDDING_API_KEY or ""
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(
                    "https://api.jina.ai/v1/embeddings",
                    headers={"Authorization": f"Bearer {key}"},
                    json={"model": "jina-embeddings-v3", "input": [text]},
                )
                data = r.json()
                return data["data"][0]["embedding"]
        except Exception:
            return []

    # ── Chat streaming ─────────────────────────────────────────────────────────

    async def stream_chat(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[Dict, None]:
        if _is_cloud():
            async for event in self._openai_stream(messages, model, temperature):
                yield event
        else:
            async for event in self._ollama_stream(messages, model, temperature):
                yield event

    async def _openai_stream(self, messages, model, temperature):
        target = _effective_model(model)
        url = f"{_api_base_url()}/chat/completions"
        payload = {
            "model": target,
            "messages": messages,
            "stream": True,
            "temperature": temperature,
            "max_tokens": 4096,
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", url, json=payload,
                                         headers=_chat_headers()) as resp:
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        delta = chunk.get("choices", [{}])[0].get("delta", {})
                        token = delta.get("content", "")
                        if token:
                            yield {"type": "token", "content": token, "thinking": False}
        except httpx.ConnectError:
            yield {"type": "error", "content": f"Cannot connect to {settings.PROVIDER} API."}
        except Exception as e:
            yield {"type": "error", "content": f"Inference error: {str(e)}"}

    async def _ollama_stream(self, messages, model, temperature):
        target = model or self.primary_model
        payload = {
            "model": target,
            "messages": messages,
            "stream": True,
            "options": {"temperature": temperature, "num_ctx": 8192},
        }
        in_think = False
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", f"{self.base_url}/api/chat",
                                         json=payload) as resp:
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        if "error" in chunk:
                            yield {"type": "error", "content": chunk["error"]}
                            return
                        token = chunk.get("message", {}).get("content", "")
                        if not token:
                            continue
                        if "<think>" in token:
                            in_think = True
                        if "</think>" in token:
                            in_think = False
                            token = token.replace("</think>", "").strip()
                            if token:
                                yield {"type": "token", "content": token, "thinking": False}
                            continue
                        if in_think:
                            clean = token.replace("<think>", "").strip()
                            if clean:
                                yield {"type": "thinking", "content": clean}
                        else:
                            yield {"type": "token", "content": token, "thinking": False}
                        if chunk.get("done"):
                            break
        except httpx.ConnectError:
            yield {"type": "error", "content": "Cannot connect to Ollama. Ensure it is running."}
        except Exception as e:
            yield {"type": "error", "content": f"Inference error: {str(e)}"}

    # ── Non-streaming completion (verification, probing) ──────────────────────

    async def complete(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        num_ctx: int = 2048,
    ) -> str:
        if _is_cloud():
            return await self._openai_complete(prompt, model, temperature, max_tokens)
        return await self._ollama_complete(prompt, model, temperature, max_tokens, num_ctx)

    async def _openai_complete(self, prompt, model, temperature, max_tokens):
        target = _effective_model(model, primary=False)
        url = f"{_api_base_url()}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                r = await client.post(
                    url,
                    headers=_chat_headers(),
                    json={
                        "model": target,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                    },
                )
                data = r.json()
                if "error" in data:
                    return ""
                return data.get("choices", [{}])[0].get("message", {}).get("content", "")
        except Exception as e:
            return f"Error: {str(e)}"

    async def _ollama_complete(self, prompt, model, temperature, max_tokens, num_ctx):
        target = model or self.verifier_model
        user_content = prompt.rstrip() + "\n/no_think"
        payload = {
            "model": target,
            "messages": [{"role": "user", "content": user_content}],
            "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens, "num_ctx": num_ctx},
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                r = await client.post(f"{self.base_url}/api/chat", json=payload)
                data = r.json()
                if "error" in data and target != self.primary_model:
                    payload["model"] = self.primary_model
                    r = await client.post(f"{self.base_url}/api/chat", json=payload)
                    data = r.json()
                text = data.get("message", {}).get("content", "")
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
                return text
        except Exception as e:
            return f"Error: {str(e)}"

    async def probe_verbalized_confidence(
        self, question: str, response: str, model: Optional[str] = None,
    ) -> tuple[int, float]:
        prompt = (
            "You previously answered the following question. "
            "Rate your confidence in the factual accuracy of your answer "
            "on a scale from 0 to 100.\n\n"
            f"Question: {question[:400]}\n"
            f"Your answer: {response[:600]}\n\n"
            "Reply with ONLY a single integer from 0 to 100."
        )
        raw = await self.complete(prompt, model=model, temperature=0.0, max_tokens=1500, num_ctx=2048)
        match = re.search(r"\d+", raw)
        if match:
            val = max(0, min(100, int(match.group())))
            return val, val / 100.0
        return 50, 0.5


ollama_service = OllamaService()
