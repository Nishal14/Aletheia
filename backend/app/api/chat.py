import json
from uuid import uuid4
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.chat import Message, Session, get_db
from app.core.orchestrator import run_pipeline
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.websocket("/ws/{session_id}")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    await websocket.accept()
    logger.info(f"WebSocket connected: {session_id}")

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                payload = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "content": "Invalid JSON"})
                continue

            if payload.get("type") != "query":
                continue

            query = payload.get("content", "").strip()
            mode = payload.get("mode", "normal")
            if not query:
                continue

            # Ensure session exists
            session = await _get_or_create_session(db, session_id)

            # Save user message
            user_msg = Message(
                id=str(uuid4()),
                session_id=session_id,
                role="user",
                content=query,
                created_at=datetime.utcnow(),
            )
            db.add(user_msg)
            await db.commit()

            # Build history from recent messages
            history = await _get_history(db, session_id, limit=8)

            # Run pipeline and stream events
            response_text = ""
            thinking_text = ""
            epistemic_data = None

            async for event in run_pipeline(query, session_id, history, mode):
                await websocket.send_json(event)
                if event["type"] == "token":
                    response_text += event.get("content", "")
                elif event["type"] == "thinking":
                    thinking_text += event.get("content", "")
                elif event["type"] == "epistemic":
                    epistemic_data = event.get("data")

            # Save assistant message
            assistant_msg = Message(
                id=str(uuid4()),
                session_id=session_id,
                role="assistant",
                content=response_text,
                thinking=thinking_text if thinking_text else None,
                created_at=datetime.utcnow(),
                epistemic_metadata_json=json.dumps(epistemic_data) if epistemic_data else None,
            )
            db.add(assistant_msg)

            # Update session title if first exchange
            if session.title == "New Conversation":
                title = query[:60] + ("..." if len(query) > 60 else "")
                session.title = title
            session.updated_at = datetime.utcnow()
            await db.commit()

            await websocket.send_json({"type": "message_saved", "id": assistant_msg.id})

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "content": str(e)})
        except Exception:
            pass


async def _get_or_create_session(db: AsyncSession, session_id: str) -> Session:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        session = Session(id=session_id, created_at=datetime.utcnow(), updated_at=datetime.utcnow())
        db.add(session)
        await db.commit()
        await db.refresh(session)
    return session


async def _get_history(db: AsyncSession, session_id: str, limit: int = 8):
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
    )
    messages = list(reversed(result.scalars().all()))
    return [{"role": m.role, "content": m.content} for m in messages]
