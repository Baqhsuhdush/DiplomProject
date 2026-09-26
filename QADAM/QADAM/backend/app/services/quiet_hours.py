from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.models.user import User


def user_local_hour(now_utc: datetime, timezone: str | None) -> int:
    name = (timezone or "").strip() or "UTC"
    try:
        tz = ZoneInfo(name)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    return int(now_utc.astimezone(tz).hour)


def user_in_reminder_quiet_hours(user: User, now_utc: datetime) -> bool:
    if not user.reminder_quiet_enabled:
        return False
    s = user.reminder_quiet_start_hour_local
    e = user.reminder_quiet_end_hour_local
    if s is None or e is None:
        return False
    h = user_local_hour(now_utc, user.timezone)
    if s <= e:
        return s <= h < e
    return h >= s or h < e
