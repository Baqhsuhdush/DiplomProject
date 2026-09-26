import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str | None = Field(default=None, max_length=255)


class UserPublic(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    timezone: str | None
    is_active: bool
    is_superuser: bool
    reminder_quiet_enabled: bool
    reminder_quiet_start_hour_local: int | None = None
    reminder_quiet_end_hour_local: int | None = None
    created_at: datetime


class UserProfileUpdate(BaseModel):
    """Обновление отображаемого имени (null или пустая строка — очистить)."""

    full_name: str | None = Field(default=None, max_length=255)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        return s or None


class UserTimezoneUpdate(BaseModel):
    """IANA timezone (например Europe/Moscow) или null = UTC в логике воркера."""

    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            return None
        try:
            ZoneInfo(s)
        except ZoneInfoNotFoundError as e:
            raise ValueError("Unknown IANA timezone name") from e
        return s


class ReminderQuietHoursUpdate(BaseModel):
    reminder_quiet_enabled: bool
    reminder_quiet_start_hour_local: int | None = Field(default=None, ge=0, le=23)
    reminder_quiet_end_hour_local: int | None = Field(default=None, ge=0, le=23)

    @model_validator(mode="after")
    def check_hours(self) -> "ReminderQuietHoursUpdate":
        if self.reminder_quiet_enabled and (
            self.reminder_quiet_start_hour_local is None or self.reminder_quiet_end_hour_local is None
        ):
            raise ValueError("When quiet hours are enabled, start and end local hours (0–23) are required")
        return self


class UserChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class UserChangeEmailRequest(BaseModel):
    email: EmailStr
    current_password: str = Field(min_length=8, max_length=128)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str
