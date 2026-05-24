import json
from uuid import uuid4
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel
from app.models.chat import Session, Message, get_db
from app.core.memory_manager import memory_manager

router = APIRouter()


class SessionResponse(BaseModel):
    id: str
    title: str
    created_at: str
    updated_at: str
    mode: str
    message_count: int = 0


class MessageResponse(BaseModel):
    id: str
    role: str
    content: str
    thinking: Optional[str]
    created_at: str
    epistemic_metadata: Optional[dict]
    retrieval_chunks: Optional[list]


@router.get("/sessions", response_model=List[SessionResponse])
async def list_sessions(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).order_by(Session.updated_at.desc()))
    sessions = result.scalars().all()
    out = []
    for s in sessions:
        msgs = await db.execute(select(Message).where(Message.session_id == s.id))
        count = len(msgs.scalars().all())
        out.append(SessionResponse(
            id=s.id, title=s.title,
            created_at=s.created_at.isoformat() + "Z",
            updated_at=s.updated_at.isoformat() + "Z",
            mode=s.mode or "normal",
            message_count=count,
        ))
    return out


@router.post("/sessions", response_model=SessionResponse)
async def create_session(db: AsyncSession = Depends(get_db)):
    session = Session(
        id=str(uuid4()),
        title="New Conversation",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return SessionResponse(
        id=session.id, title=session.title,
        created_at=session.created_at.isoformat(),
        updated_at=session.updated_at.isoformat(),
        mode=session.mode or "normal",
        message_count=0,
    )


@router.get("/sessions/{session_id}/messages", response_model=List[MessageResponse])
async def get_messages(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message)
        .where(Message.session_id == session_id)
        .order_by(Message.created_at)
    )
    messages = result.scalars().all()
    return [
        MessageResponse(
            id=m.id,
            role=m.role,
            content=m.content,
            thinking=m.thinking,
            created_at=m.created_at.isoformat(),
            epistemic_metadata=json.loads(m.epistemic_metadata_json) if m.epistemic_metadata_json else None,
            retrieval_chunks=json.loads(m.retrieval_chunks_json) if m.retrieval_chunks_json else None,
        )
        for m in messages
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: AsyncSession = Depends(get_db)):
    await memory_manager.clear_session_memory(session_id)
    await db.execute(delete(Message).where(Message.session_id == session_id))
    await db.execute(delete(Session).where(Session.id == session_id))
    await db.commit()
    return {"deleted": True}


@router.patch("/sessions/{session_id}/title")
async def update_title(session_id: str, payload: dict, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.title = payload.get("title", session.title)[:80]
    session.updated_at = datetime.utcnow()
    await db.commit()
    return {"updated": True}
