"use client";

import { useI18n, type Lang } from "@/lib/i18n";

const OPTIONS: Array<{ value: Lang; label: string }> = [
  { value: "kk", label: "ҚАЗ" },
  { value: "ru", label: "РУС" },
  { value: "en", label: "ENG" },
];

export function LanguageSwitcher() {
  const { lang, setLang } = useI18n();

  return (
    <div className="inline-flex items-center gap-3 rounded-xl border border-zinc-200 bg-white/95 px-3.5 py-2.5 shadow-sm backdrop-blur">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-6 w-6 text-sky-600">
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
      <span className="text-xs font-semibold text-zinc-500">LANG</span>
      <label htmlFor="lang-switch" className="sr-only">
        Language
      </label>
      <select
        id="lang-switch"
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        className="w-auto border-0 bg-transparent px-1 py-0 text-sm font-semibold tracking-wide text-zinc-800 focus:shadow-none focus:ring-0"
      >
        {OPTIONS.map((x) => (
          <option key={x.value} value={x.value}>
            {x.label}
          </option>
        ))}
      </select>
    </div>
  );
}
