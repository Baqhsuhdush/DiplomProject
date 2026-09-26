"use client";

import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { getAccessToken, matchesAuthStorageKey, QADAM_AUTH_CHANGED_EVENT } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type {
  PredictiveInsightPublic,
  ProgressChartsPublic,
  ProgressOverviewPublic,
} from "@/lib/qadam-types";

const POMODORO_STORAGE_KEY = "qadam:home:pomodoro";
const POMODORO_DEFAULT_SECONDS = 25 * 60;

const qadamBrandFont = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["700"],
});

export default function Home() {
  const { t, lang } = useI18n();
  const [logged, setLogged] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [todayTasks, setTodayTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [weeklyDone, setWeeklyDone] = useState<Array<{ date: string; value: number }>>([]);
  const [aiInsight, setAiInsight] = useState<string>("");
  const [nextFocus, setNextFocus] = useState<string[]>([]);
  const [nearestDeadline, setNearestDeadline] = useState<{ id: string; title: string; due_at: string } | null>(null);
  const [pomodoroSeconds, setPomodoroSeconds] = useState(POMODORO_DEFAULT_SECONDS);
  const [pomodoroRunning, setPomodoroRunning] = useState(false);
  const [pomodoroEndAt, setPomodoroEndAt] = useState<number | null>(null);
  const [pomodoroFinished, setPomodoroFinished] = useState(false);
  const [pomodoroSessionsDone, setPomodoroSessionsDone] = useState(0);
  const homeTitle =
    t("home.title") !== "home.title"
      ? t("home.title")
      : lang === "kk"
        ? "Мақсаттарды басқаруға арналған AI платформа"
        : lang === "en"
          ? "AI platform for goal management"
          : "AI-платформа управления целями";
  const homeEnter =
    t("home.enter") !== "home.enter"
      ? t("home.enter")
      : lang === "kk"
        ? "Жүйеге кіру"
        : lang === "en"
          ? "Sign in"
          : "Войти в систему";
  const quoteByLang: Record<string, string[]> = {
    kk: [
      "Кішкентай қадамдар үлкен нәтижеге әкеледі.",
      "Бүгінгі тәртіп - ертеңгі сенім.",
      "Күн сайын 1% жақсарсаң, бір жылда мүлдем басқа деңгейге шығасың.",
    ],
    en: [
      "Small steps every day create big change.",
      "Consistency beats intensity in the long run.",
      "You do not need to be perfect, only persistent.",
    ],
    ru: [
      "Маленькие шаги каждый день приводят к большим результатам.",
      "Стабильность важнее идеального старта.",
      "Лучшее время действовать - сегодня.",
    ],
  };
  const quotes = quoteByLang[lang] ?? quoteByLang.ru;
  const quoteOfDay = quotes[new Date().getDate() % quotes.length];
  const tx = (key: string, fallback: string) => {
    const v = t(key);
    return v === key ? fallback : v;
  };
  const completedToday = todayTasks.filter((task) => task.status === "completed").length;
  const openTodayTasks = todayTasks.filter((task) => task.status !== "completed");
  const dailyPercent = todayTasks.length === 0 ? 0 : Math.round((completedToday / todayTasks.length) * 100);
  const circleRadius = 42;
  const circleLength = 2 * Math.PI * circleRadius;
  const circleOffset = circleLength - (dailyPercent / 100) * circleLength;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(POMODORO_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        seconds?: number;
        running?: boolean;
        endAt?: number | null;
        sessionsDone?: number;
      };
      const storedSeconds = typeof parsed.seconds === "number" ? parsed.seconds : POMODORO_DEFAULT_SECONDS;
      const storedRunning = parsed.running === true;
      const storedEndAt = typeof parsed.endAt === "number" ? parsed.endAt : null;
      if (storedRunning && storedEndAt) {
        const left = Math.max(0, Math.ceil((storedEndAt - Date.now()) / 1000));
        setPomodoroSeconds(left);
        setPomodoroRunning(left > 0);
        setPomodoroEndAt(left > 0 ? storedEndAt : null);
      } else {
        setPomodoroSeconds(storedSeconds > 0 ? storedSeconds : POMODORO_DEFAULT_SECONDS);
      }
      setPomodoroSessionsDone(typeof parsed.sessionsDone === "number" ? parsed.sessionsDone : 0);
    } catch {
      setPomodoroSeconds(POMODORO_DEFAULT_SECONDS);
    }
  }, []);

  useEffect(() => {
    const payload = JSON.stringify({
      seconds: pomodoroSeconds,
      running: pomodoroRunning,
      endAt: pomodoroEndAt,
      sessionsDone: pomodoroSessionsDone,
    });
    window.localStorage.setItem(POMODORO_STORAGE_KEY, payload);
  }, [pomodoroSeconds, pomodoroRunning, pomodoroEndAt, pomodoroSessionsDone]);

  useEffect(() => {
    if (!pomodoroFinished) return;
    document.title = `✅ ${tx("home.focusCompleted", "Focus session completed")}`;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.06;
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // ignore browser audio restrictions
    }
    if ("Notification" in window) {
      if (Notification.permission === "granted") {
        new Notification(tx("home.focusCompleted", "Focus session completed"), {
          body: tx("home.focusCompletedBody", "Time is up. Take a short break and continue."),
        });
      } else if (Notification.permission === "default") {
        void Notification.requestPermission();
      }
    }
    return () => {
      document.title = "Qadam";
    };
  }, [pomodoroFinished]);

  useEffect(() => {
    if (!pomodoroRunning || !pomodoroEndAt) return;
    const timerId = window.setInterval(() => {
      const left = Math.max(0, Math.ceil((pomodoroEndAt - Date.now()) / 1000));
      setPomodoroSeconds(left);
      if (left <= 0) {
        setPomodoroRunning(false);
        setPomodoroEndAt(null);
        setPomodoroFinished(true);
        setPomodoroSessionsDone((prev) => prev + 1);
      }
    }, 1000);
    return () => window.clearInterval(timerId);
  }, [pomodoroRunning, pomodoroEndAt]);

  useEffect(() => {
    const sync = () => setLogged(!!getAccessToken());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (matchesAuthStorageKey(e.key)) sync();
    };
    window.addEventListener(QADAM_AUTH_CHANGED_EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(QADAM_AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!logged) {
      setStreak(null);
      setTodayTasks([]);
      setWeeklyDone([]);
      setAiInsight("");
      setNextFocus([]);
      setNearestDeadline(null);
      return;
    }
    async function loadHome() {
      const today = new Date();
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      const [overviewRes, tasksRes, chartsRes, insightsRes, dueRes] = await Promise.all([
        apiFetch("/api/v1/progress/overview"),
        apiFetch(`/api/v1/tasks?date=${new Date().toISOString().slice(0, 10)}`),
        apiFetch(`/api/v1/progress/charts`),
        apiFetch(`/api/v1/progress/predictive-insights?lang=${lang}`),
        apiFetch(
          `/api/v1/tasks?from_date=${from.toISOString().slice(0, 10)}&to_date=${new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + 30,
          )
            .toISOString()
            .slice(0, 10)}`,
        ),
      ]);
      if (overviewRes.ok) {
        const ov = (await overviewRes.json()) as ProgressOverviewPublic;
        setStreak(ov.task_completion_streak_days);
      }
      if (tasksRes.ok) {
        const rows = (await tasksRes.json()) as Array<{ id: string; title: string; status: string }>;
        setTodayTasks(rows.slice(0, 5));
      }
      if (chartsRes.ok) {
        const chart = (await chartsRes.json()) as ProgressChartsPublic;
        setWeeklyDone(chart.completion_series.slice(-7));
      }
      if (insightsRes.ok) {
        const insight = (await insightsRes.json()) as PredictiveInsightPublic;
        setAiInsight(insight.explanation);
        setNextFocus(insight.next_7_days_focus.slice(0, 2));
      }
      if (dueRes.ok) {
        const rows = (await dueRes.json()) as Array<{ id: string; title: string; due_at: string; status: string }>;
        const next = rows.find((task) => task.status !== "completed" && task.due_at);
        setNearestDeadline(next ? { id: next.id, title: next.title, due_at: next.due_at } : null);
      }
    }
    void loadHome();
  }, [logged, lang]);

  const formatPomodoro = (seconds: number) => {
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto w-full max-w-6xl px-6 py-8">
        <section className="grid w-full gap-6 lg:grid-cols-3">
          <div className="qadam-fade-up space-y-4 lg:col-span-2">
            <p className={`${qadamBrandFont.className} text-4xl font-bold tracking-tight text-emerald-700`}>
              Qadam
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
              {homeTitle}
            </h1>
            {!logged ? (
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-500"
                  href="/login"
                >
                  {homeEnter}
                </Link>
              </div>
            ) : (
              <div className="mt-6 space-y-4">
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-zinc-500">
                    {tx("home.quoteTitle", "Motivational quote")}
                  </p>
                  <p className="mt-2 text-base font-medium text-zinc-800">{quoteOfDay}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-zinc-500">{tx("home.aiInsightTitle", "AI Insight")}</p>
                  <p className="mt-2 text-sm text-zinc-800">{aiInsight || tx("home.aiLoading", "Loading AI analysis...")}</p>
                  {nextFocus.length > 0 && (
                    <ul className="mt-3 space-y-1 text-sm text-zinc-700">
                      {nextFocus.map((item) => (
                        <li key={item}>- {item}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-zinc-800">{tx("home.todayTasks", "Today's tasks")}</p>
                  {todayTasks.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-600">{tx("home.noTasks", "No tasks")}</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {todayTasks.map((task) => (
                        <li key={task.id}>
                          <Link
                            href={`/tasks/${task.id}`}
                            className="block rounded-md px-2 py-1.5 text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            {task.status === "completed" ? "✓" : "•"} {task.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-zinc-800">{tx("home.weeklyActivity", "Weekly activity")}</p>
                  <div className="mt-3 flex h-24 items-end gap-2">
                    {weeklyDone.map((bar) => {
                      const maxVal = Math.max(...weeklyDone.map((x) => x.value), 1);
                      const h = Math.max(8, Math.round((bar.value / maxVal) * 92));
                      return (
                        <div key={bar.date} className="flex flex-1 flex-col items-center justify-end gap-1">
                          <div
                            className="w-full rounded-t-md bg-emerald-500/90"
                            style={{ height: `${h}%` }}
                            title={`${bar.date}: ${bar.value}`}
                          />
                          <span className="text-[10px] text-zinc-500">{bar.date.slice(5)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {logged ? (
          <div className="qadam-fade-up space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-500">{tx("home.dailyGoal", "Daily Goal")}</p>
              <div className="mt-3 flex items-center justify-center">
                <svg viewBox="0 0 120 120" className="h-36 w-36">
                  <circle cx="60" cy="60" r={circleRadius} stroke="#e4e4e7" strokeWidth="10" fill="none" />
                  <circle
                    cx="60"
                    cy="60"
                    r={circleRadius}
                    stroke="#10b981"
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray={circleLength}
                    strokeDashoffset={circleOffset}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                  <text x="60" y="62" textAnchor="middle" className="fill-zinc-900 text-xl font-bold">
                    {dailyPercent}%
                  </text>
                </svg>
              </div>
              <p className="text-center text-sm text-zinc-600">
                {completedToday}/{todayTasks.length} {tx("home.tasksCompletedToday", "tasks completed today")}
              </p>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-500">{tx("home.streakBadges", "Streak & Badges")}</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">
                {streak ?? 0} {tx("home.days", "days")}
              </p>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-700">
                  {tx("home.badgeConsistency", "Consistency")}
                </span>
                <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-700">
                  {tx("home.badgeFinisher", "Finisher")}
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-500">{tx("home.quickActions", "Quick actions")}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Link href="/goals/new" className="rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm text-white">
                  {tx("home.addGoal", "+ Add goal")}
                </Link>
                <button
                  type="button"
                  disabled={openTodayTasks.length === 0}
                  onClick={() => {
                    if (openTodayTasks.length === 0) return;
                    if (pomodoroRunning) {
                      setPomodoroRunning(false);
                      setPomodoroEndAt(null);
                      return;
                    }
                    setPomodoroFinished(false);
                    const current = pomodoroSeconds > 0 ? pomodoroSeconds : POMODORO_DEFAULT_SECONDS;
                    const endAt = Date.now() + current * 1000;
                    setPomodoroSeconds(current);
                    setPomodoroRunning(true);
                    setPomodoroEndAt(endAt);
                  }}
                  className="rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {pomodoroRunning
                    ? tx("home.pauseFocus", "Pause focus")
                    : tx("home.startFocus", "Start focus")}
                </button>
              </div>
              {openTodayTasks.length === 0 && (
                <p className="mt-2 text-xs text-zinc-500">
                  {tx("home.noOpenTasksForFocus", "Create tasks for today to use focus timer.")}
                </p>
              )}
              {pomodoroFinished ? (
                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                  {tx("home.focusCompleted", "Focus session completed")} · {tx("home.sessionsDone", "Sessions today")}:
                  {" "}
                  {pomodoroSessionsDone}
                </div>
              ) : (
                <p className="mt-2 text-xs text-zinc-500">{tx("home.focusHint", "When timer ends, you get a sound and notification.")}</p>
              )}
              <div className="mt-3 rounded-lg bg-zinc-100 px-3 py-2 text-center text-lg font-semibold">
                {formatPomodoro(pomodoroSeconds)}
              </div>
              <button
                type="button"
                onClick={() => {
                  setPomodoroFinished(false);
                  const breakSeconds = 5 * 60;
                  setPomodoroSeconds(breakSeconds);
                  setPomodoroEndAt(Date.now() + breakSeconds * 1000);
                  setPomodoroRunning(true);
                }}
                className="mt-2 w-full rounded-lg border border-emerald-300 px-3 py-2 text-sm text-emerald-700"
              >
                {tx("home.startBreak", "Start 5-min break")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPomodoroRunning(false);
                  setPomodoroEndAt(null);
                  setPomodoroFinished(false);
                  setPomodoroSeconds(POMODORO_DEFAULT_SECONDS);
                }}
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-700"
              >
                {tx("home.resetTimer", "Reset timer")}
              </button>
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-500">{tx("home.nextEvent", "Next important event")}</p>
              {nearestDeadline ? (
                <Link href={`/tasks/${nearestDeadline.id}`} className="mt-2 block text-sm text-zinc-800 hover:underline">
                  {nearestDeadline.title} - {new Date(nearestDeadline.due_at).toLocaleDateString()}
                </Link>
              ) : (
                <p className="mt-2 text-sm text-zinc-600">{tx("home.noDeadline", "No nearby deadline found")}</p>
              )}
            </div>
            <div className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-4 shadow-sm">
              <p className="text-sm font-semibold text-zinc-600">{tx("home.companionTitle", "Dynamic companion")}</p>
              <p className="mt-2 text-sm text-zinc-700">
                {streak && streak >= 10
                  ? tx("home.companionGreat", "Your streak is great! Your companion reached an advanced level.")
                  : tx("home.companionGrow", "Your companion is growing. Complete at least 1 task today.")}
              </p>
            </div>
          </div>
          ) : (
            <div className="qadam-fade-up rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm lg:col-span-1">
              <p className="text-sm font-semibold text-zinc-500">{tx("home.landingWhy", "Why Qadam")}</p>
              <ul className="mt-3 space-y-2 text-sm text-zinc-700">
                <li>- {tx("home.landingFeature1", "AI roadmap for your goal in minutes")}</li>
                <li>- {tx("home.landingFeature2", "Daily tasks, reminders, and progress tracking")}</li>
                <li>- {tx("home.landingFeature3", "Telegram integration and smart insights")}</li>
              </ul>
              <div className="mt-4 rounded-xl bg-gradient-to-br from-emerald-50 to-cyan-50 p-4">
                <p className="text-sm text-zinc-700">
                  {tx("home.landingHint", "Sign in to unlock your personal dashboard and statistics.")}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
