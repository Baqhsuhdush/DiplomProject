"use client";

import { useCallback, useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type {
  HabitPublic,
  MonthlyReportPublic,
  PredictiveInsightPublic,
  ProgressLogItemPublic,
  ProgressChartsPublic,
  ProgressOverviewPublic,
  ProgressRecommendationsPublic,
  LeaderboardPublic,
  WeeklyReportPublic,
} from "@/lib/qadam-types";

function barHeightPx(value: number, max: number, capPx: number): number {
  if (max <= 0) return 4;
  return Math.max(4, Math.round((value / max) * capPx));
}

function eventMetaByLang(eventType: string, payload: Record<string, unknown> | null | undefined, lang: "kk" | "ru" | "en"): string | null {
  if (!payload) return null;
  if (eventType === "task_completed") {
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    return title ? title : null;
  }
  if (eventType === "assessment_submitted") {
    const assessmentId = payload.assessment_id;
    if (assessmentId == null || assessmentId === "None" || assessmentId === "") {
      return lang === "kk" ? "Диагностика жіберілді" : lang === "en" ? "Assessment submitted" : "Диагностика отправлена";
    }
    return `${lang === "kk" ? "ID" : "ID"}: ${String(assessmentId)}`;
  }
  return null;
}

function streakTier(days: number): "amber" | "red" | "violet" {
  if (days >= 30) return "violet";
  if (days >= 7) return "red";
  return "amber";
}

function EventIcon({ type }: { type: string }) {
  if (type === "task_completed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 text-emerald-600">
        <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.2" />
        <path d="m7.5 12.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "goal_status_changed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 text-indigo-600">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5 text-amber-600">
      <path d="M7 3.5h7l5 5V20a.5.5 0 0 1-.5.5h-11A3.5 3.5 0 0 1 4 17V7A3.5 3.5 0 0 1 7.5 3.5H7Z" fill="currentColor" opacity="0.15" />
      <path d="M14 3.5v4a1 1 0 0 0 1 1h4M8 12h8M8 16h6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TinyFlameIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-3.5 w-3.5 text-emerald-600">
      <path
        d="M12 2c.5 3.2 2.8 4.8 4.1 6.8 1 1.5 1.5 2.9 1.5 4.5 0 3.8-2.6 6.6-5.6 7.7-3-1.1-5.6-3.9-5.6-7.7 0-2.2.8-3.9 2.3-5.4 1.3-1.2 2.8-2.3 3.3-4h0z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ProgressPage() {
  const { lang, t } = useI18n();
  const tokenReady = useTokenReady();
  const [overview, setOverview] = useState<ProgressOverviewPublic | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReportPublic | null>(null);
  const [monthly, setMonthly] = useState<MonthlyReportPublic | null>(null);
  const [logs, setLogs] = useState<ProgressLogItemPublic[] | null>(null);
  const [recs, setRecs] = useState<ProgressRecommendationsPublic | null>(null);
  const [habits, setHabits] = useState<HabitPublic[] | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPublic | null>(null);
  const [charts, setCharts] = useState<ProgressChartsPublic | null>(null);
  const [insight, setInsight] = useState<PredictiveInsightPublic | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [habitBusyId, setHabitBusyId] = useState<string | null>(null);
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);
  const locale = lang === "kk" ? "kk-KZ" : lang === "en" ? "en-US" : "ru-RU";
  const widgetsEnabled = process.env.NEXT_PUBLIC_PROGRESS_WIDGETS !== "0";

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const [o, w, m, l, r, h, lb, ch, pi] = await Promise.all([
        apiFetch("/api/v1/progress/overview"),
        apiFetch("/api/v1/reports/weekly"),
        apiFetch("/api/v1/reports/monthly"),
        apiFetch("/api/v1/progress/logs?limit=30"),
        apiFetch(`/api/v1/progress/recommendations?lang=${lang}`),
        widgetsEnabled ? apiFetch("/api/v1/habits") : Promise.resolve(new Response(null, { status: 204 })),
        widgetsEnabled ? apiFetch("/api/v1/leaderboard?period=weekly") : Promise.resolve(new Response(null, { status: 204 })),
        widgetsEnabled ? apiFetch("/api/v1/progress/charts") : Promise.resolve(new Response(null, { status: 204 })),
        widgetsEnabled ? apiFetch(`/api/v1/progress/predictive-insights?lang=${lang}`) : Promise.resolve(new Response(null, { status: 204 })),
      ]);
      if (!o.ok || !w.ok || !m.ok || !l.ok) {
        const bad = [o, w, m, l].find((x) => !x.ok);
        const fallback = lang === "kk" ? "Жүктеу қатесі" : lang === "en" ? "Load error" : "Ошибка загрузки";
        setErr(bad ? await friendlyApiError(bad) : fallback);
        setOverview(null);
        setWeekly(null);
        setMonthly(null);
        setLogs(null);
        setRecs(null);
        return;
      }
      setOverview((await o.json()) as ProgressOverviewPublic);
      setWeekly((await w.json()) as WeeklyReportPublic);
      setMonthly((await m.json()) as MonthlyReportPublic);
      setLogs((await l.json()) as ProgressLogItemPublic[]);
      setRecs(r.ok ? ((await r.json()) as ProgressRecommendationsPublic) : null);
      setHabits(widgetsEnabled && h.ok ? ((await h.json()) as HabitPublic[]) : null);
      setLeaderboard(widgetsEnabled && lb.ok ? ((await lb.json()) as LeaderboardPublic) : null);
      setCharts(widgetsEnabled && ch.ok ? ((await ch.json()) as ProgressChartsPublic) : null);
      setInsight(widgetsEnabled && pi.ok ? ((await pi.json()) as PredictiveInsightPublic) : null);
    } finally {
      setLoading(false);
    }
  }, [lang, widgetsEnabled]);

  useOnLoggedOut(() => {
    setOverview(null);
    setWeekly(null);
    setMonthly(null);
    setLogs(null);
    setRecs(null);
    setHabits(null);
    setLeaderboard(null);
    setCharts(null);
    setInsight(null);
    setErr(null);
    setLoading(false);
  });

  async function toggleHabitDone(habit: HabitPublic) {
    setHabitBusyId(habit.id);
    try {
      const res = await apiFetch(`/api/v1/habits/${habit.id}/check`, {
        method: "POST",
        body: JSON.stringify({ completed: !habit.completed_today }),
      });
      if (!res.ok) return;
      setHabits((prev) =>
        prev
          ? prev.map((h) =>
              h.id === habit.id
                ? {
                    ...h,
                    completed_today: !habit.completed_today,
                    current_streak_days: !habit.completed_today
                      ? h.current_streak_days + 1
                      : Math.max(0, h.current_streak_days - 1),
                  }
                : h,
            )
          : prev,
      );
    } finally {
      setHabitBusyId(null);
    }
  }

  useEffect(() => {
    if (!tokenReady) return;
    void load();
  }, [tokenReady, load]);

  const dayActivitySum = (d: { test_attempts: number; homework_submissions: number; tasks_completed?: number }) =>
    d.test_attempts + d.homework_submissions + (d.tasks_completed ?? 0);

  const weekMax =
    weekly?.days.length ? Math.max(1, ...weekly.days.map(dayActivitySum)) : 1;
  const monthMax =
    monthly?.days.length ? Math.max(1, ...monthly.days.map(dayActivitySum)) : 1;
  const streakDays = overview?.task_completion_streak_days ?? 0;
  const tier = streakTier(streakDays);
  const streakTextColor =
    tier === "amber" ? "text-emerald-600" : tier === "red" ? "text-green-700" : "text-teal-700";
  const flameColors =
    tier === "amber"
      ? { outerTop: "#6ee7b7", outerBottom: "#10b981", innerTop: "#d1fae5", innerBottom: "#34d399" }
      : tier === "red"
        ? { outerTop: "#34d399", outerBottom: "#059669", innerTop: "#a7f3d0", innerBottom: "#10b981" }
        : { outerTop: "#2dd4bf", outerBottom: "#0f766e", innerTop: "#99f6e4", innerBottom: "#14b8a6" };
  const streakHint =
    tier === "amber"
      ? tr("Начальный уровень", "Бастапқы деңгей", "Starter level")
      : tier === "red"
        ? tr("Отличный темп", "Керемет қарқын", "Great pace")
        : tr("Легендарный стрик", "Аңыз стрик", "Legendary streak");

  function eventLabelByLang(eventType: string): string {
    const labels: Record<string, string> = {
      task_completed: tr("Задача выполнена", "Тапсырма орындалды", "Task completed"),
      goal_status_changed: tr("Статус цели", "Мақсат күйі", "Goal status"),
      assessment_submitted: tr("Диагностика отправлена", "Диагностика жіберілді", "Assessment submitted"),
    };
    return labels[eventType] ?? eventType;
  }

  const statusLabel = (raw: string) => {
    const v = raw.toLowerCase();
    if (v === "pending") return lang === "kk" ? "Күтілуде" : lang === "en" ? "Pending" : "В ожидании";
    if (v === "completed") return lang === "kk" ? "Орындалды" : lang === "en" ? "Completed" : "Готово";
    if (v === "in_progress") return lang === "kk" ? "Орындалуда" : lang === "en" ? "In progress" : "В работе";
    return raw;
  };
  const statusTotals = overview ? Object.values(overview.tasks_by_status).reduce((acc, x) => acc + x, 0) : 0;
  const completedCount = overview?.tasks_by_status.completed ?? 0;
  const completionPct = statusTotals > 0 ? Math.round((completedCount / statusTotals) * 100) : 0;
  const nextMilestone = recs?.next_milestone ?? (streakDays < 7 ? 7 : streakDays < 30 ? 30 : 60);
  const streakToGo = recs?.streak_to_go ?? Math.max(0, nextMilestone - streakDays);
  const smartTips = [
    ...(recs?.tips ?? []),
    ...(recs ? [] : [overview && overview.overdue_open_tasks > 0 ? t("progress.tipOverdue") : null]),
    ...(recs ? [] : [t("progress.tipStreak")]),
    ...(recs ? [] : [completionPct < 60 ? t("progress.tipFocus") : t("progress.tipGreat")]),
  ].filter(Boolean).slice(0, 4) as string[];

  return (
    <AuthGate title={t("progress.title")}>
      <div className="mx-auto max-w-5xl px-4 py-6 text-zinc-100">
        <div className="sticky top-0 z-20 mb-4 rounded-xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">{t("progress.title")}</h1>
            <p className="text-xs font-medium text-zinc-500">{t("progress.generatedAt")} {new Date().toLocaleString(locale)}</p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="mt-3 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {loading ? t("common.loading") : t("common.update")}
          </button>
        </div>
        {err ? <p className="mt-4 text-sm text-rose-500">{err}</p> : null}
        {loading && !overview ? <p className="mt-6 text-sm text-zinc-600">{t("common.loading")}</p> : null}

        {overview ? (
          <section className="mt-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">{t("progress.overview")}</h2>
            <p className="mt-1 text-xs text-zinc-500">
              {t("progress.generatedAt")} {new Date(overview.generated_at).toLocaleString(locale)}
            </p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow">
                <dt className="text-zinc-600">{t("progress.goals")}</dt>
                <dd className="mt-2 text-2xl font-extrabold text-zinc-900">
                  {overview.goals_active} <span className="text-sm font-medium text-zinc-600">/ {overview.goals_total}</span>
                </dd>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow">
                <dt className="text-zinc-600">{t("progress.tasks")}</dt>
                <dd className="mt-2 text-2xl font-extrabold text-zinc-900">{overview.tasks_total}</dd>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow">
                <dt className="text-rose-700">{t("progress.overdueOpen")}</dt>
                <dd className="mt-2 text-2xl font-extrabold text-rose-700">{overview.overdue_open_tasks}</dd>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow sm:col-span-2 xl:col-span-1">
                <dt className="text-zinc-600">{t("progress.streak")}</dt>
                <dd className="mt-2 flex items-center gap-3">
                  <svg viewBox="0 0 64 64" className="h-10 w-8 shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.22)]" aria-hidden="true">
                    <defs>
                      <linearGradient id="streak-flame-outer" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={flameColors.outerTop} />
                        <stop offset="100%" stopColor={flameColors.outerBottom} />
                      </linearGradient>
                      <linearGradient id="streak-flame-inner" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={flameColors.innerTop} />
                        <stop offset="100%" stopColor={flameColors.innerBottom} />
                      </linearGradient>
                    </defs>
                    <path
                      d="M33 2c1 9 8 12 12 19 4 6 6 11 6 17 0 13-9 22-20 24-11-2-20-11-20-24 0-8 3-14 9-20 5-4 10-8 12-16h1z"
                      fill="url(#streak-flame-outer)"
                    />
                    <path
                      d="M32 16c0 7 5 10 8 14 3 4 4 8 4 12 0 8-5 13-12 16-7-3-12-8-12-16 0-5 2-9 6-12 3-2 5-5 6-9z"
                      fill="url(#streak-flame-inner)"
                      opacity="0.95"
                    />
                  </svg>
                  <div className="leading-tight">
                    <p className={`text-3xl font-extrabold ${streakTextColor}`}>{streakDays}</p>
                    <p className="text-sm font-semibold text-zinc-900">{t("progress.daysInRow")}</p>
                  </div>
                  <p className="text-xs text-zinc-500">{streakHint}</p>
                </dd>
              </div>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow sm:col-span-2 xl:col-span-2">
                <dt className="text-zinc-600">{t("progress.last7days")}</dt>
                <dd className="mt-2 text-sm text-zinc-800">
                  {t("progress.tasksDone")}: <b>{overview.tasks_completed_last_7_days ?? 0}</b> · {t("progress.tests")}: <b>{overview.tests_attempts_last_7_days}</b> · {t("progress.homework")}: <b>{overview.homework_submissions_last_7_days}</b>
                </dd>
              </div>
            </dl>
            <div className="mt-5 border-t border-zinc-200 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">{t("progress.tasksByStatus")}</p>
                <span className="text-xs font-semibold text-emerald-700">{completionPct}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-zinc-200">
                <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${completionPct}%` }} />
              </div>
              <ul className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
                {Object.entries(overview.tasks_by_status).map(([k, v]) => (
                  <li key={k} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-zinc-700 shadow-sm">
                    <span className="font-semibold text-zinc-800">{statusLabel(k)}</span>
                    <span className="ml-2 font-bold text-zinc-900">{v}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {widgetsEnabled ? (
          <section className="mt-6 grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                {tr("Ежедневные habits", "Күнделікті habits", "Daily habits")}
              </h2>
              {habits && habits.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {habits.map((h) => (
                    <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                      <label className="flex items-center gap-2 text-sm text-zinc-800">
                        <input
                          type="checkbox"
                          checked={h.completed_today}
                          disabled={habitBusyId === h.id}
                          onChange={() => void toggleHabitDone(h)}
                        />
                        <span>{h.title}</span>
                      </label>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <TinyFlameIcon />
                        {h.current_streak_days}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">
                  {tr("Пока привычек нет", "Әзірге әдеттер жоқ", "No habits yet")}
                </p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                {tr("Leaderboard (неделя)", "Leaderboard (апта)", "Leaderboard (week)")}
              </h2>
              {leaderboard?.rows?.length ? (
                <ul className="mt-3 space-y-2 text-xs">
                  {leaderboard.rows.slice(0, 5).map((r) => (
                    <li key={r.user_id} className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5">
                      <span className="font-semibold text-zinc-700">#{r.rank}</span>
                      <span className="font-mono text-zinc-500">{r.user_id.slice(0, 8)}</span>
                      <span className="font-bold text-zinc-900">{r.score}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">{tr("Пока нет данных", "Әзірге дерек жоқ", "No data yet")}</p>
              )}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-1">
              <h2 className="text-sm font-semibold text-zinc-900">
                {tr("Прогноз и фокус", "Болжам және фокус", "Prediction and focus")}
              </h2>
              {insight ? (
                <>
                  <p className="mt-2 text-xs text-zinc-700">
                    {tr("Риск", "Тәуекел", "Risk")}: <b>{insight.overdue_risk_score}/100</b> ·{" "}
                    {tr("Скорость", "Қарқын", "Velocity")}: <b>{insight.completion_velocity_per_day.toFixed(2)}</b>
                  </p>
                  <p className="mt-2 text-xs text-zinc-600">{insight.explanation}</p>
                  <ul className="mt-2 space-y-1 text-xs text-zinc-700">
                    {insight.next_7_days_focus.map((tip, i) => (
                      <li key={`${i}-${tip}`}>• {tip}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-3 text-xs text-zinc-500">{tr("Пока нет прогноза", "Әзірге болжам жоқ", "No prediction yet")}</p>
              )}
            </div>
          </section>
        ) : null}

        {widgetsEnabled && charts ? (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">
              {tr("Графики (14 дней)", "Графиктер (14 күн)", "Charts (14 days)")}
            </h2>
            <div className="mt-3 grid gap-4 md:grid-cols-2">
              {[{ title: tr("Выполненные задачи", "Орындалған тапсырмалар", "Completed tasks"), points: charts.completion_series }, { title: tr("Выполненные habits", "Орындалған habits", "Completed habits"), points: charts.habits_series }].map((chart) => {
                const max = Math.max(1, ...chart.points.map((p) => p.value));
                return (
                  <div key={chart.title} className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <p className="text-xs font-semibold text-zinc-700">{chart.title}</p>
                    <div className="mt-2 flex h-24 items-end gap-1">
                      {chart.points.map((p) => (
                        <div key={p.date} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                          <div
                            className="w-full rounded-t bg-emerald-500"
                            style={{ height: `${Math.max(6, Math.round((p.value / max) * 76))}px` }}
                            title={`${p.date}: ${p.value}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {logs ? (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">{t("progress.events")}</h2>
            {logs.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">{t("progress.noEvents")}</p>
            ) : (
              <ul className="mt-4 space-y-3 text-sm">
                {logs.map((log) => {
                  const meta = eventMetaByLang(log.event_type, log.payload, lang);
                  const tone =
                    log.event_type === "task_completed"
                      ? "border-emerald-200 bg-emerald-50"
                      : log.event_type === "goal_status_changed"
                        ? "border-indigo-200 bg-indigo-50"
                        : "border-amber-200 bg-amber-50";
                  return (
                    <li key={log.id} className={`rounded-lg border p-3 ${tone}`}>
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 shrink-0">
                          <EventIcon type={log.event_type} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-zinc-900">{eventLabelByLang(log.event_type)}</p>
                          <p className="mt-0.5 text-xs text-zinc-600">{new Date(log.created_at).toLocaleString(locale)}</p>
                          {meta ? <p className="mt-1 truncate text-xs text-zinc-700">{meta}</p> : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {overview ? (
          <section className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-emerald-800">{t("progress.motivationTitle")}</h2>
              <p className="mt-2 text-sm text-emerald-900">
                {t("progress.nextMilestone")}: <span className="font-extrabold">{nextMilestone}</span>
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {streakToGo > 0
                  ? tr(
                      `До следующего уровня: ${streakToGo} дней`,
                      `Келесі деңгейге дейін: ${streakToGo} күн`,
                      `${streakToGo} days to next level`,
                    )
                  : tr("Вы на максимальном уровне!", "Сіз ең жоғары деңгейдесіз!", "You are on the top level!")}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">{t("progress.aiTipsTitle")}</h2>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                {smartTips.map((tip, i) => (
                  <li key={`${i}-${tip}`} className="flex items-start gap-2">
                    <span className="mt-0.5 text-emerald-600">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {weekly ? (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">{t("progress.week")}</h2>
            <p className="mt-1 text-xs text-zinc-600">
              {t("progress.period")}: {weekly.period_start} — {weekly.period_end}
            </p>
            <div className="mt-4 flex h-36 items-end gap-1 border-b border-zinc-200 pb-1">
              {weekly.days.map((d) => {
                const sum = dayActivitySum(d);
                const h = barHeightPx(sum, weekMax, 120);
                return (
                  <div key={d.date} className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-end gap-1">
                    <div
                      className="w-full max-w-[2.5rem] rounded-t bg-gradient-to-t from-indigo-600 to-emerald-500"
                      style={{ height: `${h}px` }}
                      title={`${d.date}: ${t("progress.tasks")} ${d.tasks_completed ?? 0}, ${t("progress.tests")} ${d.test_attempts}, ${t("progress.homework")} ${d.homework_submissions}`}
                    />
                    <span className="truncate text-[10px] text-zinc-500">{d.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-zinc-600">
              {t("progress.summary")}: {t("progress.tasks")} {weekly.totals.tasks_completed ?? 0}, {t("progress.tests")} {weekly.totals.test_attempts ?? 0}, {t("progress.homework")}{" "}
              {weekly.totals.homework_submissions ?? 0}
            </p>
          </section>
        ) : null}

        {monthly ? (
          <section className="mt-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-800">{t("progress.month")}</h2>
            <p className="mt-1 text-xs text-zinc-600">
              {monthly.period_start} — {monthly.period_end}
            </p>
            <div className="mt-4 max-h-48 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
              <div className="flex flex-wrap gap-1">
                {monthly.days.map((d) => {
                  const sum = dayActivitySum(d);
                  const h = barHeightPx(sum, monthMax, 28);
                  return (
                    <div
                      key={d.date}
                      className="flex h-10 w-6 flex-col items-center justify-end rounded-sm bg-zinc-200 px-0.5 pt-1"
                      title={`${d.date}: ${t("progress.tasks")} ${d.tasks_completed ?? 0}, ${t("progress.tests")} ${d.test_attempts}, ${t("progress.homework")} ${d.homework_submissions}`}
                    >
                      <div
                        className="w-full rounded-sm bg-emerald-600"
                        style={{ height: `${h}px` }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-600">
              {t("progress.summary")}: {t("progress.tasks")} {monthly.totals.tasks_completed ?? 0}, {t("progress.tests")} {monthly.totals.test_attempts ?? 0}, {t("progress.homework")}{" "}
              {monthly.totals.homework_submissions ?? 0}
            </p>
          </section>
        ) : null}
      </div>
    </AuthGate>
  );
}
