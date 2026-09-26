import json
import logging
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)


def _fallback_tips(*, lang: str, overdue_open_tasks: int, completion_pct: int, streak_days: int) -> list[str]:
    if lang == "kk":
        tips: list[str] = []
        if overdue_open_tasks > 0:
            tips.append("Бүгін кемінде 1 кешіккен тапсырманы жабыңыз.")
        tips.append("Стрик сақталу үшін бүгін кемінде 1 тапсырма орындаңыз.")
        tips.append(
            "Жаңа істі бастамай тұрып 1-2 басым тапсырмаға фокус жасаңыз."
            if completion_pct < 60
            else "Қарқыныңыз жақсы! Күніне +1 тапсырма қосып көріңіз."
        )
        if streak_days >= 14:
            tips.append("Қазір жақсы ритмдесіз — тұрақты уақытпен жалғастырыңыз.")
        return tips[:4]
    if lang == "en":
        tips = []
        if overdue_open_tasks > 0:
            tips.append("Close at least 1 overdue task today.")
        tips.append("Complete at least 1 task today to keep your streak.")
        tips.append(
            "Focus on 1-2 priority tasks before starting new ones."
            if completion_pct < 60
            else "Great pace! Try increasing your load by +1 task per day."
        )
        if streak_days >= 14:
            tips.append("You are in a strong rhythm now - keep the same schedule.")
        return tips[:4]

    tips = []
    if overdue_open_tasks > 0:
        tips.append("Закройте хотя бы 1 просроченную задачу сегодня.")
    tips.append("Чтобы сохранить стрик, закройте минимум 1 задачу сегодня.")
    tips.append(
        "Сфокусируйтесь на 1-2 приоритетных задачах перед новыми."
        if completion_pct < 60
        else "Отличный темп! Увеличьте нагрузку на +1 задачу в день."
    )
    if streak_days >= 14:
        tips.append("Сейчас хороший ритм — продолжайте в том же расписании.")
    return tips[:4]


def build_progress_recommendations(
    *,
    lang: str,
    goals_active: int,
    tasks_total: int,
    completed_count: int,
    overdue_open_tasks: int,
    streak_days: int,
) -> list[str]:
    completion_pct = round((completed_count / tasks_total) * 100) if tasks_total > 0 else 0
    settings = get_settings()
    if not settings.openai_api_key:
        return _fallback_tips(
            lang=lang,
            overdue_open_tasks=overdue_open_tasks,
            completion_pct=completion_pct,
            streak_days=streak_days,
        )

    system = (
        "You are a productivity coach for the Qadam app. "
        "Return ONLY valid JSON: {\"tips\":[\"...\",\"...\",\"...\"]}. "
        "Tips must be short, practical, and action-oriented. "
        "Generate 3-4 tips in requested language."
    )
    user_blob: dict[str, Any] = {
        "lang": lang,
        "goals_active": goals_active,
        "tasks_total": tasks_total,
        "tasks_completed": completed_count,
        "completion_pct": completion_pct,
        "overdue_open_tasks": overdue_open_tasks,
        "streak_days": streak_days,
    }
    try:
        from openai import OpenAI

        client_kwargs: dict[str, str] = {"api_key": settings.openai_api_key or ""}
        bu = (settings.openai_base_url or "").strip()
        if bu:
            client_kwargs["base_url"] = bu
        client = OpenAI(**client_kwargs)
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(user_blob, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        tips = data.get("tips") if isinstance(data, dict) else None
        if isinstance(tips, list):
            clean = [str(x).strip() for x in tips if str(x).strip()]
            if clean:
                return clean[:4]
    except Exception:
        logger.exception("progress AI recommendations failed, using fallback")

    return _fallback_tips(
        lang=lang,
        overdue_open_tasks=overdue_open_tasks,
        completion_pct=completion_pct,
        streak_days=streak_days,
    )
