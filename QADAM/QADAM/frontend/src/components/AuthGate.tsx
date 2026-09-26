"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTokenReady } from "@/hooks/useTokenReady";
import { useI18n } from "@/lib/i18n";

type Props = {
  title: string;
  children: React.ReactNode;
};

export function AuthGate({ title, children }: Props) {
  const ready = useTokenReady();
  const pathname = usePathname();
  const { t } = useI18n();
  const loginHref =
    pathname && pathname !== "/login"
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";

  if (!ready) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center text-zinc-300">
        <p className="text-lg">{title}</p>
        <Link className="mt-4 inline-block text-emerald-400 hover:underline" href={loginHref}>
          {t("auth.login")}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
