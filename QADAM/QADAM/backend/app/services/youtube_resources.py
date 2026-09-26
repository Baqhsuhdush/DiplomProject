import logging
from urllib.parse import quote
from uuid import UUID

import httpx
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models.goal import Goal
from app.models.learning_resource import LearningResource
from app.models.roadmap import Task

logger = logging.getLogger(__name__)

MAX_RESULTS = 5


def _search_query(db: Session, task: Task) -> str:
    goal = db.get(Goal, task.goal_id)
    goal_part = goal.title if goal else ""
    q = f"{goal_part} {task.title}".strip()
    return q[:200] if q else task.title[:200]


def _youtube_api_search(api_key: str, q: str) -> list[dict[str, str | None]]:
    url = "https://www.googleapis.com/youtube/v3/search"
    params = {
        "part": "snippet",
        "type": "video",
        "maxResults": 1,
        "q": q,
        "key": api_key,
        "safeSearch": "moderate",
    }
    resp = httpx.get(url, params=params, timeout=25.0)
    resp.raise_for_status()
    data = resp.json()
    out: list[dict[str, str | None]] = []
    for item in data.get("items", []):
        if not isinstance(item, dict):
            continue
        vid = item.get("id", {})
        video_id = vid.get("videoId") if isinstance(vid, dict) else None
        sn = item.get("snippet", {})
        snippet = sn if isinstance(sn, dict) else {}
        title = snippet.get("title") or "YouTube"
        if not video_id:
            continue
        out.append(
            {
                "url": f"https://www.youtube.com/watch?v={video_id}",
                "title": str(title)[:500],
                "language": snippet.get("defaultLanguage") if isinstance(snippet.get("defaultLanguage"), str) else None,
                "source": "youtube",
            }
        )
    return out


def replace_resources_for_task(db: Session, task: Task) -> list[LearningResource]:
    settings = get_settings()
    q = _search_query(db, task)

    db.execute(delete(LearningResource).where(LearningResource.task_id == task.id))

    rows: list[LearningResource] = []
    key = settings.youtube_api_key
    if key:
        try:
            items = _youtube_api_search(key, q)
            for it in items:
                rows.append(
                    LearningResource(
                        task_id=task.id,
                        source=str(it["source"]),
                        url=str(it["url"]),
                        title=str(it["title"]),
                        language=it.get("language"),
                        duration_min=None,
                    )
                )
        except Exception:
            logger.exception("YouTube Data API failed, using search fallback")
            rows.clear()

    if not rows:
        search_url = f"https://www.youtube.com/results?search_query={quote(q)}"
        title = f"Поиск на YouTube: {q[:120]}"
        source = "youtube_search"
        rows.append(
            LearningResource(
                task_id=task.id,
                source=source,
                url=search_url,
                title=title,
                language=None,
                duration_min=None,
            )
        )

    db.add_all(rows)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def list_resources(db: Session, *, task_id: UUID) -> list[LearningResource]:
    return list(
        db.scalars(
            select(LearningResource)
            .where(LearningResource.task_id == task_id)
            .order_by(LearningResource.created_at.asc())
        ).all()
    )
