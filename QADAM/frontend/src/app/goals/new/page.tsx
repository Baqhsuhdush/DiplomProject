"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import { GOAL_DOMAINS } from "@/lib/qadam-types";

export default function NewGoalPage() {
  const { t, lang } = useI18n();
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);
  const router = useRouter();
  const [domain, setDomain] = useState("programming");
  const [title, setTitle] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [priority, setPriority] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useOnLoggedOut(() => {
    setError(null);
    setLoading(false);
    setTitle("");
    setTargetDate("");
    setDomain("programming");
    setPriority(3);
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const body: Record<string, unknown> = {
        domain,
        title: title.trim(),
        priority,
      };
      if (targetDate) body.target_date = targetDate;
      const res = await apiFetch("/api/v1/goals", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await friendlyApiError(res));
        return;
      }
      const raw = await res.json().catch(() => ({}));
      const goal = raw as { id?: string };
      if (!goal.id) {
        setError(tr("Некорректный ответ сервера", "Сервер жауабы қате", "Invalid server response"));
        return;
      }
      router.push(`/goals/${goal.id}?created=1`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthGate title={t("newGoal.title")}>
      <div className="mx-auto max-w-2xl px-4 py-10 text-zinc-900">
        <div className="mb-6">
          <Link href="/goals" className="text-sm font-medium text-emerald-600 hover:text-emerald-700 hover:underline">
            {t("newGoal.back")}
          </Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-zinc-900">{t("newGoal.title")}</h1>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
          <label className="block text-sm">
            <span className="text-base font-semibold text-zinc-700">{t("newGoal.domain")}</span>
            <select
              required
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            >
              {GOAL_DOMAINS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm">
            <span className="text-base font-semibold text-zinc-700">{t("newGoal.formulation")}</span>
            <textarea
              required
              minLength={1}
              rows={3}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none ring-emerald-500/20 placeholder:text-zinc-500 focus:border-emerald-500 focus:ring-2"
              placeholder={tr(
                "Например: стать Python backend-разработчиком за 6 месяцев",
                "Мысалы: 6 айда Python backend әзірлеуші болу",
                "For example: become a Python backend developer in 6 months",
              )}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-base font-semibold text-zinc-700">{t("newGoal.date")}</span>
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          </label>

          <label className="block text-sm">
            <span className="text-base font-semibold text-zinc-700">{t("newGoal.priority")}</span>
            <input
              type="number"
              min={1}
              max={5}
              className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-zinc-900 outline-none ring-emerald-500/20 focus:border-emerald-500 focus:ring-2"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "…" : t("newGoal.create")}
            </button>
            <Link
              href="/goals"
              className="rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-100"
            >
              {t("newGoal.cancel")}
            </Link>
          </div>
        </form>
      </div>
    </AuthGate>
  );
}
