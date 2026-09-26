import logging
import time
from collections import defaultdict
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import and_, select

from app.config import get_settings
from app.core.redis_client import audit_reminder, get_redis
from app.database import SessionLocal
from app.models.notification import Notification
from app.models.roadmap import Task
from app.models.telegram_link import TelegramLink
from app.models.user import User
from app.services.quiet_hours import user_in_reminder_quiet_hours
from app.services.telegram_client import send_telegram_message

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("qadam.worker")


def _preferred_lang(user_id: object) -> str:
    r = get_redis()
    if r is None:
        return "ru"
    try:
        saved = r.get(f"qadam:telegram:lang:{user_id}")
    except Exception:
        logger.exception("failed to read telegram language")
        return "ru"
    if isinstance(saved, str) and saved in {"kk", "ru", "en"}:
        return saved
    return "ru"


def _telegram_sound_enabled(user_id: object) -> bool:
    r = get_redis()
    if r is None:
        return True
    try:
        saved = r.get(f"qadam:telegram:sound:{user_id}")
    except Exception:
        return True
    if isinstance(saved, str):
        return saved != "0"
    return True


def _tr(lang: str, ru: str, kk: str, en: str) -> str:
    if lang == "kk":
        return kk
    if lang == "en":
        return en
    return ru


def _open_app_label(lang: str) -> str:
    return _tr(lang, "📱 Открыть Qadam App", "📱 Qadam қосымшасын ашу", "📱 Open Qadam App")


def _notification_action_markup(lang: str, task_ids: list[str], open_app_url: str | None) -> dict[str, object] | None:
    rows: list[list[dict[str, str]]] = []
    if open_app_url:
        rows.append([{"text": _open_app_label(lang), "url": open_app_url}])
    if not rows:
        return None
    return {"inline_keyboard": rows}


def _append_limited(lines: list[str], rows: list[str], *, max_items: int = 7, lang: str) -> None:
    shown = rows[:max_items]
    lines.extend(shown)
    hidden = max(0, len(rows) - len(shown))
    if hidden:
        lines.append(
            _tr(
                lang,
                f"…и ещё {hidden}",
                f"…тағы {hidden}",
                f"...and {hidden} more",
            )
        )


def _user_timezone(user: User) -> ZoneInfo:
    tz_name = user.timezone or "Asia/Almaty"
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return ZoneInfo("Asia/Almaty")


def _today_bounds_utc(user: User, now_utc: datetime) -> tuple[datetime, datetime]:
    tz = _user_timezone(user)
    now_local = now_utc.astimezone(tz)
    day_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end_local = day_start_local.replace(hour=23, minute=59, second=59, microsecond=999999)
    return day_start_local.astimezone(UTC), day_end_local.astimezone(UTC)


def _already_sent_daily_plan_today(db, user_id, local_date: date) -> bool:
    recent = list(
        db.scalars(
            select(Notification)
            .where(
                Notification.user_id == user_id,
                Notification.channel == "telegram",
                Notification.status == "sent",
            )
            .order_by(Notification.created_at.desc())
            .limit(200)
        ).all()
    )
    day_key = local_date.isoformat()
    for item in recent:
        payload = item.payload or {}
        if payload.get("kind") == "daily_plan" and payload.get("local_date") == day_key:
            return True
    return False


def _send_daily_plan_if_due(db, settings, user: User, user_id, link: TelegramLink, now_utc: datetime) -> None:
    lang = _preferred_lang(user_id)
    tz = _user_timezone(user)
    now_local = now_utc.astimezone(tz)
    if now_local.hour < 7:
        return
    if _already_sent_daily_plan_today(db, user_id=user_id, local_date=now_local.date()):
        return

    day_start_utc, day_end_utc = _today_bounds_utc(user, now_utc)
    tasks_today = list(
        db.scalars(
            select(Task)
            .where(
                and_(
                    Task.user_id == user_id,
                    Task.status.in_(("pending", "in_progress")),
                    Task.due_at.is_not(None),
                    Task.due_at >= day_start_utc,
                    Task.due_at <= day_end_utc,
                )
            )
            .order_by(Task.due_at.asc())
            .limit(25)
        ).all()
    )

    tz_name = getattr(tz, "key", "UTC")
    lines = [_tr(lang, f"📋 Твои задачи на сегодня ({tz_name})", f"📋 Бүгінгі тапсырмалар ({tz_name})", f"📋 Your tasks for today ({tz_name})")]
    if tasks_today:
        urgent: list[str] = []
        overdue: list[str] = []
        queue: list[str] = []
        for t in tasks_today:
            due_local = t.due_at.astimezone(tz) if t.due_at else None
            due_time = due_local.strftime("%H:%M") if due_local else "--:--"
            row = f"• {due_time} — {t.title}"
            if due_local and due_local < now_local:
                overdue.append(row)
            elif due_local and due_local <= now_local + timedelta(hours=1):
                urgent.append(row)
            else:
                queue.append(row)
        if urgent:
            lines.append("")
            lines.append(_tr(lang, "🔴 Срочно", "🔴 Шұғыл", "🔴 Urgent"))
            _append_limited(lines, urgent, lang=lang)
        if overdue:
            lines.append("")
            lines.append(_tr(lang, "🟡 Просроченные", "🟡 Кешіктірілген", "🟡 Overdue"))
            _append_limited(lines, overdue, lang=lang)
        if queue:
            lines.append("")
            lines.append(_tr(lang, "⚪ В очереди", "⚪ Кезектегі", "⚪ Queue"))
            _append_limited(lines, queue, lang=lang)
    else:
        lines.append(
            _tr(
                lang,
                "Сегодня задач с назначенным временем нет.",
                "Бүгінге уақыт қойылған тапсырмалар жоқ.",
                "No tasks with scheduled time for today.",
            )
        )

    text = "\n".join(lines)
    ok, info = send_telegram_message(
        bot_token=settings.telegram_bot_token,
        chat_id=int(link.chat_id),
        text=text,
        reply_markup=_notification_action_markup(lang, [str(t.id) for t in tasks_today], settings.telegram_web_app_url),
        disable_notification=not _telegram_sound_enabled(user_id),
    )
    payload = {
        "kind": "daily_plan",
        "local_date": now_local.date().isoformat(),
        "task_ids": [str(t.id) for t in tasks_today],
    }
    db.add(
        Notification(
            user_id=user_id,
            task_id=None,
            channel="telegram",
            status="sent" if ok else "failed",
            error_detail=None if ok else (info or "")[:4000],
            payload=payload,
        )
    )
    db.commit()
    if not ok:
        logger.warning("daily plan send failed user=%s %s", user_id, info)
        return
    logger.info("daily plan sent user=%s tasks=%s", user_id, len(tasks_today))


def _tick() -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    max_n = max(1, min(5, settings.reminder_max_nudges_per_task_per_day))
    today = now.date()

    with SessionLocal() as db:
        stmt = (
            select(Task)
            .where(
                Task.status.in_(("pending", "in_progress")),
                Task.due_at.is_not(None),
            )
            .order_by(Task.due_at.asc())
        )
        token = settings.telegram_bot_token
        if not token:
            logger.warning("TELEGRAM_BOT_TOKEN not set; skipping sends")
            return

        links = list(db.scalars(select(TelegramLink).where(TelegramLink.verified.is_(True))).all())
        for link in links:
            user = db.get(User, link.user_id)
            if user is None:
                continue
            if user_in_reminder_quiet_hours(user, now):
                continue
            _send_daily_plan_if_due(
                db=db,
                settings=settings,
                user=user,
                user_id=link.user_id,
                link=link,
                now_utc=now,
            )

        tasks = list(db.scalars(stmt).all())
        if not tasks:
            return

        by_user: dict[object, list[Task]] = defaultdict(list)
        for t in tasks:
            by_user[t.user_id].append(t)

        for user_id, user_tasks in by_user.items():
            user = db.get(User, user_id)
            if user is None:
                continue
            if user_in_reminder_quiet_hours(user, now):
                continue

            eligible: list[Task] = []
            for t in user_tasks:
                cnt = t.nudges_sent_on_day
                if t.nudge_count_date_utc != today:
                    cnt = 0
                if cnt >= max_n:
                    continue
                if t.due_at is None:
                    continue
                due = t.due_at
                stages = [
                    due - timedelta(minutes=30),
                    due,
                ]
                if cnt >= 2:
                    stage_at = due + timedelta(minutes=60 * (cnt - 1))
                else:
                    stage_at = stages[cnt]
                # Escalation schedule with anti-spam minimum gap.
                if now < stage_at:
                    continue
                if t.last_nudge_at is not None and (now - t.last_nudge_at) < timedelta(minutes=5):
                    continue
                eligible.append(t)

            if not eligible:
                continue

            link = db.scalar(select(TelegramLink).where(TelegramLink.user_id == user_id))
            if link is None:
                continue
            _send_daily_plan_if_due(
                db=db,
                settings=settings,
                user=user,
                user_id=user_id,
                link=link,
                now_utc=now,
            )

            lang = _preferred_lang(user_id)
            lines = [
                _tr(
                    lang,
                    "⏰ У вас есть невыполненные задачи на сегодня:",
                    "⏰ Бүгін орындалмаған тапсырмаларыңыз бар:",
                    "⏰ You have unfinished tasks for today:",
                ),
                "",
            ]
            task_rows: list[str] = []
            for t in eligible:
                due_local = t.due_at.astimezone(_user_timezone(user)) if t.due_at else None
                due_text = due_local.strftime("%H:%M") if due_local else "--:--"
                task_rows.append(f"• {due_text} — {t.title}")
            _append_limited(lines, task_rows, lang=lang)
            text = "\n".join(lines)

            ok, info = send_telegram_message(
                bot_token=token,
                chat_id=int(link.chat_id),
                text=text,
                reply_markup=_notification_action_markup(lang, [str(t.id) for t in eligible], settings.telegram_web_app_url),
                disable_notification=not _telegram_sound_enabled(user_id),
            )
            payload = {"task_ids": [str(t.id) for t in eligible]}
            audit_reminder(
                {
                    "at": now.isoformat(),
                    "user_id": str(user_id),
                    "chat_id": int(link.chat_id),
                    "ok": ok,
                    "detail": info,
                    "task_ids": payload["task_ids"],
                }
            )
            if not ok:
                logger.warning("telegram send failed user=%s %s", user_id, info)
                db.add(
                    Notification(
                        user_id=user_id,
                        task_id=None,
                        channel="telegram",
                        status="failed",
                        error_detail=(info or "")[:4000],
                        payload=payload,
                    )
                )
                db.commit()
                continue

            db.add(
                Notification(
                    user_id=user_id,
                    task_id=None,
                    channel="telegram",
                    status="sent",
                    error_detail=None,
                    payload=payload,
                )
            )
            for t in eligible:
                t.last_nudge_at = now
                if t.nudge_count_date_utc != today:
                    t.nudge_count_date_utc = today
                    t.nudges_sent_on_day = 1
                else:
                    t.nudges_sent_on_day += 1
            db.commit()
            logger.info("reminder sent user=%s tasks=%s", user_id, len(eligible))


def run_forever() -> None:
    settings = get_settings()
    poll = max(15, settings.worker_poll_seconds)
    logger.info("reminder worker started poll=%ss interval=%ss", poll, settings.reminder_interval_seconds)
    while True:
        try:
            _tick()
        except Exception:
            logger.exception("worker tick crashed")
        time.sleep(poll)
