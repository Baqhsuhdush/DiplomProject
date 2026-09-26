"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { AuthGate } from "@/components/AuthGate";
import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { AttemptResultPublic, HomeworkViewPublic, LearningResourcePublic, TestViewPublic } from "@/lib/qadam-types";

type TaskItem = {
  id: string;
  goal_id: string;
  title: string;
  task_type: string;
  status: string;
  due_at: string | null;
};

function extractYoutubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/results")) {
        return null;
      }
      const v = u.searchParams.get("v");
      return v ? `https://www.youtube.com/embed/${v}` : null;
    }
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.replace("/", "");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function isYoutubeResultsPageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.includes("youtube.com") && u.pathname.startsWith("/results");
  } catch {
    return false;
  }
}

function isYoutubeSearchOnly(resources: LearningResourcePublic[]): boolean {
  if (!resources.length) return false;
  return resources.every((r) => r.source === "youtube_search" || isYoutubeResultsPageUrl(r.url));
}

function isVideoTask(task: TaskItem | null): boolean {
  if (!task) return false;
  const title = (task.title || "").toLowerCase();
  const keys = ["видео", "video", "youtube", "watch", "қара", "сабақ", "lesson"];
  return keys.some((k) => title.includes(k));
}

export default function TaskPage() {
  const { lang } = useI18n();
  const params = useParams<{ id: string }>();
  const taskId = params.id;
  const [task, setTask] = useState<TaskItem | null>(null);
  const [resources, setResources] = useState<LearningResourcePublic[]>([]);
  const [test, setTest] = useState<TestViewPublic | null>(null);
  const [attempt, setAttempt] = useState<AttemptResultPublic | null>(null);
  const [essayText, setEssayText] = useState("");
  const [essayResult, setEssayResult] = useState<HomeworkViewPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [autoResourceTried, setAutoResourceTried] = useState(false);
  const [autoTestTried, setAutoTestTried] = useState(false);

  const essayMode = useMemo(() => {
    const type = (task?.task_type ?? "").toLowerCase();
    return type === "homework" || type === "review" || type === "other";
  }, [task?.task_type]);

  const videoUrl = useMemo(() => {
    for (const r of resources) {
      const embed = extractYoutubeEmbed(r.url);
      if (embed) return embed;
    }
    return null;
  }, [resources]);
  const searchFallbackOnly = useMemo(() => isYoutubeSearchOnly(resources), [resources]);
  const videoTask = useMemo(() => isVideoTask(task), [task]);

  useEffect(() => {
    async function load() {
      setAutoResourceTried(false);
      setAutoTestTried(false);
      setLoading(true);
      setErr(null);
      try {
        const [taskRes, resRes, testRes, hwRes] = await Promise.all([
          apiFetch(`/api/v1/tasks/${taskId}`),
          apiFetch(`/api/v1/tasks/${taskId}/resources`),
          apiFetch(`/api/v1/tasks/${taskId}/tests/latest`),
          apiFetch(`/api/v1/tasks/${taskId}/homework/latest`),
        ]);
        if (!taskRes.ok) {
          setErr(await friendlyApiError(taskRes));
          return;
        }
        setTask((await taskRes.json()) as TaskItem);
        setResources(resRes.ok ? ((await resRes.json()) as LearningResourcePublic[]) : []);
        const loadedTest = testRes.ok ? ((await testRes.json()) as TestViewPublic) : null;
        setTest(loadedTest);
        if (loadedTest) {
          const attemptRes = await apiFetch(`/api/v1/tests/${loadedTest.id}/attempt/latest`);
          setAttempt(attemptRes.ok ? ((await attemptRes.json()) as AttemptResultPublic) : null);
        } else {
          setAttempt(null);
        }
        setEssayResult(hwRes.ok ? ((await hwRes.json()) as HomeworkViewPublic) : null);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [taskId]);

  useEffect(() => {
    if (loading || busy) return;
    const hasEmbeddedVideo = resources.some((r) => extractYoutubeEmbed(r.url));
    if (!autoResourceTried && (!resources.length || !hasEmbeddedVideo)) {
      setAutoResourceTried(true);
      void generateResources();
    }
  }, [loading, busy, resources, autoResourceTried]);

  useEffect(() => {
    if (loading || busy || essayMode) return;
    if (!autoTestTried && !test) {
      setAutoTestTried(true);
      void ensureTest();
    }
  }, [loading, busy, essayMode, autoTestTried, test, lang]);

  async function generateResources() {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/v1/tasks/${taskId}/resources/generate`, { method: "POST" });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      setResources((await res.json()) as LearningResourcePublic[]);
    } finally {
      setBusy(false);
    }
  }

  async function ensureTest() {
    if (test) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/v1/tasks/${taskId}/tests/generate?lang=${lang}`, { method: "POST" });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      const t = (await res.json()) as TestViewPublic;
      setTest(t);
      setAttempt(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitTest(indexByQuestion: Record<string, unknown>) {
    if (!test || attempt) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch(`/api/v1/tests/${test.id}/attempt`, {
        method: "POST",
        body: JSON.stringify({ answers: indexByQuestion }),
      });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      setAttempt((await res.json()) as AttemptResultPublic);
    } finally {
      setBusy(false);
    }
  }

  async function submitEssay() {
    if (!essayText.trim()) return;
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("text_answer", essayText.trim());
      const res = await apiFetch(`/api/v1/tasks/${taskId}/homework/submit`, { method: "POST", body: fd });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      setEssayResult((await res.json()) as HomeworkViewPublic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthGate title={task?.title ?? "Task"}>
      <div className="mx-auto max-w-4xl px-4 py-8 text-zinc-900">
        <Link href="/calendar" className="text-sm font-medium text-emerald-700 hover:underline">
          ← Күнтізбеге қайту
        </Link>
        {err ? <p className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}
        {loading ? (
          <p className="mt-6 text-sm text-zinc-600">Жүктелуде…</p>
        ) : task ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <h1 className="text-2xl font-bold">{task.title}</h1>
              <p className="mt-1 text-sm text-zinc-600">type: {task.task_type} · status: {task.status}</p>
              {task.due_at ? <p className="text-sm text-zinc-600">due: {new Date(task.due_at).toLocaleString("ru-RU")}</p> : null}
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold">{videoTask ? "Видео-урок" : "Материалдар"}</h2>
              </div>
              {videoUrl ? (
                <div className="aspect-video overflow-hidden rounded-lg border border-zinc-200">
                  <iframe
                    src={videoUrl}
                    title="Task lesson"
                    className="h-full w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              ) : searchFallbackOnly && resources[0] ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4">
                  <p className="text-sm text-amber-900">
                    Нақты бейне сілтемесі сақталмаған (тек іздеу беті). Бұл әдетте: (1) backend іске қосылғанда{" "}
                    <code className="rounded bg-amber-100 px-1">YOUTUBE_API_KEY</code> оқылмаған; (2) Google Cloud-та{" "}
                    <strong>YouTube Data API v3</strong> қосылмаған немесе кілтке шектеу қате (серверден шақыруға
                    рұқсат жоқ); (3) квота/403 қатесі — содан API бейне қайтармаған. Алдымен{" "}
                    <strong>Қайта іздеу</strong> басыңыз; болмаса backend терминалындағы қате жолдарын қараңыз.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={resources[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      YouTube-та ашу
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void generateResources()}
                      className="inline-flex rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-60"
                    >
                      Қайта іздеу
                    </button>
                  </div>
                </div>
              ) : resources.length > 0 ? (
                <ul className="space-y-2">
                  {resources.map((r) => (
                    <li key={r.id} className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                      <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-emerald-700 hover:underline">
                        {r.title}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-600">{busy ? "Материал жүктелуде..." : "Материал табылмады."}</p>
              )}
            </div>

            {!essayMode ? (
              <TaskTestSection
                test={test}
                attempt={attempt}
                busy={busy}
                onSubmit={submitTest}
              />
            ) : (
              <TaskEssaySection
                busy={busy}
                essayText={essayText}
                essayResult={essayResult}
                onEssayText={setEssayText}
                onSubmit={submitEssay}
              />
            )}
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-600">Task not found</p>
        )}
      </div>
    </AuthGate>
  );
}

function TaskTestSection({
  test,
  attempt,
  busy,
  onSubmit,
}: {
  test: TestViewPublic | null;
  attempt: AttemptResultPublic | null;
  busy: boolean;
  onSubmit: (answers: Record<string, unknown>) => Promise<void>;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const detailsByQuestion = new Map((attempt?.details ?? []).map((d) => [String(d.question_id), d]));
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Тест</h2>
      </div>
      {!test ? (
        <p className="text-sm text-zinc-600">{busy ? "Тест жүктелуде..." : "Тест жасалмаған."}</p>
      ) : (
        <div className="space-y-3">
          {test.content.questions.map((q) => {
            const qid = String(q.id);
            const isMcq = String(q.type || "mcq").toLowerCase() === "mcq" && Array.isArray(q.options) && q.options.length > 0;
            return (
              <div key={qid} className="rounded-lg border border-zinc-200 p-3">
                <p className="text-sm font-medium">{q.prompt}</p>
                {isMcq ? (
                  <div className="mt-2 space-y-1">
                    {q.options!.map((opt, idx) => (
                      <label key={idx} className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          disabled={!!attempt}
                          name={`q-${qid}`}
                          checked={(answers[qid] ?? "") === String(idx)}
                          onChange={() => setAnswers((p) => ({ ...p, [qid]: String(idx) }))}
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    rows={2}
                    disabled={!!attempt}
                    value={answers[qid] ?? ""}
                    onChange={(e) => setAnswers((p) => ({ ...p, [qid]: e.target.value }))}
                    className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                    placeholder="Жауапты жазыңыз..."
                  />
                )}
                {attempt ? (
                  <div className={`mt-2 text-xs ${detailsByQuestion.get(qid)?.is_correct ? "text-emerald-700" : "text-rose-700"}`}>
                    {detailsByQuestion.get(qid)?.is_correct ? "Дұрыс жауап" : "Қате жауап"}
                    {!detailsByQuestion.get(qid)?.is_correct ? (
                      <span>
                        {" · "}
                        Дұрысы:{" "}
                        {(() => {
                          const d = detailsByQuestion.get(qid);
                          if (!d) return "-";
                          if (String(d.type) === "mcq" && Array.isArray(q.options)) {
                            const idx = Number(d.correct_answer);
                            return Number.isInteger(idx) && idx >= 0 && idx < q.options.length ? q.options[idx] : "-";
                          }
                          return typeof d.correct_answer === "string" && d.correct_answer.trim() ? d.correct_answer : "—";
                        })()}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            disabled={!!attempt || busy}
            onClick={() => {
              const payload: Record<string, unknown> = {};
              for (const q of test.content.questions) {
                const qid = String(q.id);
                const raw = (answers[qid] ?? "").trim();
                if (!raw) continue;
                const isMcq = String(q.type || "mcq").toLowerCase() === "mcq" && Array.isArray(q.options) && q.options.length > 0;
                if (isMcq) {
                  const n = Number.parseInt(raw, 10);
                  if (!Number.isNaN(n)) payload[qid] = n;
                } else {
                  payload[qid] = raw;
                }
              }
              void onSubmit(payload);
            }}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
          >
            {attempt ? "Тест тапсырылды" : "Тестті жіберу"}
          </button>
          {attempt ? (
            <p className="text-sm font-medium text-zinc-700">
              Нәтиже: {attempt.score}% ({attempt.passed ? "өткен" : "өтпеген"})
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TaskEssaySection({
  busy,
  essayText,
  essayResult,
  onEssayText,
  onSubmit,
}: {
  busy: boolean;
  essayText: string;
  essayResult: HomeworkViewPublic | null;
  onEssayText: (v: string) => void;
  onSubmit: () => Promise<void>;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-semibold">Эссе</h2>
      <textarea
        rows={6}
        value={essayText}
        onChange={(e) => onEssayText(e.target.value)}
        placeholder="Жауабыңызды жазыңыз..."
        className="mt-3 w-full rounded-lg border border-zinc-300 px-3 py-2"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void onSubmit()}
        className="mt-3 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
      >
        AI-ға жіберу
      </button>
      {essayResult ? (
        <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
          <p className="font-semibold">AI бағасы: {essayResult.grade ?? "-"}%</p>
          <p className="mt-1 whitespace-pre-wrap text-zinc-700">{essayResult.ai_feedback ?? "Кері байланыс жоқ."}</p>
        </div>
      ) : null}
    </div>
  );
}
