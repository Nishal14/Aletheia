from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    VectorParams, Distance, PointStruct,
    Filter, FieldCondition, MatchValue, SearchParams
)
from typing import List, Optional, Dict, Any
from uuid import uuid4
import logging
from app.config import settings

logger = logging.getLogger(__name__)


class QdrantService:
    def __init__(self):
        self.client: Optional[AsyncQdrantClient] = None
        self.available = False

    async def connect(self):
        try:
            # Support Qdrant Cloud via QDRANT_API_KEY env var
            import os
            qdrant_api_key = os.environ.get("QDRANT_API_KEY")
            self.client = AsyncQdrantClient(
                host=settings.QDRANT_HOST,
                port=settings.QDRANT_PORT,
                api_key=qdrant_api_key,
                https=bool(qdrant_api_key),
                timeout=10.0,
            )
            await self.client.get_collections()
            self.available = True
            logger.info("Connected to Qdrant")
            await self._ensure_collections()
        except Exception as e:
            logger.warning(f"Qdrant unavailable: {e}. Running without vector search.")
            self.available = False

    async def _ensure_collections(self):
        existing = [c.name for c in (await self.client.get_collections()).collections]

        for name in [settings.QDRANT_COLLECTION, settings.QDRANT_MEMORY_COLLECTION]:
            if name not in existing:
                await self.client.create_collection(
                    collection_name=name,
                    vectors_config=VectorParams(
                        size=settings.EMBEDDING_DIM,
                        distance=Distance.COSINE,
                    )
                )
                logger.info(f"Created collection: {name}")

    async def upsert(
        self,
        collection: str,
        vector: List[float],
        payload: Dict[str, Any],
        point_id: Optional[str] = None,
    ) -> str:
        if not self.available:
            return ""
        pid = point_id or str(uuid4())
        point = PointStruct(id=pid, vector=vector, payload=payload)
        await self.client.upsert(collection_name=collection, points=[point])
        return pid

    async def search(
        self,
        collection: str,
        vector: List[float],
        top_k: int = 5,
        filter_conditions: Optional[Dict] = None,
        score_threshold: float = 0.3,
    ) -> List[Dict]:
        if not self.available or not vector:
            return []
        try:
            query_filter = None
            if filter_conditions:
                conditions = [
                    FieldCondition(key=k, match=MatchValue(value=v))
                    for k, v in filter_conditions.items()
                ]
                query_filter = Filter(must=conditions)

            results = await self.client.search(
                collection_name=collection,
                query_vector=vector,
                limit=top_k,
                score_threshold=score_threshold,
                query_filter=query_filter,
                search_params=SearchParams(hnsw_ef=128),
            )
            return [
                {
                    "id": str(r.id),
                    "score": r.score,
                    "payload": r.payload or {},
                }
                for r in results
            ]
        except Exception as e:
            logger.error(f"Qdrant search error: {e}")
            return []

    async def delete_by_filter(self, collection: str, filter_conditions: Dict):
        if not self.available:
            return
        from qdrant_client.models import FilterSelector
        conditions = [
            FieldCondition(key=k, match=MatchValue(value=v))
            for k, v in filter_conditions.items()
        ]
        await self.client.delete(
            collection_name=collection,
            points_selector=FilterSelector(filter=Filter(must=conditions)),
        )

    async def keyword_search(
        self,
        collection: str,
        keyword: str,
        top_k: int = 3,
    ) -> list:
        """Scroll through all chunks and return those whose content contains keyword."""
        if not self.available:
            return []
        kw_lower = keyword.lower()
        matches = []
        offset = None
        try:
            while True:
                result = await self.client.scroll(
                    collection_name=collection,
                    limit=100,
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )
                points, next_offset = result
                for pt in points:
                    content = pt.payload.get("content", "")
                    if kw_lower in content.lower():
                        matches.append({"id": str(pt.id), "score": 1.0, "payload": pt.payload})
                if next_offset is None or len(matches) >= top_k:
                    break
                offset = next_offset
        except Exception:
            pass
        return matches[:top_k]

    async def count(self, collection: str) -> int:
        if not self.available:
            return 0
        result = await self.client.count(collection_name=collection)
        return result.count


qdrant_service = QdrantService()
