"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { AuthGate } from "@/components/AuthGate";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";

type TaskItem = {
  id: string;
  goal_id: string;
  title: string;
  status: string;
  due_at: string | null;
};

type DragTask = Pick<TaskItem, "id" | "due_at">;

function CompletedMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 text-emerald-600">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor" opacity="0.18" />
      <path d="m7.5 12.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function utcTodayKey(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function utcMonthMatrix(year: number, monthIndex: number): (number | null)[] {
  const firstDow = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthTitleByLang(year: number, monthIndex: number, lang: "kk" | "ru" | "en"): string {
  if (lang === "kk") {
    const months = [
      "Қаңтар",
      "Ақпан",
      "Наурыз",
      "Сәуір",
      "Мамыр",
      "Маусым",
      "Шілде",
      "Тамыз",
      "Қыркүйек",
      "Қазан",
      "Қараша",
      "Желтоқсан",
    ];
    return `${months[monthIndex]} ${year}`;
  }
  const locale = lang === "en" ? "en-US" : "ru-RU";
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleString(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function CalendarPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const tokenReady = useTokenReady();
  const [ym, setYm] = useState(() => {
    const t = new Date();
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() };
  });
  const [selected, setSelected] = useState(utcTodayKey);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeUndated, setIncludeUndated] = useState(false);
  const [duePick, setDuePick] = useState<Record<string, string>>({});
  const [monthTasks, setMonthTasks] = useState<TaskItem[]>([]);

  const matrix = useMemo(() => utcMonthMatrix(ym.y, ym.m), [ym]);
  const monthRange = useMemo(() => {
    const from = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-01`;
    const last = new Date(Date.UTC(ym.y, ym.m + 1, 0)).getUTCDate();
    const to = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
    return { from, to };
  }, [ym.y, ym.m]);
  const monthTaskMap = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    for (const task of monthTasks) {
      if (!task.due_at) continue;
      const k = task.due_at.slice(0, 10);
      const prev = map.get(k) ?? { total: 0, done: 0 };
      prev.total += 1;
      if (task.status === "completed") prev.done += 1;
      map.set(k, prev);
    }
    return map;
  }, [monthTasks]);

  const loadTasks = useCallback(async (day: string, undated: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ date: day });
      if (undated) qs.set("include_undated", "true");
      const res = await apiFetch(`/api/v1/tasks?${qs.toString()}`);
      if (!res.ok) {
        setError(await friendlyApiError(res));
        setTasks([]);
        return;
      }
      setTasks((await res.json()) as TaskItem[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useOnLoggedOut(() => {
    setTasks([]);
    setError(null);
    setLoading(false);
    setDuePick({});
  });

  useEffect(() => {
    if (!tokenReady) return;
    void loadTasks(selected, includeUndated);
  }, [tokenReady, selected, includeUndated, loadTasks]);

  useEffect(() => {
    if (!tokenReady) return;
    let cancelled = false;
    const loadMonth = async () => {
      const qs = new URLSearchParams({
        from_date: monthRange.from,
        to_date: monthRange.to,
      });
      const res = await apiFetch(`/api/v1/tasks?${qs.toString()}`);
      if (!res.ok) return;
      if (cancelled) return;
      setMonthTasks((await res.json()) as TaskItem[]);
    };
    void loadMonth();
    return () => {
      cancelled = true;
    };
  }, [tokenReady, monthRange.from, monthRange.to]);

  async function markDone(id: string) {
    const res = await apiFetch(`/api/v1/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: "completed" }),
    });
    if (!res.ok) {
      setError(await friendlyApiError(res));
      return;
    }
    await loadTasks(selected, includeUndated);
  }

  async function setDueOnCalendarDay(task: TaskItem) {
    setError(null);
    const day = duePick[task.id] ?? selected;
    const res = await apiFetch(`/api/v1/tasks/${task.id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ due_at: new Date(`${day}T12:00:00.000Z`).toISOString() }),
    });
    if (!res.ok) {
      setError(await friendlyApiError(res));
      return;
    }
    await loadTasks(selected, includeUndated);
  }

  async function shiftDue(task: TaskItem, days: number) {
    setError(null);
    const base = task.due_at ? new Date(task.due_at) : new Date(`${selected}T12:00:00.000Z`);
    const next = new Date(base.getTime());
    next.setUTCDate(next.getUTCDate() + days);
    const res = await apiFetch(`/api/v1/tasks/${task.id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ due_at: next.toISOString() }),
    });
    if (!res.ok) {
      setError(await friendlyApiError(res));
      return;
    }
    await loadTasks(selected, includeUndated);
  }

  async function moveTaskToDay(taskId: string, day: string) {
    setError(null);
    const res = await apiFetch(`/api/v1/tasks/${taskId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ due_at: new Date(`${day}T12:00:00.000Z`).toISOString() }),
    });
    if (!res.ok) {
      setError(await friendlyApiError(res));
      return;
    }
    await loadTasks(selected, includeUndated);
  }

  function openTaskExecution(task: TaskItem) {
    router.push(`/tasks/${task.id}`);
  }

  const locale = lang === "kk" ? "kk-KZ" : lang === "en" ? "en-US" : "ru-RU";
  const title = monthTitleByLang(ym.y, ym.m, lang);
  const weekdays =
    lang === "kk"
      ? ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сн"]
      : lang === "en"
        ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
        : ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const statusLabel = (raw: string) => {
    const v = raw.toLowerCase();
    if (v === "pending") return lang === "kk" ? "Күтілуде" : lang === "en" ? "Pending" : "В ожидании";
    if (v === "completed") return lang === "kk" ? "Орындалды" : lang === "en" ? "Completed" : "Готово";
    if (v === "in_progress") return lang === "kk" ? "Орындалуда" : lang === "en" ? "In progress" : "В работе";
    return raw;
  };

  return (
    <AuthGate title={t("calendar.title")}>
    <div className="mx-auto max-w-5xl px-4 py-10 text-zinc-100">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{t("calendar.title")}</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            onClick={() => {
              const now = new Date();
              setYm({ y: now.getUTCFullYear(), m: now.getUTCMonth() });
              setSelected(utcTodayKey());
            }}
          >
            {lang === "kk" ? "Бүгін" : lang === "en" ? "Today" : "Сегодня"}
          </button>
          <button
            type="button"
            className="rounded-lg bg-emerald-600 px-3 py-1 text-sm font-semibold text-white hover:bg-emerald-500"
            onClick={() => router.push("/goals/new")}
            title={lang === "kk" ? "Жаңа мақсат/тапсырма" : lang === "en" ? "New goal/task" : "Новая цель/задача"}
          >
            + {lang === "kk" ? "Қосу" : lang === "en" ? "Add" : "Добавить"}
          </button>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-900"
            onClick={() =>
              setYm(({ y, m }) => {
                const d = new Date(Date.UTC(y, m - 1, 1));
                return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
              })
            }
          >
            ←
          </button>
          <span className="min-w-[10rem] text-center text-sm font-semibold text-zinc-700">{title}</span>
          <button
            type="button"
            className="rounded-lg border border-zinc-700 px-3 py-1 text-sm hover:bg-zinc-900"
            onClick={() =>
              setYm(({ y, m }) => {
                const d = new Date(Date.UTC(y, m + 1, 1));
                return { y: d.getUTCFullYear(), m: d.getUTCMonth() };
              })
            }
          >
            →
          </button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="h-fit self-start rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="grid grid-cols-7 gap-2 text-center text-xs text-zinc-700">
            {weekdays.map((d) => (
              <div key={d} className="py-2 font-medium">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2">
            {matrix.map((d, idx) => {
              if (d == null) return <div key={`e-${idx}`} className="h-10" />;
              const key = `${ym.y}-${String(ym.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const active = key === selected;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelected(key)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const raw = e.dataTransfer.getData("application/json");
                    if (!raw) return;
                    try {
                      const drag = JSON.parse(raw) as DragTask;
                      void moveTaskToDay(drag.id, key);
                    } catch {
                      return;
                    }
                  }}
                  className={`flex h-10 flex-col items-center justify-center rounded-lg border text-sm font-medium ${
                    active
                      ? "border-emerald-600 bg-emerald-600 text-white shadow-sm"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <span>{d}</span>
                  {monthTaskMap.get(key)?.total ? (
                    <span className="mt-0.5 flex items-center justify-center gap-1">
                      <span className={`h-1.5 w-1.5 rounded-full ${monthTaskMap.get(key)!.done > 0 ? "bg-emerald-500" : "bg-amber-500"}`} />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-semibold text-zinc-800">{t("calendar.tasksOn")} {selected}</h2>
            <button
              type="button"
              onClick={() => setIncludeUndated((v) => !v)}
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition ${
                includeUndated
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              {t("calendar.showUndated")}
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}
          {loading ? (
            <p className="mt-4 text-sm text-zinc-500">{t("common.loading")}</p>
          ) : tasks.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-500">
              {includeUndated
                ? t("calendar.noneWithUndated")
                : t("calendar.noneOnlyDated")}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  draggable={task.status !== "completed"}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify({ id: task.id, due_at: task.due_at } satisfies DragTask));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={`rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 shadow-sm transition hover:border-emerald-300 hover:shadow ${
                    task.status === "completed" ? "opacity-65" : ""
                  }`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openTaskExecution(task);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 pr-1">
                      <button
                        type="button"
                        onClick={() => openTaskExecution(task)}
                        className="inline-flex items-center gap-1.5 text-left font-semibold leading-snug text-zinc-900 hover:text-emerald-700 hover:underline"
                      >
                        {task.status === "completed" ? <CompletedMark /> : null}
                        {task.title}
                      </button>
                      <p className="mt-1 text-xs text-zinc-600">
                        {statusLabel(task.status)}
                        {task.due_at == null ? ` · ${t("calendar.noDate")}` : ""}
                      </p>
                    </div>
                    {task.status !== "completed" && (
                      <button
                        type="button"
                        className="shrink-0 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                        onClick={(e) => {
                          e.stopPropagation();
                          void markDone(task.id);
                        }}
                      >
                        {t("calendar.done")}
                      </button>
                    )}
                  </div>
                  {task.status !== "completed" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2.5" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        onClick={() => void shiftDue(task, 1)}
                        title="Перенести дедлайн на +1 день UTC"
                      >
                        +1d
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-300 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        onClick={() => void shiftDue(task, 7)}
                        title="Перенести на +7 дней UTC"
                      >
                        +7d
                      </button>
                      <input
                        type="date"
                        className="h-8 w-[144px] rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700"
                        value={duePick[task.id] ?? selected}
                        onChange={(e) => setDuePick((prev) => ({ ...prev, [task.id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                        onClick={() => void setDueOnCalendarDay(task)}
                        title="Дедлайн 12:00 UTC выбранного дня"
                      >
                        {t("calendar.toDate")}
                      </button>
                    </div>
                  )}
                  <div className="mt-2 text-sm font-semibold text-zinc-700">
                    {task.due_at
                      ? new Date(task.due_at).toLocaleString(locale, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        })
                      : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
    </AuthGate>
  );
}
