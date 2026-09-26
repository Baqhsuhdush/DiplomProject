import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class TelegramChatBody(BaseModel):
    chat_id: int = Field(..., description="Telegram chat id (private chat)")

    @field_validator("chat_id")
    @classmethod
    def non_zero(cls, v: int) -> int:
        if v == 0:
            raise ValueError("chat_id must be non-zero")
        return v


class TelegramDeepLinkResponse(BaseModel):
    url: str
    expires_in: int


class TelegramLinkPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    user_id: uuid.UUID
    chat_id: int
    telegram_user_id: int | None = None
    verified: bool
    created_at: datetime


class TelegramStatusPublic(BaseModel):
    connected: bool
    verified: bool
    telegram_user_id: int | None = None
    chat_id: int | None = None
    sound_enabled: bool = True


class TelegramTestMessagePublic(BaseModel):
    ok: bool
    detail: str


class TelegramPrefsUpdate(BaseModel):
    sound_enabled: bool = True


class TelegramPrefsPublic(BaseModel):
    sound_enabled: bool = True
