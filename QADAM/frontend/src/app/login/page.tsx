"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { setTokens } from "@/lib/auth";
import { useTokenReady } from "@/hooks/useTokenReady";
import { useI18n } from "@/lib/i18n";

function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s.startsWith("/") || s.startsWith("//") || s.includes("://")) return null;
  return s;
}

function formatDetail(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join("; ");
  }
  return JSON.stringify(detail);
}

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const tokenReady = useTokenReady();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [returnPath, setReturnPath] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("next");
    setReturnPath(safeReturnPath(q));
  }, []);

  /** Уже есть сессия (в т.ч. вход в другой вкладке) — не держим на форме входа. */
  useEffect(() => {
    if (!tokenReady) return;
    const fromUrl = safeReturnPath(new URLSearchParams(window.location.search).get("next"));
    router.replace(fromUrl ?? returnPath ?? "/goals");
  }, [tokenReady, router, returnPath]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const res = await apiFetch("/api/v1/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            full_name: fullName || null,
          }),
        });
        if (!res.ok) {
          setError(await friendlyApiError(res));
          return;
        }
      }
      const res = await apiFetch("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(await friendlyApiError(res));
        return;
      }
      const body = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        detail?: string;
      };
      if (!body.access_token || !body.refresh_token) {
        setError(formatDetail(body.detail) ?? "Не удалось войти");
        return;
      }
      setTokens(body.access_token, body.refresh_token);
      router.push(returnPath ?? "/goals");
    } catch {
      setError("Сервер недоступен. Повторите попытку через несколько секунд.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col gap-6 px-6 py-16 text-zinc-100">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
        <div>
          <p className="text-xs uppercase tracking-wide text-emerald-600">Qadam</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">
            {mode === "login" ? t("login.login") : t("login.register")}
          </h1>
        </div>
        {mode === "register" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-zinc-400">{t("login.name")}</span>
            <input
              className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2"
              placeholder={t("login.name")}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">{t("login.email")}</span>
          <input
            required
            type="email"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2"
            placeholder={t("login.email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-500">{t("login.password")}</span>
          <input
            required
            minLength={8}
            type="password"
            className="rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-zinc-900 outline-none ring-emerald-500/30 focus:ring-2"
            placeholder={t("login.password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-emerald-600 px-6 py-3 text-base font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "…" : mode === "login" ? t("login.submitLogin") : t("login.submitRegister")}
        </button>
        <button
          type="button"
          className="text-sm font-medium text-emerald-700 underline-offset-4 hover:text-emerald-600 hover:underline"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? t("login.noAccount") : t("login.hasAccount")}
        </button>
      </form>

      <p className="text-center text-sm">
        <Link className="font-medium text-emerald-700 hover:text-emerald-600 hover:underline" href="/">
          {t("login.home")}
        </Link>
      </p>
    </div>
  );
}
