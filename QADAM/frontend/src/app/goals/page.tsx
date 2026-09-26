"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { GoalPublic } from "@/lib/qadam-types";

export default function GoalsListPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);
  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      active: tr("активна", "белсенді", "active"),
      paused: tr("на паузе", "үзілісте", "paused"),
      completed: tr("завершена", "аяқталды", "completed"),
      archived: tr("в архиве", "мұрағатта", "archived"),
    };
    return map[s] ?? s;
  };
  const domainLabel = (d: string) => {
    const map: Record<string, string> = {
      learning: tr("Обучение", "Оқу", "Learning"),
      programming: tr("Программирование", "Бағдарламалау", "Programming"),
      sport: tr("Спорт", "Спорт", "Sport"),
      english: tr("Английский", "Ағылшын", "English"),
      career: tr("Карьера", "Мансап", "Career"),
      business: tr("Бизнес", "Бизнес", "Business"),
      self_development: tr("Саморазвитие", "Өзін-өзі дамыту", "Self development"),
      other: tr("Другое", "Басқа", "Other"),
    };
    return map[d] ?? d;
  };
  const tokenReady = useTokenReady();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [goals, setGoals] = useState<GoalPublic[]>([]);
  const [menuGoalId, setMenuGoalId] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeGoal, setActiveGoal] = useState<GoalPublic | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingGoal, setDeletingGoal] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDomain, setEditDomain] = useState("other");
  const [editPriority, setEditPriority] = useState("3");
  const [editTargetDate, setEditTargetDate] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const statusOptions = [
    { value: "", label: t("goals.all") },
    { value: "active", label: tr("активные", "белсенді", "active") },
    { value: "paused", label: tr("на паузе", "үзілісте", "paused") },
    { value: "completed", label: tr("завершённые", "аяқталған", "completed") },
    { value: "archived", label: tr("в архиве", "мұрағат", "archived") },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
    const res = await apiFetch(`/api/v1/goals${qs}`);
    if (!res.ok) {
      setError(await friendlyApiError(res));
      setGoals([]);
      setLoading(false);
      return;
    }
    setGoals((await res.json()) as GoalPublic[]);
    setLoading(false);
  }, [statusFilter]);

  useOnLoggedOut(() => {
    setGoals([]);
    setError(null);
    setLoading(false);
  });

  useEffect(() => {
    if (!tokenReady) return;
    void load();
  }, [tokenReady, load]);

  useEffect(() => {
    const closeMenu = () => {
      setMenuGoalId(null);
      setStatusMenuOpen(false);
    };
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  const domainOptions = [
    { value: "learning", label: tr("Обучение", "Оқу", "Learning") },
    { value: "programming", label: tr("Программирование", "Бағдарламалау", "Programming") },
    { value: "sport", label: tr("Спорт", "Спорт", "Sport") },
    { value: "english", label: tr("Английский", "Ағылшын", "English") },
    { value: "career", label: tr("Карьера", "Мансап", "Career") },
    { value: "business", label: tr("Бизнес", "Бизнес", "Business") },
    { value: "self_development", label: tr("Саморазвитие", "Өзін-өзі дамыту", "Self development") },
    { value: "other", label: tr("Другое", "Басқа", "Other") },
  ];

  function openEdit(goal: GoalPublic) {
    setActiveGoal(goal);
    setMenuGoalId(null);
    setActionError(null);
    setEditTitle(goal.title);
    setEditDomain(goal.domain);
    setEditPriority(String(goal.priority));
    setEditTargetDate(goal.target_date ?? "");
    setEditOpen(true);
  }

  function openDelete(goal: GoalPublic) {
    setActiveGoal(goal);
    setMenuGoalId(null);
    setActionError(null);
    setDeleteOpen(true);
  }

  async function submitEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!activeGoal) return;
    setSavingEdit(true);
    setActionError(null);
    const res = await apiFetch(`/api/v1/goals/${activeGoal.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: editTitle.trim(),
        domain: editDomain,
        priority: Number(editPriority),
        target_date: editTargetDate || null,
      }),
    });
    if (!res.ok) {
      setActionError(await friendlyApiError(res));
      setSavingEdit(false);
      return;
    }
    setEditOpen(false);
    await load();
    setSavingEdit(false);
  }

  async function confirmDelete() {
    if (!activeGoal) return;
    setDeletingGoal(true);
    setActionError(null);
    const res = await apiFetch(`/api/v1/goals/${activeGoal.id}`, { method: "DELETE" });
    if (!res.ok) {
      setActionError(await friendlyApiError(res));
      setDeletingGoal(false);
      return;
    }
    setDeleteOpen(false);
    setActiveGoal(null);
    await load();
    setDeletingGoal(false);
  }

  const visibleGoals = goals.filter((g) => g.title.trim().length > 0);

  return (
    <AuthGate title={t("goals.title")}>
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">{t("goals.title")}</h1>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-700">
              <span>{t("goals.status")}:</span>
              <div className="relative min-w-44" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setStatusMenuOpen((v) => !v)}
                  className="inline-flex w-full items-center justify-between rounded-xl border border-zinc-300 bg-white px-3 py-2 text-left text-sm font-semibold text-zinc-800 shadow-sm transition hover:border-emerald-400 hover:shadow"
                >
                  <span>{statusOptions.find((x) => x.value === statusFilter)?.label ?? t("goals.all")}</span>
                  <span className={`text-zinc-500 transition ${statusMenuOpen ? "rotate-180" : ""}`}>⌄</span>
                </button>
                <div className={`qadam-popover ${statusMenuOpen ? "is-open" : ""}`}>
                  <div className="mt-1 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
                    {statusOptions.map((opt) => (
                      <button
                        key={opt.value || "all"}
                        type="button"
                        onClick={() => {
                          setStatusFilter(opt.value);
                          setStatusMenuOpen(false);
                        }}
                        className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                          statusFilter === opt.value
                            ? "bg-emerald-50 font-semibold text-emerald-700"
                            : "text-zinc-700 hover:bg-zinc-100"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </label>
          </div>
          <Link
            href="/goals/new"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
          >
            {t("goals.new")}
          </Link>
        </div>

        {error && <p className="mt-6 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-sm text-rose-200">{error}</p>}

        {loading ? (
          <p className="mt-10 text-sm text-zinc-500">{t("common.loading")}</p>
        ) : visibleGoals.length === 0 ? (
          <div className="mt-10 rounded-xl border border-zinc-200 bg-white p-8 text-center text-zinc-600 shadow-sm">
            <p>{tr("Мәлімет жоқ", "Мәлімет жоқ", "No data")}</p>
            <Link href="/goals/new" className="mt-3 inline-block text-emerald-400 hover:underline">
              {t("goals.new")}
            </Link>
          </div>
        ) : (
          <ul className="mt-8 space-y-3">
            {visibleGoals.map((g) => (
              <li key={g.id} className={`relative ${menuGoalId === g.id ? "z-40" : "z-0"}`}>
                <button
                  type="button"
                  onClick={() => router.push(`/goals/${g.id}?view=tasks`)}
                  className="block w-full rounded-xl border border-zinc-200 bg-white p-4 pr-16 text-left shadow-sm transition hover:border-emerald-300 hover:shadow"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-800">{g.title}</p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {domainLabel(g.domain)} · {tr("приоритет", "басымдық", "priority")} {g.priority} · {statusLabel(g.status)}
                      </p>
                    </div>
                    {g.target_date && (
                      <span className="shrink-0 rounded bg-zinc-900 px-2 py-0.5 text-xs text-white transition hover:bg-zinc-700">
                        {tr("до", "дейін", "until")} {g.target_date}
                      </span>
                    )}
                  </div>
                </button>

                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuGoalId((prev) => (prev === g.id ? null : g.id));
                    }}
                    className="flex h-9 w-9 items-center justify-center rounded-md text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
                    aria-label={tr("Действия", "Әрекеттер", "Actions")}
                  >
                    ⋮
                  </button>
                  {menuGoalId === g.id ? (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-0 z-50 mt-1 w-40 rounded-lg border border-zinc-200 bg-white p-1 shadow-xl"
                    >
                      <button
                        type="button"
                        onClick={() => openEdit(g)}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100"
                      >
                        {tr("Өңдеу", "Өңдеу", "Edit")}
                      </button>
                      <button
                        type="button"
                        onClick={() => openDelete(g)}
                        className="block w-full rounded-md px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                      >
                        {tr("Жою", "Жою", "Delete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {editOpen && activeGoal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">{tr("Мақсатты өңдеу", "Мақсатты өңдеу", "Edit goal")}</h2>
            <form onSubmit={submitEdit} className="mt-4 space-y-3">
              <label className="block text-sm text-zinc-700">
                {tr("Атауы", "Атауы", "Title")}
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </label>
              <label className="block text-sm text-zinc-700">
                {tr("Категория", "Санат", "Category")}
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                  value={editDomain}
                  onChange={(e) => setEditDomain(e.target.value)}
                >
                  {domainOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-zinc-700">
                {tr("Басымдық", "Басымдық", "Priority")}
                <select
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                  value={editPriority}
                  onChange={(e) => setEditPriority(e.target.value)}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={String(n)}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-zinc-700">
                {tr("Deadline", "Аяқталу күні", "Deadline")}
                <input
                  type="date"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900"
                  value={editTargetDate}
                  onChange={(e) => setEditTargetDate(e.target.value)}
                />
              </label>
              {actionError ? <p className="text-sm text-rose-600">{actionError}</p> : null}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  {tr("Бас тарту", "Бас тарту", "Cancel")}
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
                >
                  {savingEdit ? tr("Сақталуда...", "Сақталуда...", "Saving...") : tr("Сақтау", "Сақтау", "Save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {deleteOpen && activeGoal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold text-zinc-900">{tr("Мақсатты жою", "Мақсатты жою", "Delete goal")}</h2>
            <p className="mt-2 text-sm text-zinc-700">
              {tr("Сенімдісіз бе?", "Сенімдісіз бе?", "Are you sure?")} "{activeGoal.title}"
            </p>
            {actionError ? <p className="mt-2 text-sm text-rose-600">{actionError}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteOpen(false)}
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
              >
                {tr("Бас тарту", "Бас тарту", "Cancel")}
              </button>
              <button
                type="button"
                disabled={deletingGoal}
                onClick={() => void confirmDelete()}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500 disabled:opacity-60"
              >
                {deletingGoal ? tr("Жойылуда...", "Жойылуда...", "Deleting...") : tr("Жою", "Жою", "Delete")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AuthGate>
  );
}
