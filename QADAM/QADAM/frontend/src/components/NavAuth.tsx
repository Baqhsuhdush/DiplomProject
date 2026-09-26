"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { clearTokens, getAccessToken, matchesAuthStorageKey, QADAM_AUTH_CHANGED_EVENT } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export function NavAuth() {
  const pathname = usePathname();
  const router = useRouter();
  const [logged, setLogged] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const sync = () => setLogged(!!getAccessToken());
    sync();
    const onExpired = () => {
      sync();
      if (pathname !== "/login") {
        router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      }
    };
    const onAuthChanged = () => sync();
    const onStorage = (e: StorageEvent) => {
      if (matchesAuthStorageKey(e.key)) sync();
    };
    window.addEventListener("qadam:session-expired", onExpired);
    window.addEventListener(QADAM_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("qadam:session-expired", onExpired);
      window.removeEventListener(QADAM_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname, router]);

  const isAuthPage = pathname === "/login";

  if (isAuthPage) {
    return null;
  }

  if (logged) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-2">
        <button
          type="button"
          className="w-full rounded-lg px-4 py-2 text-left text-base font-semibold text-zinc-700 transition hover:bg-rose-50 hover:text-rose-700"
          onClick={() => {
            clearTokens();
            setLogged(false);
            router.push("/login");
            router.refresh();
          }}
        >
          {t("auth.logout")}
        </button>
      </div>
    );
  }

  return (
    <Link className="block rounded-lg px-4 py-2 text-base font-semibold text-zinc-700 transition hover:bg-zinc-100 hover:text-zinc-900" href="/login">
      {t("auth.login")}
    </Link>
  );
}
