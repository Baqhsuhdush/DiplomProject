"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { getAccessToken, matchesAuthStorageKey, QADAM_AUTH_CHANGED_EVENT } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

function IconHome() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <path
        d="M3 10.75 12 3l9 7.75M5.25 9.5V21h13.5V9.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <rect x="3.5" y="5.5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7 3.5v4M17 3.5v4M3.5 9.5h17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconChart() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <path d="M4 20h16M7.5 16v-4M12 16V9M16.5 16v-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <path
        d="m9.8 3.9.5 1.8a6.9 6.9 0 0 1 3.4 0l.5-1.8 2.8 1.1-.5 1.8a7 7 0 0 1 2.4 2.4l1.8-.5 1.1 2.8-1.8.5a6.9 6.9 0 0 1 0 3.4l1.8.5-1.1 2.8-1.8-.5a7 7 0 0 1-2.4 2.4l.5 1.8-2.8 1.1-.5-1.8a6.9 6.9 0 0 1-3.4 0l-.5 1.8-2.8-1.1.5-1.8a7 7 0 0 1-2.4-2.4l-1.8.5-1.1-2.8 1.8-.5a6.9 6.9 0 0 1 0-3.4l-1.8-.5 1.1-2.8 1.8.5a7 7 0 0 1 2.4-2.4l-.5-1.8 2.8-1.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function IconTelegram() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
      <path
        d="M20.6 4.2 3.9 10.7c-.8.3-.8 1.4 0 1.7l4.2 1.5 1.6 4.6c.3.8 1.3.9 1.8.2l2.6-3.3 4.2 3.1c.7.5 1.7.1 1.9-.8l2.2-12.6c.2-1-.8-1.8-1.8-1.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="m8.4 13.8 9.8-7.1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PrimaryNav() {
  const pathname = usePathname();
  const [logged, setLogged] = useState(false);
  const { t } = useI18n();
  const isAuthPage = pathname === "/login";

  const privateLinks = [
    { href: "/goals", label: t("nav.goals"), icon: <IconTarget /> },
    { href: "/calendar", label: t("nav.calendar"), icon: <IconCalendar /> },
    { href: "/progress", label: t("nav.progress"), icon: <IconChart /> },
    { href: "/settings", label: t("nav.settings"), icon: <IconSettings /> },
    { href: "/telegram", label: t("nav.telegram"), icon: <IconTelegram /> },
  ];

  useEffect(() => {
    const sync = () => setLogged(!!getAccessToken());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (matchesAuthStorageKey(e.key)) sync();
    };
    window.addEventListener(QADAM_AUTH_CHANGED_EVENT, sync);
    window.addEventListener("qadam:session-expired", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(QADAM_AUTH_CHANGED_EVENT, sync);
      window.removeEventListener("qadam:session-expired", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <nav className="flex flex-col gap-2.5">
      <Link
        href="/"
        className={`group relative rounded-xl px-4 py-3.5 text-base font-semibold transition-all duration-150 hover:bg-zinc-100 ${
          pathname === "/" ? "bg-emerald-50 text-zinc-900 shadow-sm" : "text-zinc-700"
        }`}
      >
        <span
          className={`absolute left-0 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r ${
            pathname === "/" ? "bg-emerald-500" : "bg-transparent group-hover:bg-zinc-300"
          }`}
        />
        <span className="ml-2 inline-flex items-center gap-3">
          <span aria-hidden className="text-zinc-500 group-hover:text-zinc-700">
            <IconHome />
          </span>
          <span>{t("nav.home")}</span>
        </span>
      </Link>
      {logged && !isAuthPage
        ? privateLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`group relative rounded-xl px-4 py-3.5 text-base font-semibold transition-all duration-150 hover:bg-zinc-100 ${
                pathname?.startsWith(item.href)
                  ? "bg-emerald-50 text-zinc-900 shadow-sm"
                  : "text-zinc-700"
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r ${
                  pathname?.startsWith(item.href)
                    ? "bg-emerald-500"
                    : "bg-transparent group-hover:bg-zinc-300"
                }`}
              />
              <span className="ml-2 inline-flex items-center gap-3">
                <span aria-hidden className="text-zinc-500 group-hover:text-zinc-700">
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </span>
            </Link>
          ))
        : null}
    </nav>
  );
}
