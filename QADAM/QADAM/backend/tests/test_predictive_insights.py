from app.services import predictive_insights


class _SettingsStub:
    openai_api_key = None
    openai_model = "gpt-4o-mini"
    openai_base_url = None


def test_predictive_insight_fallback_shape(monkeypatch) -> None:
    monkeypatch.setattr(predictive_insights, "get_settings", lambda: _SettingsStub())
    out = predictive_insights.build_predictive_insight(
        lang="kk",
        overdue_open_tasks=2,
        completion_velocity_per_day=0.7,
        streak_days=1,
    )
    assert isinstance(out["overdue_risk_score"], int)
    assert out["streak_trend"] in {"up", "stable", "down"}
    assert isinstance(out["next_7_days_focus"], list)
    assert out["next_7_days_focus"]
    assert isinstance(out["explanation"], str)
    assert out["explanation"]


def test_risk_score_bounds() -> None:
    risk_low = predictive_insights._risk_score(overdue_open_tasks=0, completion_velocity=2.0, streak_days=10)
    risk_high = predictive_insights._risk_score(overdue_open_tasks=5, completion_velocity=0.1, streak_days=0)
    assert 0 <= risk_low <= 100
    assert 0 <= risk_high <= 100
    assert risk_high > risk_low
