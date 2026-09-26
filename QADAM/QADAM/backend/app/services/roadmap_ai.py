import json
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.models.assessment import Assessment
from app.models.goal import Goal
from app.models.roadmap import Roadmap, RoadmapStep, Task
from app.schemas.roadmap import RoadmapPublic, RoadmapStepPublic, TaskPublic

logger = logging.getLogger(__name__)


class GeneratedSubtask(BaseModel):
    title: str = Field(..., min_length=1, max_length=500)
    task_type: str = Field(default="learn", max_length=32)
    day_offset: int = Field(default=0, ge=0, le=730)

    @field_validator("task_type")
    @classmethod
    def normalize_type(cls, v: str) -> str:
        allowed = {"learn", "practice", "test", "homework", "review", "other"}
        key = (v or "learn").strip().lower()
        return key if key in allowed else "other"


class GeneratedStep(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=8000)
    estimated_days: int | None = Field(default=None)
    tasks: list[GeneratedSubtask] = Field(default_factory=list)


class GeneratedRoadmap(BaseModel):
    steps: list[GeneratedStep] = Field(default_factory=list)


def _template_roadmap(domain: str, goal_title: str, lang: str = "ru") -> GeneratedRoadmap:
    if lang in {"kk", "en"}:
        if lang == "kk":
            return GeneratedRoadmap(
                steps=[
                    GeneratedStep(
                        title="Мақсатты нақтылау",
                        description=f"Нақты нәтиже мен өлшемдерді бекіту: {goal_title}",
                        estimated_days=3,
                        tasks=[
                            GeneratedSubtask(title="Табыстың өлшемін анықтау", task_type="practice", day_offset=0),
                            GeneratedSubtask(title="Апталық кесте құру", task_type="homework", day_offset=1),
                        ],
                    ),
                    GeneratedStep(
                        title="Негізгі оқу және практика",
                        description="Күнделікті шағын қадамдар арқылы дағды қалыптастыру.",
                        estimated_days=21,
                        tasks=[
                            GeneratedSubtask(title="Практика блогы №1", task_type="practice", day_offset=0),
                            GeneratedSubtask(title="Аралық тексеру", task_type="review", day_offset=6),
                        ],
                    ),
                    GeneratedStep(
                        title="Нәтижені бекіту",
                        description="Нәтижені тексеру, қорытынды және келесі қадам.",
                        estimated_days=7,
                        tasks=[
                            GeneratedSubtask(title="Қорытынды тест/тексеру", task_type="test", day_offset=0),
                        ],
                    ),
                ]
            )
        return GeneratedRoadmap(
            steps=[
                GeneratedStep(
                    title="Clarify the goal",
                    description=f"Define target outcome and metrics: {goal_title}",
                    estimated_days=3,
                    tasks=[
                        GeneratedSubtask(title="Define success criteria", task_type="practice", day_offset=0),
                        GeneratedSubtask(title="Set weekly schedule", task_type="homework", day_offset=1),
                    ],
                ),
                GeneratedStep(
                    title="Core learning and practice",
                    description="Build momentum with daily focused actions.",
                    estimated_days=21,
                    tasks=[
                        GeneratedSubtask(title="Practice block #1", task_type="practice", day_offset=0),
                        GeneratedSubtask(title="Weekly review", task_type="review", day_offset=6),
                    ],
                ),
                GeneratedStep(
                    title="Consolidate results",
                    description="Validate progress and prepare next iteration.",
                    estimated_days=7,
                    tasks=[
                        GeneratedSubtask(title="Final checkpoint test", task_type="test", day_offset=0),
                    ],
                ),
            ]
        )

    domain = domain.lower()
    if domain == "programming":
        steps = [
            GeneratedStep(
                title="Основы HTML и семантика",
                description="Структура страницы, доступность, базовые теги.",
                estimated_days=5,
                tasks=[
                    GeneratedSubtask(title="Посмотреть YouTube-видео: вводный модуль HTML", task_type="learn", day_offset=0),
                    GeneratedSubtask(title="Сверстать одностраничный профиль", task_type="practice", day_offset=2),
                ],
            ),
            GeneratedStep(
                title="CSS и адаптивная вёрстка",
                description="Flexbox, Grid, медиазапросы.",
                estimated_days=7,
                tasks=[
                    GeneratedSubtask(title="Посмотреть разбор Flexbox и Grid на YouTube", task_type="learn", day_offset=0),
                    GeneratedSubtask(title="Сделать адаптивную сетку под макет", task_type="practice", day_offset=3),
                ],
            ),
            GeneratedStep(
                title="JavaScript основы",
                description="Типы, функции, DOM, асинхронность.",
                estimated_days=10,
                tasks=[
                    GeneratedSubtask(title="Решить 20 задач на основы JS", task_type="practice", day_offset=0),
                    GeneratedSubtask(title="Мини-проект: todo на чистом JS", task_type="homework", day_offset=5),
                ],
            ),
            GeneratedStep(
                title="Git и рабочий процесс",
                description="Ветки, PR, code review.",
                estimated_days=3,
                tasks=[
                    GeneratedSubtask(title="Оформить учебный репозиторий с ветками", task_type="practice", day_offset=0),
                ],
            ),
            GeneratedStep(
                title="React и экосистема",
                description="Компоненты, состояние, роутинг.",
                estimated_days=14,
                tasks=[
                    GeneratedSubtask(title="Посмотреть вводный видео-курс по React", task_type="learn", day_offset=0),
                    GeneratedSubtask(title="Собрать SPA с роутингом", task_type="homework", day_offset=7),
                ],
            ),
            GeneratedStep(
                title="Портфолио и подготовка к интервью",
                description=f"Связать навыки с целью: {goal_title}",
                estimated_days=10,
                tasks=[
                    GeneratedSubtask(title="Оформить README и деплой демо", task_type="practice", day_offset=0),
                    GeneratedSubtask(title="Список типовых вопросов и ответы", task_type="review", day_offset=4),
                ],
            ),
        ]
        return GeneratedRoadmap(steps=steps)

    if domain == "english":
        steps = [
            GeneratedStep(
                title="Диагностика и план уровня",
                description="Грамматика, лексика, навыки говорения/аудирования.",
                estimated_days=7,
                tasks=[
                    GeneratedSubtask(title="Посмотреть YouTube-видео по теме и выписать 30 слов", task_type="learn", day_offset=0),
                    GeneratedSubtask(title="Speaking: 10 минут записи темы", task_type="practice", day_offset=2),
                ],
            ),
            GeneratedStep(
                title="Интенсив speaking/listening",
                description="Подкасты, теневое повторение.",
                estimated_days=14,
                tasks=[
                    GeneratedSubtask(title="3 YouTube-видео с субтитрами", task_type="learn", day_offset=0),
                    GeneratedSubtask(title="Эссе 150 слов", task_type="homework", day_offset=5),
                ],
            ),
            GeneratedStep(
                title="Экзаменационный формат",
                description="IELTS/TOEFL/интервью — по цели.",
                estimated_days=14,
                tasks=[
                    GeneratedSubtask(title="Пробный тест на время", task_type="test", day_offset=0),
                ],
            ),
        ]
        return GeneratedRoadmap(steps=steps)

    if domain == "sport":
        steps = [
            GeneratedStep(
                title="База: движение и привычки",
                description="Шаги, сон, вода, разминка.",
                estimated_days=7,
                tasks=[
                    GeneratedSubtask(title="3 тренировки + отчёт", task_type="practice", day_offset=0),
                    GeneratedSubtask(title="Дневник сна на неделю", task_type="homework", day_offset=2),
                ],
            ),
            GeneratedStep(
                title="Прогрессия нагрузки",
                description="План по неделям с контролем объёма.",
                estimated_days=21,
                tasks=[
                    GeneratedSubtask(title="Недельный план тренировок", task_type="learn", day_offset=0),
                ],
            ),
        ]
        return GeneratedRoadmap(steps=steps)

    steps = [
        GeneratedStep(
            title="Старт: уточнение цели и метрик",
            description=f"Цель: {goal_title}",
            estimated_days=3,
            tasks=[
                GeneratedSubtask(title="Сформулировать критерий успеха", task_type="practice", day_offset=0),
                GeneratedSubtask(title="Недельный ритм и время в календаре", task_type="homework", day_offset=1),
            ],
        ),
        GeneratedStep(
            title="Основной цикл обучения/действий",
            description="Пошаговое движение к результату.",
            estimated_days=21,
            tasks=[
                GeneratedSubtask(title="Блок практики #1", task_type="practice", day_offset=0),
                GeneratedSubtask(title="Ретроспектива недели", task_type="review", day_offset=6),
            ],
        ),
        GeneratedStep(
            title="Закрепление и проверка",
            description="Тест, отчёт, корректировка плана.",
            estimated_days=7,
            tasks=[
                GeneratedSubtask(title="Итоговый чек-лист прогресса", task_type="test", day_offset=0),
            ],
        ),
    ]
    return GeneratedRoadmap(steps=steps)


def _call_openai(goal: Goal, assessment: Assessment | None, lang: str = "ru") -> GeneratedRoadmap | None:
    settings = get_settings()
    if not settings.openai_api_key:
        return None

    assessment_blob: dict[str, Any] = assessment.answers if assessment else {}
    language_hint = "Kazakh language" if lang == "kk" else "English language" if lang == "en" else "Russian language"
    system = (
        "You are Qadam, an expert learning and goal coach. "
        "Return ONLY valid JSON with this shape: "
        '{"steps":[{"title":"string","description":"string","estimated_days":number|null,'
        '"tasks":[{"title":"string","task_type":"learn|practice|test|homework|review|other",'
        '"day_offset":number}]}]} . '
        "Use 4–10 steps in logical order. Each step should have 1–4 tasks. "
        "Prefer video-first learning tasks (YouTube/watch/explain from video) over reading-book tasks. "
        "Use concrete watch-and-practice actions. "
        f"day_offset is days from today (0 = today). Keep text concise, {language_hint}."
    )
    user_msg = json.dumps(
        {
            "goal_title": goal.title,
            "domain": goal.domain,
            "target_date": goal.target_date.isoformat() if goal.target_date else None,
            "priority": goal.priority,
            "assessment": assessment_blob,
        },
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
                {"role": "user", "content": user_msg},
            ],
            response_format={"type": "json_object"},
            temperature=0.4,
        )
        raw = resp.choices[0].message.content or "{}"
        data = json.loads(raw)
        return GeneratedRoadmap.model_validate(data)
    except Exception:
        logger.exception("OpenAI roadmap generation failed, using template")
        return None


def _latest_assessment(db: Session, goal_id: UUID) -> Assessment | None:
    return db.scalar(
        select(Assessment)
        .where(Assessment.goal_id == goal_id)
        .order_by(Assessment.created_at.desc())
        .limit(1)
    )


def build_plan(db: Session, goal: Goal, *, lang: str = "ru") -> GeneratedRoadmap:
    norm_lang = lang if lang in {"kk", "ru", "en"} else "ru"
    latest = _latest_assessment(db, goal.id)
    plan = _call_openai(goal, latest, norm_lang)
    if plan is not None and plan.steps:
        return plan
    return _template_roadmap(goal.domain, goal.title, norm_lang)


def persist_roadmap(db: Session, *, user_id: UUID, goal: Goal, plan: GeneratedRoadmap) -> Roadmap:
    db.execute(
        update(Roadmap)
        .where(Roadmap.goal_id == goal.id, Roadmap.status == "active")
        .values(status="archived")
    )
    next_version = db.scalar(select(func.coalesce(func.max(Roadmap.version), 0)).where(Roadmap.goal_id == goal.id))
    ver = int(next_version or 0) + 1

    roadmap = Roadmap(goal_id=goal.id, user_id=user_id, version=ver, status="active")
    db.add(roadmap)
    db.flush()

    now = datetime.now(UTC)
    for idx, step in enumerate(plan.steps, start=1):
        row = RoadmapStep(
            roadmap_id=roadmap.id,
            sequence_no=idx,
            title=step.title.strip(),
            description=(step.description or "").strip() or None,
            estimated_days=step.estimated_days,
        )
        db.add(row)
        db.flush()
        for t in step.tasks:
            due = now + timedelta(days=int(t.day_offset))
            db.add(
                Task(
                    user_id=user_id,
                    goal_id=goal.id,
                    roadmap_step_id=row.id,
                    title=t.title.strip(),
                    task_type=t.task_type,
                    due_at=due,
                    status="pending",
                )
            )

    db.commit()
    db.refresh(roadmap)
    return roadmap


def load_roadmap_detail(db: Session, *, goal_id: UUID, user_id: UUID) -> Roadmap | None:
    stmt = (
        select(Roadmap)
        .options(selectinload(Roadmap.steps).selectinload(RoadmapStep.tasks))
        .where(Roadmap.goal_id == goal_id, Roadmap.user_id == user_id, Roadmap.status == "active")
    )
    return db.scalars(stmt).first()


def serialize_roadmap(rm: Roadmap) -> RoadmapPublic:
    steps_sorted = sorted(rm.steps, key=lambda s: s.sequence_no)
    step_publics: list[RoadmapStepPublic] = []
    for s in steps_sorted:
        tasks_sorted = sorted(s.tasks, key=lambda t: ((t.due_at or t.created_at), t.title))
        step_publics.append(
            RoadmapStepPublic(
                id=s.id,
                sequence_no=s.sequence_no,
                title=s.title,
                description=s.description,
                estimated_days=s.estimated_days,
                tasks=[TaskPublic.model_validate(t) for t in tasks_sorted],
            )
        )
    return RoadmapPublic(
        id=rm.id,
        goal_id=rm.goal_id,
        user_id=rm.user_id,
        version=rm.version,
        status=rm.status,
        created_at=rm.created_at,
        steps=step_publics,
    )
