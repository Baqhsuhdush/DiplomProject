"use client";

import Link from "next/link";
import { Playfair_Display } from "next/font/google";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { getAccessToken, matchesAuthStorageKey, QADAM_AUTH_CHANGED_EVENT } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { ProgressOverviewPublic } from "@/lib/qadam-types";

const qadamBrandFont = Playfair_Display({
  subsets: ["latin", "cyrillic"],
  weight: ["700"],
});

export default function Home() {
  const { t, lang } = useI18n();
  const [logged, setLogged] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const [todayTasks, setTodayTasks] = useState<Array<{ id: string; title: string }>>([]);
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
      return;
    }
    async function loadHome() {
      const [overviewRes, tasksRes] = await Promise.all([
        apiFetch("/api/v1/progress/overview"),
        apiFetch(`/api/v1/tasks?date=${new Date().toISOString().slice(0, 10)}`),
      ]);
      if (overviewRes.ok) {
        const ov = (await overviewRes.json()) as ProgressOverviewPublic;
        setStreak(ov.task_completion_streak_days);
      }
      if (tasksRes.ok) {
        const rows = (await tasksRes.json()) as Array<{ id: string; title: string }>;
        setTodayTasks(rows.slice(0, 5));
      }
    }
    void loadHome();
  }, [logged]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-5xl items-center px-6 py-8">
        <section className="grid w-full gap-6 lg:grid-cols-2">
          <div className="qadam-fade-up space-y-2">
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
              <div className="mt-6 max-w-xl space-y-4">
                <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm font-semibold text-emerald-800 shadow-sm">
                  <svg viewBox="0 0 64 64" className="h-5 w-5 shrink-0" aria-hidden="true">
                    <defs>
                      <linearGradient id="home-streak-fire-outer" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6ee7b7" />
                        <stop offset="100%" stopColor="#10b981" />
                      </linearGradient>
                      <linearGradient id="home-streak-fire-inner" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d1fae5" />
                        <stop offset="100%" stopColor="#34d399" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M33 2c1 9 8 12 12 19 4 6 6 11 6 17 0 13-9 22-20 24-11-2-20-11-20-24 0-8 3-14 9-20 5-4 10-8 12-16h1z"
                      fill="url(#home-streak-fire-outer)"
                    />
                    <path
                      d="M32 16c0 7 5 10 8 14 3 4 4 8 4 12 0 8-5 13-12 16-7-3-12-8-12-16 0-5 2-9 6-12 3-2 5-5 6-9z"
                      fill="url(#home-streak-fire-inner)"
                      opacity="0.95"
                    />
                  </svg>
                  <span>Streak: {streak ?? 0}</span>
                </div>
                <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-zinc-800">Бүгінгі тапсырмалар</p>
                  {todayTasks.length === 0 ? (
                    <p className="mt-2 text-sm text-zinc-600">Тапсырма жоқ</p>
                  ) : (
                    <ul className="mt-2 space-y-1.5 text-sm">
                      {todayTasks.map((task) => (
                        <li key={task.id}>
                          <Link
                            href={`/tasks/${task.id}`}
                            className="block rounded-md px-2 py-1.5 text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            • {task.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="qadam-fade-up qadam-float qadam-soft-card overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <img
              src="https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExb3A2a3N4eTUwa2RnNmN1OXhybnp4emlyeDFwc2w3MTRhMXNqemY2bSZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o7qE1YN7aBOFPRw8E/giphy.gif"
              alt="Динамичный процесс планирования"
              className="h-64 w-full rounded-xl object-cover md:h-72"
            />
          </div>
        </section>

      </main>
    </div>
  );
}
