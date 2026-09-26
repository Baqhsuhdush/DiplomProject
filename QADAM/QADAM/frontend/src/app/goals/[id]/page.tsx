"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GoalFlowStepper } from "@/components/GoalFlowStepper";
import { useOnLoggedOut } from "@/hooks/useOnLoggedOut";
import { useTokenReady } from "@/hooks/useTokenReady";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { AssessmentPublic, GoalPublic, RoadmapPublic } from "@/lib/qadam-types";

function formatDue(iso: string | null, lang: "kk" | "ru" | "en") {
  if (!iso) return lang === "kk" ? "күні жоқ" : lang === "en" ? "no date" : "без даты";
  try {
    return new Date(iso).toLocaleString(lang === "kk" ? "kk-KZ" : lang === "en" ? "en-US" : "ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function mapTaskStatus(status: string, lang: "kk" | "ru" | "en"): string {
  const v = status.toLowerCase();
  if (v === "pending") return lang === "kk" ? "Күтілуде" : lang === "en" ? "Pending" : "В ожидании";
  if (v === "completed") return lang === "kk" ? "Орындалды" : lang === "en" ? "Completed" : "Готово";
  if (v === "in_progress") return lang === "kk" ? "Орындалуда" : lang === "en" ? "In progress" : "В работе";
  return status;
}

export default function GoalDetailPage() {
  const { lang, t } = useI18n();
  const tokenReady = useTokenReady();
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);

  const params = useParams();
  const searchParams = useSearchParams();
  const goalId = typeof params.id === "string" ? params.id : "";
  const created = searchParams.get("created") === "1";
  const roadmapRef = useRef<HTMLElement | null>(null);

  const [goal, setGoal] = useState<GoalPublic | null>(null);
  const [assessment, setAssessment] = useState<AssessmentPublic | null>(null);
  const [roadmap, setRoadmap] = useState<RoadmapPublic | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [level, setLevel] = useState("");
  const [hoursWeek, setHoursWeek] = useState("");
  const [discipline, setDiscipline] = useState("medium");
  const [notes, setNotes] = useState("");
  const [sportWeight, setSportWeight] = useState("");
  const [sportHeight, setSportHeight] = useState("");
  const [sportInjuries, setSportInjuries] = useState("");
  const [englishCefr, setEnglishCefr] = useState("B1");
  const [englishContext, setEnglishContext] = useState("");
  const [careerRole, setCareerRole] = useState("");
  const [careerYears, setCareerYears] = useState("");
  const [businessFocus, setBusinessFocus] = useState("");
  const [assessMsg, setAssessMsg] = useState<string | null>(null);
  const [assessErr, setAssessErr] = useState<string | null>(null);
  const [assessLoading, setAssessLoading] = useState(false);

  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [genLoading, setGenLoading] = useState(false);
  const [roadmapConfirmOpen, setRoadmapConfirmOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [previewDraft, setPreviewDraft] = useState<Record<string, string>>({});

  const loadGoal = useCallback(async () => {
    if (!goalId) return;
    const res = await apiFetch(`/api/v1/goals/${goalId}`);
    if (!res.ok) {
      setLoadError(await friendlyApiError(res));
      setGoal(null);
      return;
    }
    setGoal((await res.json()) as GoalPublic);
    setLoadError(null);
  }, [goalId]);

  const loadRoadmap = useCallback(async () => {
    if (!goalId) return;
    const res = await apiFetch(`/api/v1/goals/${goalId}/roadmap`);
    if (res.status === 404) {
      setRoadmap(null);
      return;
    }
    if (!res.ok) {
      setRoadmap(null);
      return;
    }
    setRoadmap((await res.json()) as RoadmapPublic);
  }, [goalId]);

  const loadAssessment = useCallback(async () => {
    if (!goalId) return;
    const res = await apiFetch(`/api/v1/goals/${goalId}/assessment/latest`);
    if (res.status === 404) {
      setAssessment(null);
      return;
    }
    if (!res.ok) {
      setAssessment(null);
      return;
    }
    setAssessment((await res.json()) as AssessmentPublic);
  }, [goalId]);

  useOnLoggedOut(() => {
    setGoal(null);
    setAssessment(null);
    setRoadmap(null);
    setLoadError(null);
    setLevel("");
    setHoursWeek("");
    setDiscipline("medium");
    setNotes("");
    setSportWeight("");
    setSportHeight("");
    setSportInjuries("");
    setEnglishCefr("B1");
    setEnglishContext("");
    setCareerRole("");
    setCareerYears("");
    setBusinessFocus("");
    setAssessMsg(null);
    setAssessErr(null);
    setAssessLoading(false);
    setGenMsg(null);
    setGenErr(null);
    setGenLoading(false);
    setRoadmapConfirmOpen(false);
    setPreviewMode(false);
    setPreviewDraft({});
  });

  useEffect(() => {
    if (!tokenReady || !goalId) return;
    void (async () => {
      await loadGoal();
      await Promise.all([loadRoadmap(), loadAssessment()]);
    })();
  }, [tokenReady, goalId, loadGoal, loadRoadmap, loadAssessment]);

  useEffect(() => {
    const a = assessment?.answers;
    if (!a || typeof a !== "object") return;
    const getStr = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
    const getNumStr = (k: string) => (typeof a[k] === "number" ? String(a[k]) : getStr(k));
    setLevel(getStr("current_level"));
    setHoursWeek(getNumStr("hours_per_week"));
    setDiscipline(typeof a.discipline_level === "string" && (a.discipline_level as string).trim() ? (a.discipline_level as string) : "medium");
    setNotes(getStr("notes"));
    setSportWeight(getStr("weight_kg"));
    setSportHeight(getStr("height_cm"));
    setSportInjuries(getStr("injuries_limitations"));
    setEnglishCefr(getStr("cefr_level") || "B1");
    setEnglishContext(getStr("english_goal_context"));
    setCareerRole(getStr("current_role"));
    setCareerYears(getNumStr("years_experience"));
    setBusinessFocus(getStr("business_focus"));
  }, [assessment]);

  async function submitAssessment(e: React.FormEvent) {
    e.preventDefault();
    if (!goal) return;
    setAssessErr(null);
    setAssessMsg(null);
    setAssessLoading(true);
    try {
      const answers: Record<string, unknown> = {
        discipline_level: discipline,
      };
      if (level.trim()) answers.current_level = level.trim();
      if (hoursWeek.trim()) {
        const n = Number(hoursWeek);
        if (!Number.isNaN(n)) answers.hours_per_week = n;
      }
      if (notes.trim()) answers.notes = notes.trim();
      if (goal.domain === "sport") {
        if (sportWeight.trim()) answers.weight_kg = sportWeight.trim();
        if (sportHeight.trim()) answers.height_cm = sportHeight.trim();
        if (sportInjuries.trim()) answers.injuries_limitations = sportInjuries.trim();
      }
      if (goal.domain === "english") {
        if (englishCefr.trim()) answers.cefr_level = englishCefr.trim();
        if (englishContext.trim()) answers.english_goal_context = englishContext.trim();
      }
      if (goal.domain === "career") {
        if (careerRole.trim()) answers.current_role = careerRole.trim();
        if (careerYears.trim()) {
          const y = Number(careerYears);
          if (!Number.isNaN(y)) answers.years_experience = y;
        }
      }
      if (goal.domain === "business") {
        if (businessFocus.trim()) answers.business_focus = businessFocus.trim();
      }

      const res = await apiFetch(`/api/v1/goals/${goalId}/assessment`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        setAssessErr(await friendlyApiError(res));
        return;
      }
      setAssessMsg(tr("Диагностика сохранена. Переходим к Roadmap.", "Диагностика сақталды. Енді Roadmap-қа өтеміз.", "Assessment saved. Moving to Roadmap."));
      await loadAssessment();
      roadmapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      setAssessLoading(false);
    }
  }

  function requestGenerateRoadmap() {
    if (!assessment) {
      setRoadmapConfirmOpen(true);
      return;
    }
    void runGenerateRoadmap();
  }

  async function runGenerateRoadmap() {
    setGenErr(null);
    setGenMsg(null);
    setGenLoading(true);
    try {
      const res = await apiFetch(`/api/v1/goals/${goalId}/roadmap/generate?lang=${lang}`, { method: "POST" });
      if (!res.ok) {
        setGenErr(await friendlyApiError(res));
        return;
      }
      const rm = (await res.json()) as RoadmapPublic;
      setRoadmap(rm);
      setGenMsg(`План версии ${rm.version} создан.`);
    } finally {
      setGenLoading(false);
    }
  }

  async function applyPreviewDue(taskId: string) {
    const day = (previewDraft[taskId] || "").trim();
    if (!day) return;
    const res = await apiFetch(`/api/v1/tasks/${taskId}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ due_at: new Date(`${day}T12:00:00.000Z`).toISOString() }),
    });
    if (!res.ok) {
      setGenErr(await friendlyApiError(res));
      return;
    }
    await loadRoadmap();
  }

  return (
    <AuthGate title={tr("Открыть цель", "Мақсатты ашу", "Open goal")}>
      <ConfirmDialog
        open={roadmapConfirmOpen}
        title={tr("Сформировать Roadmap без диагностики?", "Диагностикасыз Roadmap жасаймыз ба?", "Generate roadmap without assessment?")}
        description={tr(
          "Диагностические данные по цели не сохранены. В этом случае будет сформирован базовый план без дополнительного контекста.",
          "Мақсат бойынша диагностика сақталмаған. Бұл жағдайда қосымша контекстсіз базалық жоспар құрылады.",
          "Assessment data is not saved yet. A basic roadmap will be generated without extra context.",
        )}
        confirmLabel={tr("Сформировать базовый план", "Базалық жоспар жасау", "Generate basic roadmap")}
        cancelLabel={tr("Вернуться к диагностике", "Диагностикаға оралу", "Back to assessment")}
        tone="amber"
        onCancel={() => setRoadmapConfirmOpen(false)}
        onConfirm={() => {
          setRoadmapConfirmOpen(false);
          void runGenerateRoadmap();
        }}
      />
      <div className="mx-auto max-w-3xl px-4 py-10 text-zinc-900">
        <Link href="/goals" className="text-sm text-emerald-400 hover:underline">
          ← {tr("Все цели", "Барлық мақсаттар", "All goals")}
        </Link>
        {created ? (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {tr(
              "Цель успешно создана! Теперь вы можете заполнить диагностику и увидеть задачи в календаре.",
              "Мақсат сәтті құрылды! Енді диагностиканы толтырып, тапсырмаларды күнтізбеден көре аласыз.",
              "Goal created successfully! Fill in assessment and view tasks in calendar.",
            )}
          </p>
        ) : null}

        {loadError && (
          <p className="mt-6 rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 text-sm text-rose-200">{loadError}</p>
        )}

        {!goal && !loadError ? (
          <p className="mt-8 text-sm text-zinc-500">{t("common.loading")}</p>
        ) : goal ? (
          <>
            <header className="mt-6 border-b border-zinc-200 pb-6">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{goal.title}</h1>
              <p className="mt-2 text-sm text-zinc-700">
                {tr("Домен", "Бағыт", "Domain")}: <span className="font-medium text-zinc-800">{goal.domain}</span> ·{" "}
                {tr("приоритет", "басымдық", "priority")} {goal.priority} · {tr("статус", "күй", "status")}{" "}
                <span className="font-medium text-zinc-800">{goal.status}</span>
                {goal.target_date ? (
                  <>
                    {" "}
                    · {tr("до", "дейін", "until")} <span className="font-medium text-zinc-800">{goal.target_date}</span>
                  </>
                ) : null}
              </p>
            </header>

            <div className="mt-6">
              <GoalFlowStepper
                hasAssessment={assessment != null}
                hasRoadmap={roadmap != null}
                currentStep={roadmap ? 4 : assessment ? 3 : 2}
              />
            </div>

            <section id="assessment" className="mt-10 scroll-mt-20">
              <h2 className="text-lg font-medium text-zinc-900">{tr("Шаг 2. Диагностика", "2-қадам. Диагностика", "Step 2. Assessment")}</h2>
              <p className="mt-1 text-sm text-zinc-500">
                {tr(
                  "Коротко опишите текущее состояние — данные уйдут в AI при генерации плана (можно оставить часть полей пустыми).",
                  "Ағымдағы күйді қысқаша жазыңыз — бұл деректер жоспар генерациясында AI-ға беріледі (кей өрістерді бос қалдыруға болады).",
                  "Briefly describe your current state; this data will be used by AI when generating the roadmap (some fields may stay empty).",
                )}
              </p>
              <form onSubmit={submitAssessment} className="mt-4 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <label className="block text-sm">
                  <span className="text-zinc-700">{tr("Текущий уровень / опыт", "Ағымдағы деңгей / тәжірибе", "Current level / experience")}</span>
                  <input
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    placeholder={tr(
                      "например: junior, без коммерческого опыта",
                      "мысалы: junior, коммерциялық тәжірибесіз",
                      "e.g. junior, no commercial experience",
                    )}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-zinc-700">{tr("Часов в неделю на цель", "Мақсатқа аптасына сағат", "Hours per week for goal")}</span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                    value={hoursWeek}
                    onChange={(e) => setHoursWeek(e.target.value)}
                    placeholder={tr("например: 10", "мысалы: 10", "e.g. 10")}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-zinc-700">{tr("Дисциплина", "Тәртіп деңгейі", "Discipline")}</span>
                  <select
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                    value={discipline}
                    onChange={(e) => setDiscipline(e.target.value)}
                  >
                    <option value="low">{tr("низкая", "Төмен", "Low")}</option>
                    <option value="medium">{tr("средняя", "Орташа", "Medium")}</option>
                    <option value="high">{tr("высокая", "Жоғары", "High")}</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-zinc-700">{tr("Заметки", "Ескертпелер", "Notes")}</span>
                  <textarea
                    rows={3}
                    className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={tr(
                      "Сильные стороны, ограничения, контекст…",
                      "Күшті тұстар, шектеулер, контекст…",
                      "Strengths, limits, context...",
                    )}
                  />
                </label>

                {goal.domain === "sport" ? (
                  <div className="space-y-4 rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">{tr("Спорт / здоровье", "Спорт / денсаулық", "Sport / health")}</p>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Вес (кг), опционально", "Салмақ (кг), міндетті емес", "Weight (kg), optional")}</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={sportWeight}
                        onChange={(e) => setSportWeight(e.target.value)}
                        placeholder={tr("например: 72", "мысалы: 72", "e.g. 72")}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Рост (см)", "Бой (см)", "Height (cm)")}</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={sportHeight}
                        onChange={(e) => setSportHeight(e.target.value)}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Травмы / ограничения", "Жарақат / шектеулер", "Injuries / limits")}</span>
                      <textarea
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={sportInjuries}
                        onChange={(e) => setSportInjuries(e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {goal.domain === "english" ? (
                  <div className="space-y-4 rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">{tr("Английский", "Ағылшын", "English")}</p>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Уровень CEFR", "CEFR деңгейі", "CEFR level")}</span>
                      <select
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={englishCefr}
                        onChange={(e) => setEnglishCefr(e.target.value)}
                      >
                        {["A1", "A2", "B1", "B2", "C1", "C2"].map((x) => (
                          <option key={x} value={x}>
                            {x}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Контекст цели (IELTS, работа, собеседование…)", "Мақсат контексті (IELTS, жұмыс, сұхбат…)", "Goal context (IELTS, work, interview...)")}</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={englishContext}
                        onChange={(e) => setEnglishContext(e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {goal.domain === "career" ? (
                  <div className="space-y-4 rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">{tr("Карьера", "Мансап", "Career")}</p>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Текущая роль", "Ағымдағы рөл", "Current role")}</span>
                      <input
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={careerRole}
                        onChange={(e) => setCareerRole(e.target.value)}
                        placeholder={tr("например: аналитик", "мысалы: аналитик", "e.g. analyst")}
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Лет опыта в роли (число)", "Рөлдегі тәжірибе (жыл)", "Years in role")}</span>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={careerYears}
                        onChange={(e) => setCareerYears(e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {goal.domain === "business" ? (
                  <div className="space-y-4 rounded-lg border border-zinc-800/80 bg-zinc-950/30 p-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">{tr("Бизнес", "Бизнес", "Business")}</p>
                    <label className="block text-sm">
                      <span className="text-zinc-400">{tr("Фокус (ниша, продукт, этап)", "Фокус (ниша, өнім, кезең)", "Focus (niche, product, stage)")}</span>
                      <textarea
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-emerald-500/30 focus:ring-2"
                        value={businessFocus}
                        onChange={(e) => setBusinessFocus(e.target.value)}
                      />
                    </label>
                  </div>
                ) : null}

                {assessErr && <p className="text-sm text-rose-400">{assessErr}</p>}
                {assessMsg && <p className="text-sm text-emerald-400">{assessMsg}</p>}
                <button
                  type="submit"
                  disabled={assessLoading}
                  className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
                >
                  {assessLoading ? tr("Сохранение…", "Сақталуда…", "Saving...") : tr("Сохранить диагностику", "Диагностиканы сақтау", "Save assessment")}
                </button>
              </form>
            </section>

            <section id="roadmap" ref={roadmapRef} className="mt-10 scroll-mt-20">
              <h2 className="text-lg font-medium text-zinc-900">{tr("Шаг 3. Roadmap", "3-қадам. Roadmap", "Step 3. Roadmap")}</h2>
              <p className="mt-1 text-sm text-zinc-700">
                {tr(
                  "Сформируйте новую версию плана по текущей цели.",
                  "Ағымдағы мақсат үшін жоспардың жаңа нұсқасын жасаңыз.",
                  "Generate a new roadmap version for the current goal.",
                )}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={genLoading}
                  onClick={() => requestGenerateRoadmap()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                >
                  {genLoading ? "…" : tr("Сгенерировать Roadmap", "Roadmap жасау", "Generate Roadmap")}
                </button>
                <Link
                  href="/calendar"
                  className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {tr("Открыть календарь задач", "Күнтізбені ашу", "Open calendar")}
                </Link>
              </div>
              {genLoading ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-3 text-emerald-700">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
                    <span className="text-sm font-medium">
                      {tr("ИИ создаёт ваш план...", "AI сіздің жоспарыңызды құрып жатыр...", "AI is generating your roadmap...")}
                    </span>
                  </div>
                </div>
              ) : null}
              {genErr && <p className="mt-3 text-sm text-rose-400">{genErr}</p>}
              {genMsg && <p className="mt-3 text-sm text-emerald-400">{genMsg}</p>}
              <p className="mt-3 text-xs text-zinc-600">
                К задачам ниже можно подобрать материалы на YouTube (при наличии API-ключа — реальные видео, иначе
                ссылка на поиск).
              </p>
            </section>

            <section className="mt-10">
              <h2 className="text-lg font-medium text-zinc-900">{tr("Текущий план", "Ағымдағы жоспар", "Current plan")}</h2>
              {!roadmap ? (
                <p className="mt-3 text-sm text-zinc-500">
                  {tr(
                    "Активный Roadmap отсутствует — сформируйте план выше.",
                    "Белсенді Roadmap жоқ — жоғарыда жоспар жасаңыз.",
                    "No active roadmap yet — generate one above.",
                  )}
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => setPreviewMode((v) => !v)}
                      className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {previewMode
                        ? tr("Скрыть превью", "Алдын ала қарауды жасыру", "Hide preview")
                        : tr("Показать превью перед календарём", "Күнтізбеге дейін алдын ала қарау", "Show preview before calendar")}
                    </button>
                  </div>
                  {previewMode ? (
                    <div className="rounded-xl border border-zinc-200 bg-white p-4">
                      <p className="text-sm font-medium text-zinc-800">
                        {tr("Предпросмотр задач (можно поменять дату)", "Тапсырмалар алдын ала көрінісі (күнін өзгертуге болады)", "Task preview (you can edit date)")}
                      </p>
                      <ul className="mt-3 space-y-2">
                        {roadmap.steps.flatMap((s) => s.tasks).map((task) => (
                          <li key={`p-${task.id}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-700">
                            <span className="min-w-52 flex-1 font-medium text-zinc-800">{task.title}</span>
                            <input
                              type="date"
                              value={previewDraft[task.id] ?? (task.due_at ? task.due_at.slice(0, 10) : "")}
                              onChange={(e) => setPreviewDraft((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              className="w-40"
                            />
                            <button
                              type="button"
                              onClick={() => void applyPreviewDue(task.id)}
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs hover:bg-zinc-100"
                            >
                              {tr("Сохранить дату", "Күнін сақтау", "Save date")}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <p className="text-xs text-zinc-500">
                    {tr("Версия", "Нұсқа", "Version")} {roadmap.version} ·{" "}
                    {new Date(roadmap.created_at).toLocaleString(lang === "kk" ? "kk-KZ" : lang === "en" ? "en-US" : "ru-RU")}
                  </p>
                  <ol className="space-y-6">
                    {roadmap.steps
                      .slice()
                      .sort((a, b) => a.sequence_no - b.sequence_no)
                      .map((step) => (
                        <li key={step.id} className="rounded-xl border border-zinc-200 bg-white p-4">
                          <p className="text-xs font-medium uppercase tracking-wide text-emerald-500/90">
                            {tr("Этап", "Кезең", "Stage")} {step.sequence_no}
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-zinc-900">{step.title}</h3>
                          {step.description ? (
                            <p className="mt-2 text-sm leading-relaxed text-zinc-700">{step.description}</p>
                          ) : null}
                          {step.estimated_days != null ? (
                            <p className="mt-2 text-xs text-zinc-500">{tr("Оценка", "Бағалау", "Estimate")}: ~{step.estimated_days} {tr("дн.", "күн", "days")}</p>
                          ) : null}
                          {step.tasks.length > 0 ? (
                            <ul className="mt-4 space-y-3 border-t border-zinc-200 pt-3">
                              {step.tasks.map((t) => (
                                <li
                                  key={t.id}
                                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <span className="font-medium text-zinc-900">{t.title}</span>
                                    <span className="text-xs text-zinc-500">
                                      {t.task_type} · {formatDue(t.due_at, lang)} · {mapTaskStatus(t.status, lang)}
                                    </span>
                                  </div>
                                  <div className="mt-2">
                                    <Link
                                      href={`/tasks/${t.id}`}
                                      className="inline-flex rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                                    >
                                      {tr("Открыть задачу", "Тапсырманы ашу", "Open task")}
                                    </Link>
                                  </div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-3 text-xs text-zinc-600">Подзадачи для текущего этапа отсутствуют.</p>
                          )}
                        </li>
                      ))}
                  </ol>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </AuthGate>
  );
}
