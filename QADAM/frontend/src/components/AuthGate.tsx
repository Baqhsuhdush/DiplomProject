"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useTokenReady } from "@/hooks/useTokenReady";
import { useI18n } from "@/lib/i18n";

type Props = {
  title: string;
  children: React.ReactNode;
};

export function AuthGate({ title, children }: Props) {
  const ready = useTokenReady();
  const pathname = usePathname();
  const router = useRouter();
  const [redirectArmed, setRedirectArmed] = useState(false);
  const { t } = useI18n();
  const loginHref =
    pathname && pathname !== "/login"
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  useEffect(() => {
    const id = window.setTimeout(() => setRedirectArmed(true), 250);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (redirectArmed && !ready) router.replace(loginHref);
  }, [redirectArmed, ready, router, loginHref]);

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-zinc-300">
        <p className="text-lg">{title}</p>
        <p className="mt-3 text-sm text-zinc-500">{t("common.loading")}</p>
        <Link className="mt-4 inline-block text-emerald-500 hover:underline" href={loginHref}>
          {t("auth.login")}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
