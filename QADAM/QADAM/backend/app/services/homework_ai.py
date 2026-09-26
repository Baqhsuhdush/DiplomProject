import json
import logging

from app.config import get_settings

logger = logging.getLogger(__name__)


def grade_homework(*, task_title: str, goal_title: str, text: str | None) -> tuple[str | None, int | None]:
    settings = get_settings()
    if not settings.openai_api_key or not text or len(text.strip()) < 5:
        return None, None
    system = (
        "You are Qadam tutor. Return ONLY JSON: "
        '{"feedback":"short Russian feedback","grade":0-100 integer} '
        "Grade completeness and clarity for a learning homework."
    )
    user = json.dumps(
        {"goal": goal_title, "task": task_title, "submission": text[:8000]},
        ensure_ascii=False,
    )
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
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        fb = data.get("feedback")
        gr = data.get("grade")
        if isinstance(fb, str) and isinstance(gr, int):
            return fb[:8000], max(0, min(100, int(gr)))
        return None, None
    except Exception:
        logger.exception("homework AI grading failed")
        return None, None
