"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import type {
  AdminAuditLogPublic,
  AdminRoadmapRow,
  AdminUserProgressPublic,
  AdminUserRow,
  RoadmapStatusPublic,
  UserPublic,
} from "@/lib/qadam-types";

type UserConfirmPatch =
  | { kind: "deactivate"; user: AdminUserRow }
  | { kind: "super"; user: AdminUserRow; nextSuper: boolean };

function AdminUserProgressRow({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminUserProgressPublic | null>(null);
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState<string | null>(null);

  async function load() {
    setLocalErr(null);
    setLoading(true);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${userId}/progress`);
      if (!res.ok) {
        setLocalErr(await friendlyApiError(res));
        setData(null);
        return;
      }
      setData((await res.json()) as AdminUserProgressPublic);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-2 border-t border-zinc-800/80 pt-2">
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="text-xs text-emerald-400 hover:underline disabled:opacity-50"
      >
        {loading ? "…" : data ? "Обновить отчет" : "Отчет за 7 дней"}
      </button>
      {localErr ? <p className="mt-1 text-xs text-rose-400">{localErr}</p> : null}
      {data ? (
        <dl className="mt-2 grid gap-1 text-xs text-zinc-400 sm:grid-cols-2">
          <div>
            Цели: {data.goals_active}/{data.goals_total} активных
          </div>
          <div>Задачи всего: {data.tasks_total}</div>
          <div>Активных Roadmap: {data.active_roadmaps}</div>
          <div>Задачи «готово» (7д): {data.tasks_completed_last_7_days}</div>
          <div>Тесты (7д): {data.tests_attempts_last_7_days}</div>
          <div>Домашки (7д): {data.homework_submissions_last_7_days}</div>
        </dl>
      ) : null}
    </div>
  );
}

export default function AdminPage() {
  const tokenReady = useTokenReady();
  const [me, setMe] = useState<UserPublic | null>(null);
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [openProgress, setOpenProgress] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [roadmaps, setRoadmaps] = useState<AdminRoadmapRow[] | null>(null);
  const [roadmapStatusFilter, setRoadmapStatusFilter] = useState<string>("");
  const [roadmapUserFilter, setRoadmapUserFilter] = useState<string>("");
  const [roadmapMsg, setRoadmapMsg] = useState<string | null>(null);
  const [roadmapErr, setRoadmapErr] = useState<string | null>(null);
  const [roadmapSavingId, setRoadmapSavingId] = useState<string | null>(null);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLogPublic[] | null>(null);
  const [auditErr, setAuditErr] = useState<string | null>(null);
  const [userPatchingId, setUserPatchingId] = useState<string | null>(null);
  const [userPatchErr, setUserPatchErr] = useState<string | null>(null);
  const [auditActionDraft, setAuditActionDraft] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [userConfirm, setUserConfirm] = useState<UserConfirmPatch | null>(null);

  const loadAuditLogs = useCallback(async () => {
    setAuditErr(null);
    const qs = new URLSearchParams({ limit: "80" });
    if (auditActionFilter.trim()) qs.set("action", auditActionFilter.trim());
    const res = await apiFetch(`/api/v1/admin/audit-logs?${qs.toString()}`);
    if (!res.ok) {
      setAuditErr(await friendlyApiError(res));
      setAuditLogs(null);
      return;
    }
    setAuditLogs((await res.json()) as AdminAuditLogPublic[]);
  }, [auditActionFilter]);

  const load = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      const meRes = await apiFetch("/api/v1/me");
      if (!meRes.ok) {
        setErr(await friendlyApiError(meRes));
        setMe(null);
        setUsers(null);
        setAuditLogs(null);
        setAuditErr(null);
        return;
      }
      const profile = (await meRes.json()) as UserPublic;
      setMe(profile);
      if (!profile.is_superuser) {
        setUsers(null);
        setAuditLogs(null);
        setAuditErr(null);
        return;
      }
      const uRes = await apiFetch("/api/v1/admin/users");
      if (!uRes.ok) {
        setErr(await friendlyApiError(uRes));
        setUsers(null);
        setAuditLogs(null);
        return;
      }
      setUsers((await uRes.json()) as AdminUserRow[]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRoadmaps = useCallback(async () => {
    const qs = new URLSearchParams();
    qs.set("limit", "100");
    if (roadmapStatusFilter) qs.set("status", roadmapStatusFilter);
    if (roadmapUserFilter) qs.set("user_id", roadmapUserFilter);
    const res = await apiFetch(`/api/v1/admin/roadmaps?${qs.toString()}`);
    if (!res.ok) {
      setRoadmapErr(await friendlyApiError(res));
      setRoadmaps(null);
      return;
    }
    setRoadmapErr(null);
    setRoadmaps((await res.json()) as AdminRoadmapRow[]);
  }, [roadmapStatusFilter, roadmapUserFilter]);

  useOnLoggedOut(() => {
    setMe(null);
    setUsers(null);
    setOpenProgress(null);
    setErr(null);
    setLoading(false);
    setRoadmaps(null);
    setRoadmapMsg(null);
    setRoadmapErr(null);
    setRoadmapSavingId(null);
    setAuditLogs(null);
    setAuditErr(null);
    setUserPatchingId(null);
    setUserPatchErr(null);
    setUserConfirm(null);
  });

  useEffect(() => {
    if (!tokenReady) return;
    void load();
  }, [tokenReady, load]);

  useEffect(() => {
    if (!tokenReady || !me?.is_superuser) {
      setRoadmaps(null);
      return;
    }
    void loadRoadmaps();
  }, [tokenReady, me?.is_superuser, loadRoadmaps]);

  useEffect(() => {
    if (!tokenReady || !me?.is_superuser) {
      setAuditLogs(null);
      setAuditErr(null);
      return;
    }
    void loadAuditLogs();
  }, [tokenReady, me?.is_superuser, loadAuditLogs]);

  async function runPatchUser(userId: string, body: Record<string, boolean>): Promise<boolean> {
    setUserPatchingId(userId);
    setUserPatchErr(null);
    try {
      const res = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setUserPatchErr(await friendlyApiError(res));
        return false;
      }
      const row = (await res.json()) as AdminUserRow;
      setUsers((prev) => (prev ? prev.map((x) => (x.id === row.id ? row : x)) : null));
      await loadAuditLogs();
      return true;
    } finally {
      setUserPatchingId(null);
    }
  }

  function toggleUserActive(u: AdminUserRow) {
    if (!me) return;
    const next = !u.is_active;
    if (u.id === me.id && !next) return;
    if (!next) {
      setUserConfirm({ kind: "deactivate", user: u });
      return;
    }
    void runPatchUser(u.id, { is_active: true });
  }

  function requestSuperToggle(u: AdminUserRow) {
    if (!me || u.id === me.id) return;
    setUserConfirm({ kind: "super", user: u, nextSuper: !u.is_superuser });
  }

  async function confirmUserAction() {
    if (!userConfirm) return;
    const prev = userConfirm;
    const ok =
      prev.kind === "deactivate"
        ? await runPatchUser(prev.user.id, { is_active: false })
        : await runPatchUser(prev.user.id, { is_superuser: prev.nextSuper });
    if (ok) setUserConfirm(null);
  }

  async function patchRoadmap(id: string, status: "active" | "archived") {
    setRoadmapErr(null);
    setRoadmapMsg(null);
    setRoadmapSavingId(id);
    try {
      const res = await apiFetch(`/api/v1/admin/roadmaps/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        setRoadmapErr(await friendlyApiError(res));
        return;
      }
      const body = (await res.json()) as RoadmapStatusPublic;
      setRoadmapMsg(`Статус roadmap ${body.id}: «${body.status}».`);
      await loadRoadmaps();
      await loadAuditLogs();
    } finally {
      setRoadmapSavingId(null);
    }
  }

  return (
    <AuthGate title="Требуется авторизация для доступа к панели администратора.">
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-100">
        <Link href="/" className="text-sm text-emerald-400 hover:underline">
          ← На главную
        </Link>
        <h1 className="mt-6 text-2xl font-semibold">Админ</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Раздел доступен учетным записям с правами <code className="text-zinc-400">is_superuser</code>.
        </p>

        {loading ? <p className="mt-8 text-sm text-zinc-500">Загрузка…</p> : null}
        {err ? <p className="mt-6 text-sm text-rose-400">{err}</p> : null}

        {!loading && me && !me.is_superuser ? (
          <p className="mt-8 rounded-lg border border-amber-900/40 bg-amber-950/30 p-4 text-sm text-amber-200">
            Недостаточно прав для доступа к административному разделу.
          </p>
        ) : null}

        {!loading && me?.is_superuser && users ? (
          <section className="mt-8">
            <h2 className="text-sm font-medium text-zinc-300">Пользователи ({users.length})</h2>
            {userPatchErr ? <p className="mt-2 text-sm text-rose-400">{userPatchErr}</p> : null}
            <ul className="mt-3 divide-y divide-zinc-800 rounded-xl border border-zinc-800 bg-zinc-900/40">
              {users.map((u) => (
                <li key={u.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono text-xs text-zinc-500">{u.id}</span>
                    <span className="text-zinc-200">{u.email}</span>
                    <span className="text-xs text-zinc-500">
                      {u.is_active ? "активен" : "выкл"}
                      {u.is_superuser ? " · superuser" : ""}
                    </span>
                    <span className="text-xs text-zinc-600">{new Date(u.created_at).toLocaleString("ru-RU")}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {u.id !== me.id ? (
                        <button
                          type="button"
                          disabled={userPatchingId === u.id}
                          onClick={() => toggleUserActive(u)}
                          className="rounded border border-zinc-600 px-2 py-0.5 text-xs text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
                        >
                          {userPatchingId === u.id ? "…" : u.is_active ? "Отключить" : "Включить"}
                        </button>
                      ) : null}
                      {u.id !== me.id ? (
                        <button
                          type="button"
                          disabled={userPatchingId === u.id}
                          onClick={() => requestSuperToggle(u)}
                          className="rounded border border-amber-900/50 px-2 py-0.5 text-xs text-amber-200/90 hover:bg-amber-950/30 disabled:opacity-50"
                        >
                          {userPatchingId === u.id ? "…" : u.is_superuser ? "Снять superuser" : "Superuser"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="text-xs text-emerald-400 hover:underline"
                        onClick={() => setOpenProgress((cur) => (cur === u.id ? null : u.id))}
                      >
                        {openProgress === u.id ? "Скрыть" : "Сводка"}
                      </button>
                    </div>
                  </div>
                  {openProgress === u.id ? <AdminUserProgressRow userId={u.id} /> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!loading && me?.is_superuser ? (
          <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-300">Roadmap</h2>
                <p className="mt-1 text-xs text-zinc-500">Список с целью и email; смена статуса без ручного UUID.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadRoadmaps()}
                className="text-xs text-emerald-400 hover:underline"
              >
                Обновить список
              </button>
            </div>
            {roadmapErr ? <p className="mt-3 text-sm text-rose-400">{roadmapErr}</p> : null}
            {roadmapMsg ? <p className="mt-3 text-sm text-emerald-400">{roadmapMsg}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <label className="block">
                <span className="text-xs text-zinc-500">Статус</span>
                <select
                  className="mt-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-200"
                  value={roadmapStatusFilter}
                  onChange={(e) => setRoadmapStatusFilter(e.target.value)}
                >
                  <option value="">все</option>
                  <option value="active">active</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label className="block min-w-[200px] flex-1">
                <span className="text-xs text-zinc-500">Пользователь (UUID)</span>
                <input
                  className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-xs outline-none ring-emerald-500/30 focus:ring-2"
                  value={roadmapUserFilter}
                  onChange={(e) => setRoadmapUserFilter(e.target.value)}
                  placeholder="пусто = все"
                />
              </label>
            </div>
            {roadmaps && roadmaps.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Записи по выбранному фильтру отсутствуют.</p>
            ) : null}
            {roadmaps && roadmaps.length > 0 ? (
              <div className="mt-4 overflow-x-auto rounded-lg border border-zinc-800/80">
                <table className="w-full min-w-[640px] text-left text-xs">
                  <thead className="border-b border-zinc-800 bg-zinc-950/80 text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">Цель</th>
                      <th className="px-3 py-2 font-medium">Пользователь</th>
                      <th className="px-3 py-2 font-medium">v</th>
                      <th className="px-3 py-2 font-medium">Статус</th>
                      <th className="px-3 py-2 font-medium">Создан</th>
                      <th className="px-3 py-2 font-medium">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/80">
                    {roadmaps.map((r) => (
                      <tr key={r.id} className="text-zinc-300">
                        <td className="max-w-[220px] px-3 py-2">
                          <span className="line-clamp-2" title={r.goal_title}>
                            {r.goal_title}
                          </span>
                          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{r.id}</div>
                        </td>
                        <td className="px-3 py-2">
                          <div>{r.user_email}</div>
                          <div className="font-mono text-[10px] text-zinc-600">{r.user_id}</div>
                        </td>
                        <td className="px-3 py-2">{r.version}</td>
                        <td className="px-3 py-2">{r.status}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-zinc-500">
                          {new Date(r.created_at).toLocaleString("ru-RU")}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {r.status !== "archived" ? (
                              <button
                                type="button"
                                disabled={roadmapSavingId === r.id}
                                onClick={() => void patchRoadmap(r.id, "archived")}
                                className="rounded border border-zinc-600 px-2 py-0.5 hover:bg-zinc-800 disabled:opacity-50"
                              >
                                В архив
                              </button>
                            ) : null}
                            {r.status !== "active" ? (
                              <button
                                type="button"
                                disabled={roadmapSavingId === r.id}
                                onClick={() => void patchRoadmap(r.id, "active")}
                                className="rounded border border-emerald-800 px-2 py-0.5 text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-50"
                              >
                                Активировать
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}

        {!loading && me?.is_superuser ? (
          <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-medium text-zinc-300">Аудит действий</h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Roadmap, учётки, superuser — фильтр по полю action.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadAuditLogs()}
                className="text-xs text-emerald-400 hover:underline"
              >
                Обновить
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2 text-xs">
              <label className="block min-w-[200px] flex-1">
                <span className="text-zinc-500">action (точное совпадение)</span>
                <input
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
                  value={auditActionDraft}
                  onChange={(e) => setAuditActionDraft(e.target.value)}
                  placeholder="user.patch_active"
                />
              </label>
              <button
                type="button"
                onClick={() => setAuditActionFilter(auditActionDraft.trim())}
                className="rounded border border-zinc-600 px-3 py-1 text-zinc-200 hover:bg-zinc-800"
              >
                Применить
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuditActionDraft("");
                  setAuditActionFilter("");
                }}
                className="rounded border border-zinc-700 px-3 py-1 text-zinc-400 hover:bg-zinc-900"
              >
                Сброс
              </button>
            </div>
            {auditActionFilter ? (
              <p className="mt-2 text-xs text-zinc-500">
                Фильтр: <code className="text-zinc-400">{auditActionFilter}</code>
              </p>
            ) : null}
            {auditErr ? <p className="mt-3 text-sm text-rose-400">{auditErr}</p> : null}
            {auditLogs && auditLogs.length === 0 ? (
              <p className="mt-4 text-sm text-zinc-500">Записи отсутствуют.</p>
            ) : null}
            {auditLogs && auditLogs.length > 0 ? (
              <ul className="mt-4 max-h-80 divide-y divide-zinc-800/80 overflow-y-auto text-xs">
                {auditLogs.map((a) => (
                  <li key={a.id} className="py-2 text-zinc-300">
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      <span className="text-zinc-500">{new Date(a.created_at).toLocaleString("ru-RU")}</span>
                      <span className="font-medium text-zinc-200">{a.actor_email}</span>
                      <span className="text-amber-200/90">{a.action}</span>
                      {a.ip_address ? <span className="text-zinc-600">IP {a.ip_address}</span> : null}
                    </div>
                    {a.target_type || a.target_id ? (
                      <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
                        {a.target_type ?? "—"} {a.target_id ?? ""}
                      </div>
                    ) : null}
                    {a.user_agent ? (
                      <div className="mt-0.5 line-clamp-2 text-[10px] text-zinc-600" title={a.user_agent}>
                        UA: {a.user_agent}
                      </div>
                    ) : null}
                    {a.payload && Object.keys(a.payload).length > 0 ? (
                      <pre className="mt-1 max-w-full overflow-x-auto rounded bg-zinc-950/80 p-2 text-[10px] text-zinc-500">
                        {JSON.stringify(a.payload, null, 0)}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        <ConfirmDialog
          open={userConfirm !== null}
          title={
            userConfirm?.kind === "deactivate"
              ? "Отключить пользователя?"
              : userConfirm?.nextSuper
                ? "Выдать superuser?"
                : "Снять superuser?"
          }
          description={
            userConfirm?.kind === "deactivate"
              ? `Учетная запись ${userConfirm.user.email} будет заблокирована до повторного включения.`
              : userConfirm && userConfirm.kind === "super" && userConfirm.nextSuper
                ? `Пользователь ${userConfirm.user.email} получит полный доступ к админ-API.`
                : userConfirm && userConfirm.kind === "super"
                  ? `У ${userConfirm.user.email} будут отозваны права superuser.`
                  : ""
          }
          confirmLabel={userConfirm?.kind === "deactivate" ? "Отключить" : userConfirm?.nextSuper ? "Выдать" : "Снять"}
          tone="amber"
          onCancel={() => setUserConfirm(null)}
          onConfirm={() => void confirmUserAction()}
        />
      </div>
    </AuthGate>
  );
}
