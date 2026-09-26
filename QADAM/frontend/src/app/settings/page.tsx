"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { clearTokens } from "@/lib/auth";
import { useI18n, type Lang } from "@/lib/i18n";
import type { UserPublic } from "@/lib/qadam-types";

const TZ_PRESET_VALUES = [
  "",
  "Europe/Moscow",
  "Asia/Almaty",
  "Asia/Tashkent",
  "Europe/Berlin",
  "Europe/London",
  "America/New_York",
  "__custom__",
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { lang, setLang, t } = useI18n();
  const tokenReady = useTokenReady();
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);

  const [me, setMe] = useState<UserPublic | null>(null);
  const [tzPreset, setTzPreset] = useState("");
  const [tzCustom, setTzCustom] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [telegramSoundEnabled, setTelegramSoundEnabled] = useState(true);
  const [quietStart, setQuietStart] = useState("22:00");
  const [quietEnd, setQuietEnd] = useState("08:00");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingAll, setSavingAll] = useState(false);
  const [fullName, setFullName] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [passwordCurrent, setPasswordCurrent] = useState("");
  const [passwordNext, setPasswordNext] = useState("");
  const [securityBusy, setSecurityBusy] = useState<null | "email" | "password" | "delete">(null);

  const applyMeToForms = useCallback((u: UserPublic) => {
    setMe(u);
    setEmailDraft(u.email);
    setFullName(u.full_name ?? "");
    setEnabled(!!u.reminder_quiet_enabled);
    setQuietStart(`${String(u.reminder_quiet_start_hour_local ?? 22).padStart(2, "0")}:00`);
    setQuietEnd(`${String(u.reminder_quiet_end_hour_local ?? 8).padStart(2, "0")}:00`);
    const tz = (u.timezone ?? "").trim();
    const match = TZ_PRESET_VALUES.find((p) => p === tz && p !== "__custom__");
    if (tz && !match) {
      setTzPreset("__custom__");
      setTzCustom(tz);
    } else if (tz && match) {
      setTzPreset(tz);
      setTzCustom("");
    } else {
      setTzPreset("");
      setTzCustom("");
    }
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/me");
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        setMe(null);
        return;
      }
      const u = (await res.json()) as UserPublic;
      applyMeToForms(u);
      const tgRes = await apiFetch("/api/v1/me/telegram/status");
      if (tgRes.ok) {
        const tg = (await tgRes.json()) as { sound_enabled?: boolean };
        setTelegramSoundEnabled(tg.sound_enabled !== false);
      }
    } finally {
      setLoading(false);
    }
  }, [applyMeToForms]);

  useOnLoggedOut(() => {
    setMe(null);
    setTzPreset("");
    setTzCustom("");
    setEnabled(false);
    setQuietStart("22:00");
    setQuietEnd("08:00");
    setErr(null);
    setMsg(null);
    setFullName("");
    setLoading(false);
  });

  useEffect(() => {
    if (!tokenReady) return;
    void load();
  }, [tokenReady, load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedTheme = window.localStorage.getItem("qadam:theme");
    const next = savedTheme === "dark" ? "dark" : "light";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    const savedAvatar = window.localStorage.getItem("qadam:avatar");
    setAvatarDataUrl(savedAvatar && savedAvatar.trim() ? savedAvatar : null);
  }, []);

  function hourFromTime(v: string): number {
    const [hh] = v.split(":");
    const n = Number.parseInt(hh || "0", 10);
    return Number.isNaN(n) ? 0 : Math.min(23, Math.max(0, n));
  }

  function localTimeText(): string {
    const tz = tzPreset === "__custom__" ? (tzCustom.trim() || "UTC") : (tzPreset || "UTC");
    try {
      return new Intl.DateTimeFormat(lang === "en" ? "en-US" : lang === "kk" ? "kk-KZ" : "ru-RU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: tz,
      }).format(new Date());
    } catch {
      return "--:--";
    }
  }

  async function saveAllChanges() {
    setErr(null);
    setMsg(null);
    setSavingAll(true);
    try {
      const profileRes = await apiFetch("/api/v1/me/profile", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName.trim() || null }),
      });
      if (!profileRes.ok) {
        setErr(await friendlyApiError(profileRes));
        return;
      }
      const raw =
        tzPreset === "__custom__" ? tzCustom.trim() : tzPreset === "" ? "" : tzPreset;
      const tzRes = await apiFetch("/api/v1/me/timezone", {
        method: "PATCH",
        body: JSON.stringify({ timezone: raw === "" ? null : raw }),
      });
      if (!tzRes.ok) {
        setErr(await friendlyApiError(tzRes));
        return;
      }
      const quietBody = enabled
        ? {
            reminder_quiet_enabled: true,
            reminder_quiet_start_hour_local: hourFromTime(quietStart),
            reminder_quiet_end_hour_local: hourFromTime(quietEnd),
          }
        : { reminder_quiet_enabled: false, reminder_quiet_start_hour_local: null, reminder_quiet_end_hour_local: null };
      const quietRes = await apiFetch("/api/v1/me/reminder-quiet", {
        method: "PATCH",
        body: JSON.stringify(quietBody),
      });
      if (!quietRes.ok) {
        setErr(await friendlyApiError(quietRes));
        return;
      }
      const updated = (await quietRes.json()) as UserPublic;
      applyMeToForms(updated);
      const tgPrefRes = await apiFetch("/api/v1/me/telegram/preferences", {
        method: "PATCH",
        body: JSON.stringify({ sound_enabled: telegramSoundEnabled }),
      });
      if (!tgPrefRes.ok) {
        setErr(await friendlyApiError(tgPrefRes));
        return;
      }

      if (typeof window !== "undefined") {
        window.localStorage.setItem("qadam:theme", theme);
        document.documentElement.setAttribute("data-theme", theme);
        if (avatarDataUrl) {
          window.localStorage.setItem("qadam:avatar", avatarDataUrl);
        } else {
          window.localStorage.removeItem("qadam:avatar");
        }
      }

      setMsg(tr("Изменения сохранены.", "Өзгерістер сақталды.", "Changes saved."));
    } finally {
      setSavingAll(false);
    }
  }

  async function changePassword() {
    if (!passwordCurrent.trim() || !passwordNext.trim()) return;
    setErr(null);
    setMsg(null);
    setSecurityBusy("password");
    try {
      const res = await apiFetch("/api/v1/me/password", {
        method: "PATCH",
        body: JSON.stringify({
          current_password: passwordCurrent,
          new_password: passwordNext,
        }),
      });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      setPasswordCurrent("");
      setPasswordNext("");
      setMsg(tr("Пароль обновлён.", "Құпиясөз жаңартылды.", "Password updated."));
    } finally {
      setSecurityBusy(null);
    }
  }

  async function changeEmail() {
    if (!emailDraft.trim() || !emailPassword.trim()) return;
    setErr(null);
    setMsg(null);
    setSecurityBusy("email");
    try {
      const res = await apiFetch("/api/v1/me/email", {
        method: "PATCH",
        body: JSON.stringify({
          email: emailDraft.trim(),
          current_password: emailPassword,
        }),
      });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      applyMeToForms((await res.json()) as UserPublic);
      setEmailPassword("");
      setMsg(tr("Email обновлён.", "Email жаңартылды.", "Email updated."));
    } finally {
      setSecurityBusy(null);
    }
  }

  async function deleteAccount() {
    const ok = window.confirm(tr("Удалить аккаунт без возврата?", "Аккаунтты толық өшіреміз бе?", "Delete account permanently?"));
    if (!ok) return;
    setErr(null);
    setMsg(null);
    setSecurityBusy("delete");
    try {
      const res = await apiFetch("/api/v1/me", { method: "DELETE" });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      clearTokens();
      router.replace("/login");
    } finally {
      setSecurityBusy(null);
    }
  }

  function onAvatarChange(file: File | null) {
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setErr(tr("Файл аватара слишком большой (макс 1MB).", "Аватар файлы тым үлкен (ең көбі 1MB).", "Avatar file is too large (max 1MB)."));
      return;
    }
    const fr = new FileReader();
    fr.onload = () => {
      const v = typeof fr.result === "string" ? fr.result : null;
      setAvatarDataUrl(v);
    };
    fr.readAsDataURL(file);
  }

  return (
    <AuthGate title={tr("Настройки", "Баптаулар", "Settings")}>
      <div className="mx-auto max-w-xl px-4 py-10 text-zinc-900">
        <Link href="/" className="text-sm text-emerald-400 hover:underline">
          ← {tr("На главную", "Басты бетке", "Home")}
        </Link>
        <h1 className="mt-6 text-3xl font-semibold text-zinc-900">{tr("Настройки", "Баптаулар", "Settings")}</h1>

        {loading ? <p className="mt-8 text-sm text-zinc-600">{t("common.loading")}</p> : null}
        {err ? <p className="mt-6 text-sm text-rose-400">{err}</p> : null}
        {msg ? <p className="mt-6 text-sm text-emerald-400">{msg}</p> : null}

        {me ? (
          <>
            <section className="mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">{tr("Профиль", "Профиль", "Profile")}</h2>
              <div className="flex items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-zinc-300 bg-emerald-50 text-lg font-semibold text-emerald-700">
                  {avatarDataUrl ? <img src={avatarDataUrl} alt="avatar" className="h-full w-full object-cover" /> : (fullName.trim()[0] || me.email[0] || "Q").toUpperCase()}
                </div>
                <label className="text-sm">
                  <span className="text-zinc-700">{tr("Профиль суреті", "Профиль суреті", "Profile avatar")}</span>
                  <input type="file" accept="image/*" className="mt-2 block text-xs text-zinc-600" onChange={(e) => onAvatarChange(e.target.files?.[0] ?? null)} />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-zinc-700">{tr("Ваше имя", "Сіздің есіміңіз", "Your name")}</span>
                <input
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  maxLength={255}
                  placeholder={tr("Имя или псевдоним", "Аты немесе лақап аты", "Name or nickname")}
                />
              </label>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">{tr("Уақыт белдеуі", "Уақыт белдеуі", "Timezone")}</h2>
              <p className="text-xs text-zinc-600">
                {tr("Локальное время", "Жергілікті уақыт", "Local time")}:{" "}
                <span suppressHydrationWarning>{localTimeText()}</span>
              </p>
              <label className="block text-sm">
                <span className="text-zinc-700">{tr("Пресет", "Пресет", "Preset")}</span>
                <select
                  className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                  value={tzPreset}
                  onChange={(e) => setTzPreset(e.target.value)}
                >
                  {TZ_PRESET_VALUES.map((v) => (
                    <option key={v || "utc"} value={v}>
                      {v === ""
                        ? tr("UTC (по умолчанию)", "UTC (әдепкі)", "UTC (default)")
                        : v === "__custom__"
                          ? tr("Другое (IANA)…", "Басқа (IANA)…", "Other (IANA)…")
                          : v}
                    </option>
                  ))}
                </select>
              </label>
              {tzPreset === "__custom__" ? (
                <label className="block text-sm">
                  <span className="text-zinc-700">{tr("Название зоны", "Белдеу атауы", "Zone name")}</span>
                  <input
                    className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 font-mono text-sm text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                    value={tzCustom}
                    onChange={(e) => setTzCustom(e.target.value)}
                    placeholder="Europe/Moscow"
                  />
                </label>
              ) : null}
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">{tr("Тихие часы", "Тыныш уақыт", "Quiet hours")}</h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className="text-zinc-700">{tr("Не слать напоминания в этот локальный интервал", "Осы уақытта еске салма", "No reminders during this interval")}</span>
              </label>
              {enabled ? (
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">
                    <span className="text-zinc-700">{tr("Басталуы", "Басталуы", "Start")}</span>
                    <input
                      type="time"
                      className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-2 py-1 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                      value={quietStart}
                      onChange={(e) => setQuietStart(e.target.value)}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="text-zinc-700">{tr("Аяқталуы", "Аяқталуы", "End")}</span>
                    <input
                      type="time"
                      className="mt-2 w-full rounded-xl border border-zinc-300 bg-white px-2 py-1 text-zinc-900 outline-none ring-emerald-500/30 focus:border-emerald-500 focus:ring-2"
                      value={quietEnd}
                      onChange={(e) => setQuietEnd(e.target.value)}
                    />
                  </label>
                </div>
              ) : null}
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">{tr("Telegram уведомления", "Telegram хабарламалары", "Telegram notifications")}</h2>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={telegramSoundEnabled}
                  onChange={(e) => setTelegramSoundEnabled(e.target.checked)}
                  className="accent-emerald-500"
                />
                <span className="text-zinc-700">
                  {tr("Звуковые уведомления в Telegram", "Telegram-дағы дыбысты хабарламалар", "Telegram sound notifications")}
                </span>
              </label>
            </section>

            <section className="mt-6 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">{tr("Интерфейс", "Интерфейс", "Interface")}</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  <span className="text-zinc-700">{tr("Қолданба тілі", "Қолданба тілі", "App language")}</span>
                  <select
                    className="mt-2"
                    value={lang}
                    onChange={(e) => setLang(e.target.value as Lang)}
                  >
                    <option value="kk">Қазақша</option>
                    <option value="ru">Русский</option>
                    <option value="en">English</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="text-zinc-700">{tr("Тақырып", "Тақырып", "Theme")}</span>
                  <select
                    className="mt-2"
                    value={theme}
                    onChange={(e) => setTheme(e.target.value === "dark" ? "dark" : "light")}
                  >
                    <option value="light">{tr("Жарық", "Жарық", "Light")}</option>
                    <option value="dark">{tr("Қараңғы", "Қараңғы", "Dark")}</option>
                  </select>
                </label>
              </div>
            </section>

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                disabled={savingAll}
                onClick={() => void saveAllChanges()}
                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {savingAll ? "…" : tr("Сохранить изменения", "Өзгерістерді сақтау", "Save changes")}
              </button>
            </div>

            <section className="mt-8 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-semibold text-zinc-900">{tr("Управление аккаунтом", "Аккаунтты басқару", "Account management")}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm sm:col-span-2">
                  <span className="text-zinc-700">{tr("Email", "Email", "Email")}</span>
                  <input className="mt-2" value={emailDraft} onChange={(e) => setEmailDraft(e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="text-zinc-700">{tr("Текущий пароль", "Ағымдағы құпиясөз", "Current password")}</span>
                  <input type="password" className="mt-2" value={emailPassword} onChange={(e) => setEmailPassword(e.target.value)} />
                </label>
                <div className="flex items-end">
                  <button
                    type="button"
                    disabled={securityBusy !== null}
                    onClick={() => void changeEmail()}
                    className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {securityBusy === "email" ? "…" : tr("Изменить email", "Email өзгерту", "Change email")}
                  </button>
                </div>
                <label className="text-sm">
                  <span className="text-zinc-700">{tr("Текущий пароль", "Ағымдағы құпиясөз", "Current password")}</span>
                  <input type="password" className="mt-2" value={passwordCurrent} onChange={(e) => setPasswordCurrent(e.target.value)} />
                </label>
                <label className="text-sm">
                  <span className="text-zinc-700">{tr("Новый пароль", "Жаңа құпиясөз", "New password")}</span>
                  <input type="password" className="mt-2" value={passwordNext} onChange={(e) => setPasswordNext(e.target.value)} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={securityBusy !== null}
                  onClick={() => void changePassword()}
                  className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
                >
                  {securityBusy === "password" ? "…" : tr("Сменить пароль", "Құпиясөзді өзгерту", "Change password")}
                </button>
                <button
                  type="button"
                  disabled={securityBusy !== null}
                  onClick={() => void deleteAccount()}
                  className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                >
                  {securityBusy === "delete" ? "…" : tr("Удалить аккаунт", "Аккаунтты өшіру", "Delete account")}
                </button>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </AuthGate>
  );
}
