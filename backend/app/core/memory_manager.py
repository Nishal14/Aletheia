from typing import List, Optional
from datetime import datetime
from uuid import uuid4
from app.services.ollama_service import ollama_service
from app.services.qdrant_service import qdrant_service
from app.config import settings

SUMMARIZE_PROMPT = """Summarize the following conversation exchange into 2-3 sentences.
Focus on key facts and context established. Be concise.

User: {user_msg}
Assistant: {assistant_msg}

Summary:"""


class MemoryManager:
    async def store_exchange(
        self,
        session_id: str,
        user_message: str,
        assistant_message: str,
        confidence: float = 0.5,
    ):
        if not qdrant_service.available:
            return
        prompt = SUMMARIZE_PROMPT.format(
            user_msg=user_message[:500],
            assistant_msg=assistant_message[:800],
        )
        summary = await ollama_service.complete(prompt, temperature=0.1, max_tokens=150)
        if not summary or len(summary) < 10:
            return
        embedding = await ollama_service.get_embedding(summary)
        if not embedding:
            return
        await qdrant_service.upsert(
            collection=settings.QDRANT_MEMORY_COLLECTION,
            vector=embedding,
            payload={
                "session_id": session_id,
                "summary": summary,
                "user_message": user_message[:300],
                "assistant_message": assistant_message[:500],
                "confidence": confidence,
                "type": "exchange",
                "timestamp": datetime.utcnow().isoformat(),
            },
        )

    async def retrieve_relevant(
        self,
        query: str,
        session_id: Optional[str] = None,
        top_k: int = 3,
    ) -> List[str]:
        if not qdrant_service.available:
            return []
        embedding = await ollama_service.get_embedding(query)
        if not embedding:
            return []
        filter_cond = {"session_id": session_id} if session_id else None
        results = await qdrant_service.search(
            collection=settings.QDRANT_MEMORY_COLLECTION,
            vector=embedding,
            top_k=top_k,
            filter_conditions=filter_cond,
            score_threshold=0.4,
        )
        return [r["payload"].get("summary", "") for r in results if r["payload"].get("summary")]

    async def get_memory_count(self, session_id: str) -> int:
        if not qdrant_service.available:
            return 0
        try:
            results = await qdrant_service.search(
                collection=settings.QDRANT_MEMORY_COLLECTION,
                vector=[0.0] * settings.EMBEDDING_DIM,
                filter_conditions={"session_id": session_id},
                top_k=100,
                score_threshold=0.0,
            )
            return len(results)
        except Exception:
            return 0

    async def clear_session_memory(self, session_id: str):
        if not qdrant_service.available:
            return
        await qdrant_service.delete_by_filter(
            collection=settings.QDRANT_MEMORY_COLLECTION,
            filter_conditions={"session_id": session_id},
        )


memory_manager = MemoryManager()
