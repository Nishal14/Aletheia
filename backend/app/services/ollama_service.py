import httpx
import json
import re
from typing import AsyncGenerator, List, Dict, Optional
from app.config import settings


class OllamaService:
    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL
        self.primary_model = settings.PRIMARY_MODEL
        self.verifier_model = settings.VERIFIER_MODEL
        self.embedding_model = settings.EMBEDDING_MODEL

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                return r.status_code == 200
        except Exception:
            return False

    async def list_models(self) -> List[str]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                data = r.json()
                return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    async def get_embedding(self, text: str) -> List[float]:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                r = await client.post(
                    f"{self.base_url}/api/embed",
                    json={"model": self.embedding_model, "input": text}
                )
                data = r.json()
                embeddings = data.get("embeddings", [[]])
                return embeddings[0] if embeddings else []
        except Exception:
            return []

    async def stream_chat(
        self,
        messages: List[Dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
    ) -> AsyncGenerator[Dict, None]:
        target_model = model or self.primary_model
        payload = {
            "model": target_model,
            "messages": messages,
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_ctx": 8192,
            }
        }
        in_think = False
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.base_url}/api/chat",
                    json=payload,
                ) as resp:
                    async for line in resp.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue
                        # Surface Ollama errors (e.g. model not found)
                        if "error" in chunk:
                            yield {"type": "error", "content": chunk["error"]}
                            return
                        token = chunk.get("message", {}).get("content", "")
                        if not token:
                            continue

                        # Handle qwen3 think tags
                        if "<think>" in token:
                            in_think = True
                        if "</think>" in token:
                            in_think = False
                            # strip the closing tag from yielded text
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

    async def probe_verbalized_confidence(
        self,
        question: str,
        response: str,
        model: Optional[str] = None,
    ) -> tuple[int, float]:
        """LM-Polygraph black-box verbalized confidence: ask the model to rate its own certainty."""
        prompt = (
            "You previously answered the following question. "
            "Rate your confidence in the factual accuracy of your answer on a scale from 0 to 100, "
            "where 0 means completely uncertain and 100 means completely certain.\n\n"
            f"Question: {question[:400]}\n"
            f"Your answer: {response[:600]}\n\n"
            "Reply with ONLY a single integer from 0 to 100. Nothing else."
        )
        raw = await self.complete(prompt, model=model, temperature=0.0, max_tokens=1500, num_ctx=2048)
        import re as _re
        match = _re.search(r"\d+", raw)
        if match:
            val = max(0, min(100, int(match.group())))
            return val, val / 100.0
        return 50, 0.5

    async def complete(
        self,
        prompt: str,
        model: Optional[str] = None,
        temperature: float = 0.1,
        max_tokens: int = 1024,
        num_ctx: int = 2048,
    ) -> str:
        # Use /api/chat with /no_think appended to suppress qwen3 thinking mode.
        # /no_think must be on its own line at the end of the user message.
        # Prefer verifier model; fall back to primary if not installed.
        target_model = model or self.verifier_model
        user_content = prompt.rstrip() + "\n/no_think"

        payload = {
            "model": target_model,
            "messages": [{"role": "user", "content": user_content}],
            "stream": False,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "num_ctx": num_ctx,
            },
        }
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                r = await client.post(f"{self.base_url}/api/chat", json=payload)
                data = r.json()

                # Model not installed — fall back to primary
                if "error" in data and target_model != self.primary_model:
                    payload["model"] = self.primary_model
                    r = await client.post(f"{self.base_url}/api/chat", json=payload)
                    data = r.json()

                text = data.get("message", {}).get("content", "")
                text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
                return text
        except Exception as e:
            return f"Error: {str(e)}"


ollama_service = OllamaService()
