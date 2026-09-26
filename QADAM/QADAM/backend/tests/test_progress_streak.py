from datetime import date, timedelta

from app.services.progress_stats import completion_streak_from_active_days


def test_streak_zero_when_gap() -> None:
    today = date(2026, 4, 28)
    active = {today - timedelta(days=3)}
    assert completion_streak_from_active_days(active, today) == 0


def test_streak_from_today() -> None:
    today = date(2026, 4, 28)
    active = {today, today - timedelta(days=1), today - timedelta(days=2)}
    assert completion_streak_from_active_days(active, today) == 3


def test_streak_grace_yesterday() -> None:
    """Сегодня без закрытий, вчера и позавчера были — стрик с вчера."""
    today = date(2026, 4, 28)
    active = {today - timedelta(days=1), today - timedelta(days=2)}
    assert completion_streak_from_active_days(active, today) == 2
