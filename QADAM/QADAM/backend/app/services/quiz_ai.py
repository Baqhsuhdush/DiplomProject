import json
import logging
import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.goal import Goal
from app.models.learning_resource import LearningResource
from app.models.roadmap import Task

logger = logging.getLogger(__name__)


def _template_quiz(topic: str, lang: str) -> dict[str, Any]:
    base = topic[:200] if topic else ("тақырып" if lang == "kk" else "topic" if lang == "en" else "тема")
    if lang == "kk":
        return {
            "passing_score": 60,
            "questions": [
                {
                    "id": "q1",
                    "type": "mcq",
                    "prompt": f"«{base}» мақсатын қоюда ең алдымен нені нақтылау керек?",
                    "options": ["Мерзім", "Тек атау", "Тек мотивация", "Тек құралдар"],
                    "correct_index": 0,
                },
                {
                    "id": "q2",
                    "type": "mcq",
                    "prompt": "Roadmap алдында диагностика не үшін керек?",
                    "options": [
                        "Бастапқы деңгейді түсіну үшін",
                        "Бастауды кейінге қалдыру үшін",
                        "Дедлайнды алып тастау үшін",
                        "Оқымай қою үшін",
                    ],
                    "correct_index": 0,
                },
                {
                    "id": "q3",
                    "type": "mcq",
                    "prompt": "Оқудағы MVP деген не?",
                    "options": [
                        "Қысқа циклдегі минималды пайдалы нәтиже",
                        "Тәжірибесіз тек теория",
                        "Тек видео, тапсырмасыз",
                        "Тек сертификат",
                    ],
                    "correct_index": 0,
                },
                {
                    "id": "q4",
                    "type": "mcq",
                    "prompt": "Сабақтан кейін дағдыны қалай бекіткен дұрыс?",
                    "options": ["Практика және қайталау", "Тек қайта оқу", "Ештеңе істемеу", "Шабыт күту"],
                    "correct_index": 0,
                },
                {
                    "id": "q5",
                    "type": "short_text",
                    "prompt": "Бір сөйлеммен: 2 аптада осы тақырып бойынша қандай нәтижеге жеткіңіз келеді?",
                    "correct_answer": None,
                },
            ],
        }
    if lang == "en":
        return {
            "passing_score": 60,
            "questions": [
                {
                    "id": "q1",
                    "type": "mcq",
                    "prompt": f"What should be clarified first when setting the goal '{base}'?",
                    "options": ["Deadline", "Only title", "Only motivation", "Only tools"],
                    "correct_index": 0,
                },
                {
                    "id": "q2",
                    "type": "mcq",
                    "prompt": "Why do we need assessment before a Roadmap?",
                    "options": [
                        "To understand the starting level",
                        "To postpone the start",
                        "To remove deadlines",
                        "To avoid learning",
                    ],
                    "correct_index": 0,
                },
                {
                    "id": "q3",
                    "type": "mcq",
                    "prompt": "What is MVP in learning?",
                    "options": [
                        "Minimum useful result in a short cycle",
                        "Theory only without practice",
                        "Videos only without tasks",
                        "Certificate only",
                    ],
                    "correct_index": 0,
                },
                {
                    "id": "q4",
                    "type": "mcq",
                    "prompt": "How to reinforce a skill after a lesson?",
                    "options": ["Practice and repetition", "Only re-read", "Do nothing", "Wait for inspiration"],
                    "correct_index": 0,
                },
                {
                    "id": "q5",
                    "type": "short_text",
                    "prompt": "In one sentence: what result do you want in 2 weeks on this topic?",
                    "correct_answer": None,
                },
            ],
        }
    return {
        "passing_score": 60,
        "questions": [
            {
                "id": "q1",
                "type": "mcq",
                "prompt": f"Что обычно первым уточняют при постановке цели «{base}»?",
                "options": ["Срок", "Только название", "Только мотивация", "Только инструменты"],
                "correct_index": 0,
            },
            {
                "id": "q2",
                "type": "mcq",
                "prompt": "Зачем нужна диагностика перед Roadmap?",
                "options": [
                    "Чтобы понять стартовый уровень",
                    "Чтобы отложить старт",
                    "Чтобы убрать дедлайны",
                    "Чтобы не учиться",
                ],
                "correct_index": 0,
            },
            {
                "id": "q3",
                "type": "mcq",
                "prompt": "Что такое MVP в обучении?",
                "options": [
                    "Минимально полезный результат за короткий цикл",
                    "Только теория без практики",
                    "Только видео без заданий",
                    "Только сертификат",
                ],
                "correct_index": 0,
            },
            {
                "id": "q4",
                "type": "mcq",
                "prompt": "Как лучше закрепить навык после урока?",
                "options": ["Практика и повторение", "Только перечитывать", "Ничего не делать", "Ждать вдохновения"],
                "correct_index": 0,
            },
            {
                "id": "q5",
                "type": "short_text",
                "prompt": "В одном предложении: какой результат вы хотите через 2 недели по этой теме?",
                "correct_answer": None,
            },
        ],
    }


def _openai_quiz(topic: str, lang: str, *, video_context: str | None = None) -> dict[str, Any]:
    settings = get_settings()
    language_hint = "Kazakh language" if lang == "kk" else "English language" if lang == "en" else "Russian language"
    context_rule = (
        "Questions MUST be based on provided video context. "
        "If video context is missing, build questions from task topic only."
    )
    system = (
        "You are Qadam. Return ONLY JSON with shape: "
        '{"passing_score":60,"questions":[{"id":"q1","type":"mcq","prompt":"...","options":["a","b","c","d"],'
        '"correct_index":0},{"id":"q2","type":"short_text","prompt":"...","correct_answer":null}]} '
        f"Use 4-6 questions, mostly mcq (4 options), 0-3 correct_index. {language_hint}. "
        f"{context_rule} Topic context will be provided by user."
    )
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
            {
                "role": "user",
                "content": (f"{topic}\n\nVideo context:\n{video_context}" if video_context else topic)[:2200],
            },
        ],
        response_format={"type": "json_object"},
        temperature=0.35,
    )
    raw = resp.choices[0].message.content or "{}"
    data = json.loads(raw)
    if "questions" not in data:
        raise ValueError("invalid quiz json")
    for q in data["questions"]:
        if "id" not in q:
            q["id"] = uuid.uuid4().hex[:10]
    if "passing_score" not in data:
        data["passing_score"] = 60
    return data


def build_quiz_for_task(db: Session, task: Task, *, lang: str = "ru") -> dict[str, Any]:
    norm_lang = lang if lang in {"kk", "ru", "en"} else "ru"
    goal = db.get(Goal, task.goal_id)
    label = "тапсырма" if norm_lang == "kk" else "task" if norm_lang == "en" else "задача"
    topic = f"{goal.title if goal else ''} — {label}: {task.title}".strip()
    latest_video = db.scalar(
        select(LearningResource)
        .where(LearningResource.task_id == task.id)
        .order_by(LearningResource.created_at.desc())
        .limit(1)
    )
    video_context = None
    if latest_video is not None:
        video_context = f"title={latest_video.title}\nurl={latest_video.url}"
    settings = get_settings()
    if settings.openai_api_key:
        try:
            return _openai_quiz(topic, norm_lang, video_context=video_context)
        except Exception:
            logger.exception("OpenAI quiz generation failed, using template")
    return _template_quiz(topic, norm_lang)
