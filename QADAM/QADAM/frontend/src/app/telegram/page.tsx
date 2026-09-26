"use client";

import { useCallback, useEffect, useState } from "react";

import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { useI18n } from "@/lib/i18n";
import type { NotificationPublic, TelegramStatusPublic } from "@/lib/qadam-types";

export default function TelegramLinkPage() {
  const { lang, t } = useI18n();
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);
  const tokenReady = useTokenReady();
  const [msg, setMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [notifs, setNotifs] = useState<NotificationPublic[] | null>(null);
  const [notifsErr, setNotifsErr] = useState<string | null>(null);
  const [tgStatus, setTgStatus] = useState<TelegramStatusPublic | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);

  const loadNotifs = useCallback(async () => {
    if (!getAccessToken()) {
      setNotifs(null);
      return;
    }
    setNotifsErr(null);
    const res = await apiFetch("/api/v1/me/notifications?limit=20");
    if (!res.ok) {
      setNotifsErr(await friendlyApiError(res));
      setNotifs(null);
      return;
    }
    setNotifs((await res.json()) as NotificationPublic[]);
  }, []);

  const loadStatus = useCallback(async () => {
    if (!getAccessToken()) {
      setTgStatus(null);
      return;
    }
    setStatusErr(null);
    const res = await apiFetch("/api/v1/me/telegram/status");
    if (!res.ok) {
      setStatusErr(await friendlyApiError(res));
      setTgStatus(null);
      return;
    }
    setTgStatus((await res.json()) as TelegramStatusPublic);
  }, []);

  useOnLoggedOut(() => {
    setNotifs(null);
    setNotifsErr(null);
    setTgStatus(null);
    setStatusErr(null);
    setMsg(null);
    setTestMsg(null);
  });

  useEffect(() => {
    if (!tokenReady) return;
    void loadStatus();
    void loadNotifs();
  }, [tokenReady, loadNotifs, loadStatus]);

  async function getLink() {
    setMsg(null);
    if (!getAccessToken()) {
      setMsg("Требуется авторизация.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch("/api/v1/telegram/link-token", { method: "POST" });
      if (!res.ok) {
        setMsg(await friendlyApiError(res));
        return;
      }
      const body = (await res.json()) as { url?: string; detail?: string };
      if (!body.url) {
        setMsg(typeof body.detail === "string" ? body.detail : "Ссылка недоступна.");
        return;
      }
      window.open(body.url, "_blank", "noopener,noreferrer");
      setMsg(tr("Telegram открыт. Подтвердите подключение в боте командой Start.", "Telegram ашылды. Ботта Start басып, байланысты растаңыз.", "Telegram opened. Confirm connection in the bot with Start."));
      setTimeout(() => {
        void loadStatus();
      }, 1200);
    } finally {
      setLoading(false);
    }
  }

  async function sendTestMessage() {
    setTestMsg(null);
    setTesting(true);
    try {
      const res = await apiFetch("/api/v1/me/telegram/test-message", { method: "POST" });
      if (!res.ok) {
        setTestMsg(await friendlyApiError(res));
        return;
      }
      setTestMsg(tr("Тестовое уведомление отправлено.", "Тест хабарлама жіберілді.", "Test notification sent."));
      void loadNotifs();
    } finally {
      setTesting(false);
    }
  }

  const connected = !!tgStatus?.connected && !!tgStatus?.verified;

  return (
    <div className="mx-auto max-w-3xl px-6 py-12 text-zinc-900">
      <h1 className="text-3xl font-semibold">Telegram</h1>

      <div className="mt-5 flex items-center gap-3">
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${connected ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
          {connected ? tr("Активно", "Белсенді", "Connected") : tr("Не подключено", "Қосылмаған", "Not connected")}
        </span>
        {tgStatus?.telegram_user_id ? (
          <span className="text-xs text-zinc-600">ID: {tgStatus.telegram_user_id}</span>
        ) : null}
      </div>
      {statusErr ? <p className="mt-2 text-sm text-rose-500">{statusErr}</p> : null}

      <p className="mt-4 text-sm text-zinc-600">
        {tr(
          "Подключите бота и получайте ежедневные напоминания по задачам.",
          "Ботты қосып, күнделікті тапсырмалар бойынша еске салғыш алып отырыңыз.",
          "Connect the bot and receive daily reminders for your tasks.",
        )}
      </p>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_260px]">
        <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          {!connected ? (
            <button
              type="button"
              disabled={loading}
              onClick={() => void getLink()}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {loading ? "…" : t("telegram.link")}
            </button>
          ) : (
            <p className="text-sm font-medium text-emerald-700">
              {tr("Telegram уже подключен.", "Telegram әлдеқашан қосылған.", "Telegram is already connected.")}
            </p>
          )}
          {msg ? <p className="mt-3 text-sm text-zinc-700">{msg}</p> : null}

          <div className="mt-6 rounded-xl bg-zinc-50 p-4">
            <h2 className="text-sm font-semibold text-zinc-900">{tr("Как подключить бота", "Ботты қалай қосу керек", "How to connect the bot")}</h2>
            <ol className="mt-3 space-y-2 text-sm text-zinc-700">
              <li>1. {tr("Перейдите по ссылке подключения.", "Байланыстыру сілтемесіне өтіңіз.", "Open the linking URL.")}</li>
              <li>2. {tr("Нажмите /start в Telegram-боте.", "Telegram ботта /start басыңыз.", "Press /start in Telegram bot.")}</li>
              <li>3. {tr("Проверьте напоминания в настройках.", "Еске салғыштарды баптауларда тексеріңіз.", "Configure reminders in settings.")}</li>
            </ol>
          </div>

          <div className="mt-4">
            <button
              type="button"
              disabled={testing || !connected}
              onClick={() => void sendTestMessage()}
              className="rounded-xl border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
            >
              {testing ? "…" : tr("Отправить тестовое уведомление", "Тест хабарламасын жіберу", "Send test notification")}
            </button>
            {testMsg ? <p className="mt-2 text-sm text-zinc-700">{testMsg}</p> : null}
          </div>
        </section>

        <aside className="rounded-2xl border border-zinc-200 bg-gradient-to-br from-sky-50 to-emerald-50 p-5 shadow-sm">
          <div className="mx-auto w-fit rounded-full bg-white/80 p-4">
            <svg width="76" height="76" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M21.9 3.4c-.3-.2-.7-.2-1 0L2.8 11.8c-.4.2-.7.7-.6 1.2.1.5.4.8.9.9l5.1 1.4 1.9 5.3c.2.5.6.8 1.1.8.4 0 .8-.2 1-.6l8.5-16.2c.2-.4.1-.9-.3-1.2z" fill="#14b8a6"/>
            </svg>
          </div>
          <p className="mt-4 text-center text-sm text-zinc-700">
            {tr("Telegram арқылы дедлайн, ескертулер және күндік жоспарды алып отырыңыз.", "Telegram арқылы дедлайн, ескертулер және күндік жоспарды алып отырыңыз.", "Get deadlines, reminders, and your daily plan in Telegram.")}
          </p>
        </aside>
      </div>

      {tokenReady ? (
        <section className="mt-8 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-zinc-900">{t("telegram.history")}</h2>
            <button type="button" onClick={() => void loadNotifs()} className="text-xs font-medium text-emerald-600 hover:underline">
              {t("common.update")}
            </button>
          </div>
          {notifsErr ? <p className="mt-2 text-sm text-rose-500">{notifsErr}</p> : null}
          {notifs && notifs.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
              {t("telegram.empty")}
            </div>
          ) : null}
          {notifs && notifs.length > 0 ? (
            <ul className="mt-4 max-h-72 space-y-2 overflow-y-auto text-sm">
              {notifs.map((n) => (
                <li key={n.id} className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-zinc-800">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-zinc-500">{new Date(n.sent_at).toLocaleString(lang === "en" ? "en-US" : lang === "kk" ? "kk-KZ" : "ru-RU")}</span>
                    <span className={`text-xs font-semibold ${n.status === "sent" ? "text-emerald-600" : "text-rose-600"}`}>
                      {n.status === "sent" ? tr("Доставлено", "Жеткізілді", "Delivered") : tr("Ошибка", "Қате", "Failed")}
                    </span>
                  </div>
                  {n.payload && Array.isArray(n.payload.task_ids) ? (
                    <div className="mt-1 text-xs text-zinc-600">{tr("Задач в уведомлении", "Хабарламадағы тапсырма саны", "Tasks in notification")}: {(n.payload.task_ids as string[]).length}</div>
                  ) : n.payload && typeof n.payload.kind === "string" ? (
                    <div className="mt-1 text-xs text-zinc-600">{tr("Тип", "Түрі", "Type")}: {String(n.payload.kind)}</div>
                  ) : null}
                  {n.error_detail ? <div className="mt-1 text-xs text-rose-600">{n.error_detail}</div> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
