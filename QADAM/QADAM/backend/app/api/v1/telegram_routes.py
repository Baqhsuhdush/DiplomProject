import logging
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.config import get_settings
from app.core.redis_client import get_redis
from app.database import get_db
from app.models.goal import Goal
from app.models.roadmap import Task
from app.models.telegram_link import TelegramLink
from app.models.user import User
from app.schemas.telegram import TelegramDeepLinkResponse
from app.services.telegram_client import send_telegram_message
from app.services.telegram_link_tokens import create_link_token, delete_link_token, peek_link_token

logger = logging.getLogger(__name__)

router = APIRouter()


def _norm_text(v: str) -> str:
    return " ".join((v or "").strip().lower().split())


def _preferred_lang(code: str | None) -> str:
    raw = (code or "").lower()
    if raw.startswith("kk"):
        return "kk"
    if raw.startswith("en"):
        return "en"
    return "ru"


def _tr(lang: str, ru: str, kk: str, en: str) -> str:
    if lang == "kk":
        return kk
    if lang == "en":
        return en
    return ru


def _persist_telegram_lang(user_id: object, lang: str) -> None:
    r = get_redis()
    if r is None:
        return
    try:
        r.set(f"qadam:telegram:lang:{user_id}", lang, ex=60 * 60 * 24 * 120)
    except Exception:
        logger.exception("failed to persist telegram language")


def _load_telegram_lang(user_id: object, fallback: str = "ru") -> str:
    r = get_redis()
    if r is None:
        return fallback
    try:
        saved = r.get(f"qadam:telegram:lang:{user_id}")
    except Exception:
        logger.exception("failed to read telegram language")
        return fallback
    if isinstance(saved, str) and saved in {"kk", "ru", "en"}:
        return saved
    return fallback


def _telegram_sound_enabled(user_id: object) -> bool:
    r = get_redis()
    if r is None:
        return True
    try:
        saved = r.get(f"qadam:telegram:sound:{user_id}")
    except Exception:
        logger.exception("failed to read telegram sound preference")
        return True
    if isinstance(saved, str):
        return saved != "0"
    return True


def _accept_update_once(update_id: Any) -> bool:
    if not isinstance(update_id, int):
        return True
    r = get_redis()
    if r is None:
        return True
    key = f"qadam:telegram:update:{update_id}"
    try:
        return bool(r.set(key, "1", ex=60 * 30, nx=True))
    except Exception:
        logger.exception("failed to dedupe telegram update")
        return True


def _open_app_label(lang: str) -> str:
    return _tr(lang, "📱 Открыть Qadam App", "📱 Qadam қосымшасын ашу", "📱 Open Qadam App")


def _main_menu_markup(lang: str) -> dict[str, object]:
    return {
        "keyboard": [
            [
                {"text": _tr(lang, "📋 Задачи на сегодня", "📋 Бүгінгі тапсырмалар", "📋 Today's tasks")},
                {"text": _tr(lang, "🌐 Язык", "🌐 Тіл", "🌐 Language")},
            ],
        ],
        "resize_keyboard": True,
    }


def _language_inline_markup() -> dict[str, object]:
    return {
        "inline_keyboard": [
            [
                {"text": "🇰🇿 Қазақша", "callback_data": "set_lang:kk"},
                {"text": "🇷🇺 Русский", "callback_data": "set_lang:ru"},
                {"text": "🇺🇸 English", "callback_data": "set_lang:en"},
            ]
        ]
    }


def _today_bounds_for_user(user: User, now_utc: datetime) -> tuple[datetime, datetime, ZoneInfo]:
    tz_name = user.timezone or "Asia/Almaty"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Asia/Almaty")
    now_local = now_utc.astimezone(tz)
    day_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end_local = day_start_local.replace(hour=23, minute=59, second=59, microsecond=999999)
    return day_start_local.astimezone(UTC), day_end_local.astimezone(UTC), tz


def _notification_action_markup(lang: str, task_ids: list[str], open_app_url: str | None) -> dict[str, object] | None:
    rows: list[list[dict[str, str]]] = []
    if open_app_url:
        rows.append([{"text": _open_app_label(lang), "url": open_app_url}])
    if not rows:
        return None
    return {"inline_keyboard": rows}


def _goals_inline_markup(lang: str, goals: list[Goal], open_app_url: str | None) -> dict[str, object] | None:
    base = (open_app_url or "").rstrip("/")
    rows: list[list[dict[str, str]]] = []
    if base:
        for g in goals[:6]:
            rows.append([{"text": f"🎯 {g.title[:48]}", "url": f"{base}/goals/{g.id}"}])
        rows.append([{"text": _open_app_label(lang), "url": f"{base}/goals"}])
    elif open_app_url:
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


def _today_range_for_user(user: User) -> tuple[datetime, datetime]:
    tz_name = user.timezone or "Asia/Almaty"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Asia/Almaty")
    now_local = datetime.now(tz)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local.replace(hour=23, minute=59, second=59, microsecond=999999)
    return start_local.astimezone(UTC), end_local.astimezone(UTC)


def _build_linked_message(user: User, db: Session, lang: str) -> str:
    day_start_utc, day_end_utc = _today_range_for_user(user)
    tasks = db.scalars(
        select(Task)
        .where(
            and_(
                Task.user_id == user.id,
                Task.status.in_(("pending", "in_progress")),
                Task.due_at.is_not(None),
                Task.due_at >= day_start_utc,
                Task.due_at <= day_end_utc,
            )
        )
        .order_by(Task.due_at.asc())
        .limit(25)
    ).all()
    tz_name = user.timezone or "Asia/Almaty"
    try:
        tz = ZoneInfo(tz_name)
    except Exception:
        tz = ZoneInfo("Asia/Almaty")
        tz_name = "Asia/Almaty"

    now_local = datetime.now(tz)
    lines = [
        _tr(lang, "Qadam аккаунт привязан ✅", "Qadam аккаунты сәтті қосылды ✅", "Qadam account linked ✅"),
        "",
        _tr(
            lang,
            f"📋 Твои задачи на сегодня ({tz_name})",
            f"📋 Бүгінгі тапсырмаларыңыз ({tz_name})",
            f"📋 Your tasks for today ({tz_name})",
        ),
    ]
    if not tasks:
        lines.append(
            _tr(
                lang,
                "Сегодня активных задач по времени нет.",
                "Бүгін уақытқа қойылған белсенді тапсырма жоқ.",
                "No active timed tasks for today.",
            )
        )
        lines.append(
            _tr(
                lang,
                "Назначь дедлайны в Qadam, чтобы получать точные напоминания.",
                "Нақты еске салғыштар үшін Qadam-да дедлайн орнатыңыз.",
                "Set deadlines in Qadam to get precise reminders.",
            )
        )
        return "\n".join(lines)

    urgent: list[str] = []
    overdue: list[str] = []
    queue: list[str] = []
    for item in tasks:
        due_local = item.due_at.astimezone(tz) if item.due_at else None
        time_text = due_local.strftime("%H:%M") if due_local else "--:--"
        row = f"• {time_text} — {item.title}"
        if due_local and due_local < now_local:
            overdue.append(row)
        elif due_local and due_local <= now_local + timedelta(hours=1):
            urgent.append(row)
        else:
            queue.append(row)
    if urgent:
        lines.append("")
        lines.append(_tr(lang, "🔴 Срочно (ближайший дедлайн)", "🔴 Шұғыл (жақын дедлайн)", "🔴 Urgent (nearest deadline)"))
        _append_limited(lines, urgent, lang=lang)
    if overdue:
        lines.append("")
        lines.append(_tr(lang, "🟡 Просроченные", "🟡 Кешіктірілген", "🟡 Overdue"))
        _append_limited(lines, overdue, lang=lang)
    if queue:
        lines.append("")
        lines.append(_tr(lang, "⚪ В очереди", "⚪ Кезектегі", "⚪ Queue"))
        _append_limited(lines, queue, lang=lang)
    lines.append("")
    lines.append(
        _tr(
            lang,
            "Отмечай выполнение в приложении, чтобы не пропускать задачи.",
            "Орындалғанын қосымшада белгілеңіз — сонда тапсырма ұмытылмайды.",
            "Mark progress in the app so tasks are not missed.",
        )
    )
    return "\n".join(lines)


def _build_today_deadlines_message(user: User, db: Session, lang: str) -> tuple[str, list[str]]:
    now_utc = datetime.now(UTC)
    start_utc, end_utc, tz = _today_bounds_for_user(user, now_utc)
    tasks = db.scalars(
        select(Task)
        .where(
            and_(
                Task.user_id == user.id,
                Task.status.in_(("pending", "in_progress")),
                Task.due_at.is_not(None),
                Task.due_at >= start_utc,
                Task.due_at <= end_utc,
            )
        )
        .order_by(Task.due_at.asc())
        .limit(20)
    ).all()
    tz_name = getattr(tz, "key", "Asia/Almaty")
    lines = [_tr(lang, f"📋 Твои дедлайны на сегодня ({tz_name})", f"📋 Бүгінгі дедлайндар ({tz_name})", f"📋 Your deadlines today ({tz_name})")]
    if not tasks:
        lines.append(_tr(lang, "Сегодня активных дедлайнов нет.", "Бүгін белсенді дедлайн жоқ.", "No active deadlines for today."))
        return "\n".join(lines), []
    ids: list[str] = []
    for item in tasks:
        due_local = item.due_at.astimezone(tz) if item.due_at else None
        due = due_local.strftime("%H:%M") if due_local else "--:--"
        lines.append(f"• {due} — {item.title}")
        ids.append(str(item.id))
    return "\n".join(lines), ids


def _goal_message(lang: str) -> str:
    return _tr(
        lang,
        "🎯 Наша цель QADAM: системный подход к обучению, дисциплина и тайм-менеджмент. Маленькие ежедневные шаги приводят к большим результатам.",
        "🎯 QADAM мақсаты: оқуға жүйелі көзқарас, тәртіп және уақытты тиімді басқару. Күнделікті шағын қадамдар үлкен нәтижеге жеткізеді.",
        "🎯 QADAM mission: a systematic approach to learning, discipline, and time management. Small daily steps lead to big results.",
    )


def _build_goals_message(user_id: object, db: Session, lang: str) -> tuple[str, list[Goal]]:
    goals = list(
        db.scalars(
            select(Goal)
            .where(Goal.user_id == user_id, Goal.status == "active")
            .order_by(Goal.priority.asc(), Goal.created_at.desc())
            .limit(20)
        ).all()
    )
    lines = [_tr(lang, "🎯 Ваши активные цели:", "🎯 Сіздің белсенді мақсаттарыңыз:", "🎯 Your active goals:")]
    if not goals:
        lines.append(_tr(lang, "Пока активных целей нет.", "Әзірге белсенді мақсат жоқ.", "No active goals yet."))
        return "\n".join(lines), goals
    for g in goals[:8]:
        lines.append(f"• {g.title}")
    if len(goals) > 8:
        lines.append(_tr(lang, f"…и ещё {len(goals)-8}", f"…тағы {len(goals)-8}", f"...and {len(goals)-8} more"))
    return "\n".join(lines), goals


@router.post("/link-token", response_model=TelegramDeepLinkResponse)
def create_telegram_deep_link(
    current: Annotated[User, Depends(get_current_user)],
) -> TelegramDeepLinkResponse:
    settings = get_settings()
    if not settings.telegram_bot_username:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TELEGRAM_BOT_USERNAME is not configured",
        )
    if not settings.redis_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="REDIS_URL is not configured",
        )
    ttl = max(60, settings.telegram_link_ttl_seconds)
    token = create_link_token(user_id=current.id, ttl_seconds=ttl)
    username = settings.telegram_bot_username.strip().lstrip("@")
    url = f"https://t.me/{username}?start={token}"
    return TelegramDeepLinkResponse(url=url, expires_in=ttl)


@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db)],
    x_telegram_bot_api_secret_token: Annotated[str | None, Header(alias="X-Telegram-Bot-Api-Secret-Token")] = None,
) -> dict[str, bool]:
    settings = get_settings()
    expected = settings.telegram_webhook_secret
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TELEGRAM_WEBHOOK_SECRET is not configured",
        )
    if x_telegram_bot_api_secret_token != expected:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook secret")

    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="TELEGRAM_BOT_TOKEN is not configured",
        )

    update: dict[str, Any] = await request.json()
    if not _accept_update_once(update.get("update_id")):
        return {"ok": True}
    callback = update.get("callback_query")
    if isinstance(callback, dict):
        from_user = callback.get("from") or {}
        data = callback.get("data") or ""
        cb_message = callback.get("message") or {}
        cb_chat = cb_message.get("chat") if isinstance(cb_message, dict) else {}
        chat_id = cb_chat.get("id") if isinstance(cb_chat, dict) else None
        tg_user_id = from_user.get("id")
        base_lang = _preferred_lang(from_user.get("language_code") if isinstance(from_user, dict) else None)
        if tg_user_id is None or chat_id is None or not isinstance(data, str):
            return {"ok": True}
        link = db.scalar(select(TelegramLink).where(TelegramLink.telegram_user_id == int(tg_user_id)))
        if link is None:
            return {"ok": True}
        lang = _load_telegram_lang(link.user_id, fallback=base_lang)
        sound_enabled = _telegram_sound_enabled(link.user_id)

        if data.startswith("set_lang:"):
            next_lang = data.split(":", 1)[1].strip()
            if next_lang in {"kk", "ru", "en"}:
                _persist_telegram_lang(link.user_id, next_lang)
                send_telegram_message(
                    bot_token=settings.telegram_bot_token,
                    chat_id=int(chat_id),
                    text=_tr(
                        next_lang,
                        "Язык обновлен.",
                        "Тіл жаңартылды.",
                        "Language updated.",
                    ),
                    reply_markup=_main_menu_markup(next_lang),
                    disable_notification=not sound_enabled,
                )
            return {"ok": True}

        if data.startswith("done:"):
            raw_id = data.split(":", 1)[1].strip()
            try:
                task_id = UUID(raw_id)
            except Exception:
                return {"ok": True}
            task = db.scalar(select(Task).where(and_(Task.id == task_id, Task.user_id == link.user_id)))
            if task is None:
                return {"ok": True}
            task.status = "completed"
            task.completed_at = datetime.now(UTC)
            db.add(task)
            db.commit()
            send_telegram_message(
                bot_token=settings.telegram_bot_token,
                chat_id=int(chat_id),
                text=_tr(lang, "✅ Отмечено как выполнено.", "✅ Орындалды деп белгіленді.", "✅ Marked as done."),
                reply_markup=_main_menu_markup(lang),
                disable_notification=not sound_enabled,
            )
            return {"ok": True}

        if data.startswith("snooze15:"):
            raw_id = data.split(":", 1)[1].strip()
            try:
                task_id = UUID(raw_id)
            except Exception:
                return {"ok": True}
            task = db.scalar(select(Task).where(and_(Task.id == task_id, Task.user_id == link.user_id)))
            if task is None:
                return {"ok": True}
            base = task.due_at or datetime.now(UTC)
            task.due_at = base + timedelta(minutes=15)
            db.add(task)
            db.commit()
            send_telegram_message(
                bot_token=settings.telegram_bot_token,
                chat_id=int(chat_id),
                text=_tr(lang, "⏳ Дедлайн сдвинут на 15 минут.", "⏳ Дедлайн 15 минутқа жылжыды.", "⏳ Deadline moved by 15 minutes."),
                reply_markup=_main_menu_markup(lang),
                disable_notification=not sound_enabled,
            )
            return {"ok": True}

        if data.startswith("snooze60:"):
            raw_id = data.split(":", 1)[1].strip()
            try:
                task_id = UUID(raw_id)
            except Exception:
                return {"ok": True}
            task = db.scalar(select(Task).where(and_(Task.id == task_id, Task.user_id == link.user_id)))
            if task is None:
                return {"ok": True}
            base = task.due_at or datetime.now(UTC)
            task.due_at = base + timedelta(hours=1)
            db.add(task)
            db.commit()
            send_telegram_message(
                bot_token=settings.telegram_bot_token,
                chat_id=int(chat_id),
                text=_tr(lang, "⏳ Дедлайн сдвинут на 1 час.", "⏳ Дедлайн 1 сағатқа жылжыды.", "⏳ Deadline moved by 1 hour."),
                reply_markup=_main_menu_markup(lang),
                disable_notification=not sound_enabled,
            )
            return {"ok": True}

        return {"ok": True}

    message = update.get("message") or update.get("edited_message")
    if not isinstance(message, dict):
        return {"ok": True}

    chat = message.get("chat") or {}
    from_user = message.get("from") or {}
    text = message.get("text") or ""
    if not isinstance(text, str):
        return {"ok": True}

    chat_id = chat.get("id")
    tg_user_id = from_user.get("id")
    lang = _preferred_lang(from_user.get("language_code") if isinstance(from_user, dict) else None)
    if chat_id is None or tg_user_id is None:
        return {"ok": True}

    link = db.scalar(select(TelegramLink).where(TelegramLink.telegram_user_id == int(tg_user_id)))
    if link is not None:
        lang = _load_telegram_lang(link.user_id, fallback=lang)
    sound_enabled = _telegram_sound_enabled(link.user_id) if link is not None else True

    deadlines_btn = _tr(lang, "📋 Задачи на сегодня", "📋 Бүгінгі тапсырмалар", "📋 Today's tasks")
    lang_btn = _tr(lang, "🌐 Язык", "🌐 Тіл", "🌐 Language")
    goal_btn_legacy = _tr(lang, "🎯 Наша цель", "🎯 Мақсатымыз", "🎯 Our Goal")
    deadlines_btn_legacy = _tr(lang, "⏳ Мои дедлайны", "⏳ Менің дедлайндарым", "⏳ My Deadlines")

    norm_text = _norm_text(text)
    if norm_text == _norm_text(goal_btn_legacy):
        if link is None:
            send_telegram_message(
                bot_token=settings.telegram_bot_token,
                chat_id=int(chat_id),
                text=_tr(
                    lang,
                    "Сначала привяжите аккаунт через Qadam App.",
                    "Алдымен Qadam App арқылы аккаунтты байланыстырыңыз.",
                    "Link your account via Qadam App first.",
                ),
                reply_markup=_main_menu_markup(lang),
                disable_notification=not sound_enabled,
            )
            return {"ok": True}
        body, goals = _build_goals_message(link.user_id, db, lang)
        send_telegram_message(
            bot_token=settings.telegram_bot_token,
            chat_id=int(chat_id),
            text=body,
            reply_markup=_goals_inline_markup(lang, goals, settings.telegram_web_app_url),
            disable_notification=not sound_enabled,
        )
        return {"ok": True}
    if norm_text == _norm_text(lang_btn):
        send_telegram_message(
            bot_token=settings.telegram_bot_token,
            chat_id=int(chat_id),
            text="🌐",
            reply_markup=_language_inline_markup(),
            disable_notification=not sound_enabled,
        )
        return {"ok": True}
    if (norm_text == _norm_text(deadlines_btn) or norm_text == _norm_text(deadlines_btn_legacy) or norm_text.startswith("/status")) and link is not None:
        user = db.get(User, link.user_id)
        if user is None:
            return {"ok": True}
        body, task_ids = _build_today_deadlines_message(user, db, lang)
        send_telegram_message(
            bot_token=settings.telegram_bot_token,
            chat_id=int(chat_id),
            text=body,
            reply_markup=_notification_action_markup(lang, task_ids, settings.telegram_web_app_url),
            disable_notification=not sound_enabled,
        )
        return {"ok": True}

    if not text.startswith("/start"):
        send_telegram_message(
            bot_token=settings.telegram_bot_token,
            chat_id=int(chat_id),
            text=_tr(
                lang,
                "Используй меню ниже для действий.",
                "Әрекеттер үшін төмендегі мәзірді қолданыңыз.",
                "Use the menu below for actions.",
            ),
            reply_markup=_main_menu_markup(lang),
            disable_notification=not sound_enabled,
        )
        return {"ok": True}

    parts = text.split(maxsplit=1)
    payload = parts[1].strip() if len(parts) > 1 else ""
    if not payload:
        if link is not None:
            user = db.get(User, link.user_id)
            if user is None:
                return {"ok": True}
            body, task_ids = _build_today_deadlines_message(user, db, lang)
            send_telegram_message(
                bot_token=settings.telegram_bot_token,
                chat_id=int(chat_id),
                text=body,
                reply_markup=_notification_action_markup(lang, task_ids, settings.telegram_web_app_url),
                disable_notification=not sound_enabled,
            )
            return {"ok": True}
        send_telegram_message(
            bot_token=settings.telegram_bot_token,
            chat_id=int(chat_id),
            text=_tr(
                lang,
                "Открой ссылку из приложения Qadam, чтобы привязать аккаунт. После привязки выбери язык и часовой пояс в настройках.",
                "Аккаунтты байланыстыру үшін Qadam қосымшасындағы сілтемені ашыңыз. Байланыстырғаннан кейін тіл мен уақыт белдеуін баптаңыз.",
                "Open the link from Qadam app to link your account. After linking, set language and timezone in settings.",
            ),
            reply_markup=_main_menu_markup(lang),
            disable_notification=not sound_enabled,
        )
        return {"ok": True}

    user_id = peek_link_token(payload)
    if user_id is None:
        send_telegram_message(
            bot_token=settings.telegram_bot_token,
            chat_id=int(chat_id),
            text=_tr(
                lang,
                "Ссылка устарела или уже использована. Сгенерируй новую в Qadam.",
                "Сілтеме ескірген немесе қолданылып қойған. Qadam-да жаңасын жасаңыз.",
                "The link has expired or is already used. Generate a new one in Qadam.",
            ),
            reply_markup=_main_menu_markup(lang),
            disable_notification=not sound_enabled,
        )
        return {"ok": True}

    row = db.scalar(select(TelegramLink).where(TelegramLink.user_id == user_id))
    if row is None:
        row = TelegramLink(
            user_id=user_id,
            chat_id=int(chat_id),
            telegram_user_id=int(tg_user_id),
            verified=True,
        )
        db.add(row)
    else:
        row.chat_id = int(chat_id)
        row.telegram_user_id = int(tg_user_id)
        row.verified = True
    try:
        db.commit()
    except Exception:
        logger.exception("failed to persist telegram link")
        db.rollback()
        return {"ok": True}

    delete_link_token(payload)
    _persist_telegram_lang(user_id, lang)

    linked_user = db.scalar(select(User).where(User.id == user_id))
    confirmation_text = (
        _build_linked_message(linked_user, db, lang)
        if linked_user is not None
        else _tr(
            lang,
            "Аккаунт Qadam привязан. Открой приложение, чтобы увидеть задачи на сегодня.",
            "Qadam аккаунты байланыстырылды. Бүгінгі тапсырмаларды көру үшін қосымшаны ашыңыз.",
            "Qadam account linked. Open the app to view today's tasks.",
        )
    )
    send_telegram_message(
        bot_token=settings.telegram_bot_token,
        chat_id=int(chat_id),
        text=confirmation_text,
        reply_markup=_main_menu_markup(lang),
        disable_notification=not _telegram_sound_enabled(user_id),
    )
    return {"ok": True}
