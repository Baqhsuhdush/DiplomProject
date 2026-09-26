import json
import logging
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)


def _risk_score(*, overdue_open_tasks: int, completion_velocity: float, streak_days: int) -> int:
    score = min(100, overdue_open_tasks * 20)
    if completion_velocity < 0.8:
        score += 20
    elif completion_velocity < 1.2:
        score += 10
    if streak_days == 0:
        score += 15
    elif streak_days >= 7:
        score -= 10
    return max(0, min(100, score))


def _trend(streak_days: int, completion_velocity: float) -> str:
    if streak_days >= 7 and completion_velocity >= 1.2:
        return "up"
    if streak_days == 0 and completion_velocity < 1:
        return "down"
    return "stable"


def _fallback_focus(lang: str, overdue_open_tasks: int, risk_score: int) -> list[str]:
    if lang == "kk":
        tips = [
            "Күн сайын кемінде 1 басым тапсырманы жабыңыз.",
            "Ең жақын дедлайны бар 2 тапсырманы бірінші орындаңыз.",
            "Кешкі уақытта келесі күнге 10 минут жоспар жасаңыз.",
        ]
        if overdue_open_tasks > 0:
            tips.insert(0, "Алдымен 1 кешіккен тапсырманы жабыңыз.")
        if risk_score >= 70:
            tips.append("Жүктемені азайтып, көлемнен гөрі тұрақтылыққа фокус жасаңыз.")
        return tips[:4]
    if lang == "en":
        tips = [
            "Finish at least one priority task every day.",
            "Start with two tasks that have the nearest deadlines.",
            "Plan the next day in a 10-minute evening review.",
        ]
        if overdue_open_tasks > 0:
            tips.insert(0, "Close one overdue task first.")
        if risk_score >= 70:
            tips.append("Reduce scope and focus on consistency over volume.")
        return tips[:4]
    tips = [
        "Закрывайте минимум одну приоритетную задачу в день.",
        "Начинайте с двух задач с ближайшим дедлайном.",
        "Планируйте следующий день за 10 минут вечером.",
    ]
    if overdue_open_tasks > 0:
        tips.insert(0, "Сначала закройте одну просроченную задачу.")
    if risk_score >= 70:
        tips.append("Снизьте объем и сделайте акцент на стабильности.")
    return tips[:4]


def _fallback_explanation(lang: str, risk_score: int, completion_velocity: float, streak_days: int) -> str:
    if lang == "kk":
        return (
            f"Тәуекел деңгейі {risk_score}/100. Күндік қарқын: {completion_velocity:.2f}."
            f" Қазіргі стрик: {streak_days} күн."
        )
    if lang == "en":
        return (
            f"Current risk is {risk_score}/100. Daily completion velocity is {completion_velocity:.2f}."
            f" Current streak is {streak_days} days."
        )
    return (
        f"Текущий риск {risk_score}/100. Дневная скорость выполнения {completion_velocity:.2f}."
        f" Текущий стрик {streak_days} дн."
    )


def build_predictive_insight(
    *,
    lang: str,
    overdue_open_tasks: int,
    completion_velocity_per_day: float,
    streak_days: int,
) -> dict[str, Any]:
    risk = _risk_score(
        overdue_open_tasks=overdue_open_tasks,
        completion_velocity=completion_velocity_per_day,
        streak_days=streak_days,
    )
    trend = _trend(streak_days, completion_velocity_per_day)
    focus = _fallback_focus(lang, overdue_open_tasks, risk)
    explanation = _fallback_explanation(lang, risk, completion_velocity_per_day, streak_days)

    settings = get_settings()
    if not settings.openai_api_key:
        return {
            "overdue_risk_score": risk,
            "streak_trend": trend,
            "next_7_days_focus": focus,
            "explanation": explanation,
        }

    try:
        from openai import OpenAI

        system = (
            "You are an assistant for user productivity predictions. "
            "Return only JSON with keys: explanation, next_7_days_focus(array of short strings)."
        )
        payload = {
            "lang": lang,
            "overdue_open_tasks": overdue_open_tasks,
            "completion_velocity_per_day": round(completion_velocity_per_day, 2),
            "streak_days": streak_days,
            "risk_score": risk,
            "trend": trend,
            "fallback_focus": focus,
            "fallback_explanation": explanation,
        }
        client_kwargs: dict[str, str] = {"api_key": settings.openai_api_key or ""}
        if settings.openai_base_url:
            client_kwargs["base_url"] = settings.openai_base_url
        client = OpenAI(**client_kwargs)
        resp = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        ai_explanation = data.get("explanation")
        ai_focus = data.get("next_7_days_focus")
        if isinstance(ai_explanation, str) and ai_explanation.strip():
            explanation = ai_explanation.strip()
        if isinstance(ai_focus, list):
            clean_focus = [str(x).strip() for x in ai_focus if str(x).strip()]
            if clean_focus:
                focus = clean_focus[:4]
    except Exception:
        logger.exception("predictive insights AI generation failed")

    return {
        "overdue_risk_score": risk,
        "streak_trend": trend,
        "next_7_days_focus": focus,
        "explanation": explanation,
    }
