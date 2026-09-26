"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { GoalPublic } from "@/lib/qadam-types";

export default function GoalsListPage() {
  const { t, lang } = useI18n();
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const visibleGoals = goals.filter((g) => g.title.trim().length > 0);

  return (
    <AuthGate title={t("goals.title")}>
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900">{t("goals.title")}</h1>
            <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold text-zinc-700">
              <span>{t("goals.status")}:</span>
              <select
                className="min-w-36 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">{t("goals.all")}</option>
                <option value="active">{tr("активные", "белсенді", "active")}</option>
                <option value="paused">{tr("на паузе", "үзілісте", "paused")}</option>
                <option value="completed">{tr("завершённые", "аяқталған", "completed")}</option>
                <option value="archived">{tr("в архиве", "мұрағат", "archived")}</option>
              </select>
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
              <li key={g.id}>
                <Link
                  href={`/goals/${g.id}`}
                  className="block rounded-xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-zinc-800">{g.title}</p>
                      <p className="mt-1 text-xs text-zinc-600">
                        {domainLabel(g.domain)} · {tr("приоритет", "басымдық", "priority")} {g.priority} · {statusLabel(g.status)}
                      </p>
                    </div>
                    {g.target_date && (
                      <span className="shrink-0 rounded bg-zinc-900 px-2 py-0.5 text-xs text-white">
                        {tr("до", "дейін", "until")} {g.target_date}
                      </span>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AuthGate>
  );
}
