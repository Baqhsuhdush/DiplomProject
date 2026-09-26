from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.redis_client import get_redis
from app.database import get_db
from app.models.notification import Notification
from app.models.telegram_link import TelegramLink
from app.models.user import User
from app.schemas.telegram import (
    TelegramChatBody,
    TelegramLinkPublic,
    TelegramPrefsPublic,
    TelegramPrefsUpdate,
    TelegramStatusPublic,
    TelegramTestMessagePublic,
)
from app.services.telegram_client import send_telegram_message

router = APIRouter()


def _telegram_sound_enabled(user_id: object) -> bool:
    r = get_redis()
    if r is None:
        return True
    try:
        v = r.get(f"qadam:telegram:sound:{user_id}")
    except Exception:
        return True
    if isinstance(v, str):
        return v != "0"
    return True


def _set_telegram_sound_enabled(user_id: object, enabled: bool) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.set(f"qadam:telegram:sound:{user_id}", "1" if enabled else "0", ex=60 * 60 * 24 * 180)
    except Exception:
        return


@router.patch("/telegram", response_model=TelegramLinkPublic)
def link_telegram_chat(
    payload: TelegramChatBody,
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TelegramLink:
    row = db.scalar(select(TelegramLink).where(TelegramLink.user_id == current.id))
    if row is None:
        row = TelegramLink(
            user_id=current.id,
            chat_id=payload.chat_id,
            telegram_user_id=None,
            verified=True,
        )
        db.add(row)
    else:
        row.chat_id = payload.chat_id
        row.verified = True
    db.commit()
    db.refresh(row)
    return row


@router.get("/telegram/status", response_model=TelegramStatusPublic)
def telegram_status(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TelegramStatusPublic:
    row = db.scalar(select(TelegramLink).where(TelegramLink.user_id == current.id))
    if row is None:
        return TelegramStatusPublic(
            connected=False,
            verified=False,
            telegram_user_id=None,
            chat_id=None,
            sound_enabled=_telegram_sound_enabled(current.id),
        )
    return TelegramStatusPublic(
        connected=True,
        verified=bool(row.verified),
        telegram_user_id=row.telegram_user_id,
        chat_id=row.chat_id,
        sound_enabled=_telegram_sound_enabled(current.id),
    )


@router.patch("/telegram/preferences", response_model=TelegramPrefsPublic)
def patch_telegram_preferences(
    payload: TelegramPrefsUpdate,
    current: Annotated[User, Depends(get_current_user)],
) -> TelegramPrefsPublic:
    _set_telegram_sound_enabled(current.id, payload.sound_enabled)
    return TelegramPrefsPublic(sound_enabled=payload.sound_enabled)


@router.post("/telegram/test-message", response_model=TelegramTestMessagePublic)
def send_test_message(
    db: Annotated[Session, Depends(get_db)],
    current: Annotated[User, Depends(get_current_user)],
) -> TelegramTestMessagePublic:
    row = db.scalar(select(TelegramLink).where(TelegramLink.user_id == current.id))
    if row is None or not row.verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Telegram is not connected")

    settings = get_settings()
    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TELEGRAM_BOT_TOKEN is not configured",
        )

    text = "Qadam test notification: integration works."
    ok, detail = send_telegram_message(
        bot_token=settings.telegram_bot_token,
        chat_id=row.chat_id,
        text=text,
        disable_notification=not _telegram_sound_enabled(current.id),
    )
    db.add(
        Notification(
            user_id=current.id,
            task_id=None,
            channel="telegram",
            status="sent" if ok else "failed",
            error_detail=None if ok else detail[:1000],
            payload={"kind": "test_message"},
        )
    )
    db.commit()
    if not ok:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Telegram send failed: {detail}")
    return TelegramTestMessagePublic(ok=True, detail="Test message sent")
