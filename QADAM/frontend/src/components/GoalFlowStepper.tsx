"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

type Step = {
  n: number;
  label: string;
  done: boolean;
  href?: string;
};

type Props = {
  hasAssessment: boolean;
  hasRoadmap: boolean;
  currentStep?: 1 | 2 | 3 | 4;
};

export function GoalFlowStepper({ hasAssessment, hasRoadmap, currentStep = 1 }: Props) {
  const { t } = useI18n();
  const steps: Step[] = [
    { n: 1, label: t("stepper.goal"), done: true },
    { n: 2, label: t("stepper.assessment"), done: hasAssessment },
    { n: 3, label: "Roadmap", done: hasRoadmap },
    {
      n: 4,
      label: t("stepper.tasks"),
      done: hasRoadmap,
      href: "/calendar",
    },
  ];

  return (
    <nav aria-label="Qadam steps" className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-700">{t("stepper.title")}</p>
      <ol className="mt-3 flex flex-wrap gap-2 text-xs sm:gap-3">
        {steps.map((s, i) => (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 ? <span className="text-zinc-400" aria-hidden="true">→</span> : null}
            {s.href ? (
              <Link
                href={s.href}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${
                  s.done
                    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                    : currentStep === s.n
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                    : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-300 hover:bg-zinc-200"
                }`}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-semibold ring-1 ring-current/20">
                  {s.done ? "✓" : s.n}
                </span>
                {s.label}
              </Link>
            ) : (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 ${
                  s.done
                    ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300"
                    : currentStep === s.n
                      ? "bg-blue-50 text-blue-700 ring-1 ring-blue-300"
                      : "bg-zinc-100 text-zinc-700 ring-1 ring-zinc-300"
                }`}
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white text-[10px] font-semibold ring-1 ring-current/20">
                  {s.done ? "✓" : s.n}
                </span>
                {s.label}
                {s.done ? (
                  <span className="sr-only">{t("stepper.done")}</span>
                ) : null}
              </span>
            )}
          </li>
        ))}
      </ol>
      {!hasAssessment ? (
        <p className="mt-3 text-xs text-amber-700">
          {t("stepper.saveAssessment")}
        </p>
      ) : null}
      {hasAssessment && !hasRoadmap ? (
        <p className="mt-3 text-xs text-zinc-600">{t("stepper.generateRoadmap")}</p>
      ) : null}
    </nav>
  );
}
