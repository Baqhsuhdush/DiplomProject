"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { getAccessToken, matchesAuthStorageKey, QADAM_AUTH_CHANGED_EVENT } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import type { UserPublic } from "@/lib/qadam-types";

export function AdminNavLink() {
  const [show, setShow] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    let seq = 0;

    const run = async () => {
      const my = ++seq;
      if (!getAccessToken()) {
        setShow(false);
        return;
      }
      try {
        const res = await apiFetch("/api/v1/me");
        if (my !== seq) return;
        if (!res.ok) {
          setShow(false);
          return;
        }
        const u = (await res.json()) as UserPublic;
        if (my !== seq) return;
        setShow(!!u.is_superuser);
      } catch {
        if (my === seq) setShow(false);
      }
    };

    const onSessionExpired = () => setShow(false);
    const onAuthChanged = () => void run();
    const onStorage = (e: StorageEvent) => {
      if (matchesAuthStorageKey(e.key)) void run();
    };

    void run();
    window.addEventListener("qadam:session-expired", onSessionExpired);
    window.addEventListener(QADAM_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("storage", onStorage);

    return () => {
      seq += 1;
      window.removeEventListener("qadam:session-expired", onSessionExpired);
      window.removeEventListener(QADAM_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  if (!show) return null;

  return (
    <Link className="rounded-lg px-4 py-2 text-base font-medium transition hover:bg-zinc-100 hover:text-zinc-900" href="/admin">
      {t("admin.link")}
    </Link>
  );
}
