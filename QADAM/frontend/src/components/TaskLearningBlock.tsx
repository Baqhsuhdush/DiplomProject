"use client";

import { useState } from "react";

import { apiFetch, friendlyApiError } from "@/lib/api-client";
import { useI18n } from "@/lib/i18n";
import type { AttemptResultPublic, HomeworkViewPublic, TestViewPublic } from "@/lib/qadam-types";

function buildAnswersPayload(test: TestViewPublic, raw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const q of test.content.questions) {
    const qid = String(q.id);
    const v = raw[qid];
    if (v === undefined || v === "") continue;
    const qt = String(q.type || "mcq").toLowerCase();
    if (qt === "mcq") {
      const n = Number.parseInt(v, 10);
      if (!Number.isNaN(n)) out[qid] = n;
    } else {
      out[qid] = v;
    }
  }
  return out;
}

type Props = {
  taskId: string;
};

export function TaskLearningBlock({ taskId }: Props) {
  const { lang } = useI18n();
  const tr = (ru: string, kk: string, en: string) => (lang === "kk" ? kk : lang === "en" ? en : ru);
  const [test, setTest] = useState<TestViewPublic | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<AttemptResultPublic | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hwText, setHwText] = useState("");
  const [hwFile, setHwFile] = useState<File | null>(null);
  const [hwFileKey, setHwFileKey] = useState(0);
  const [hwLatest, setHwLatest] = useState<HomeworkViewPublic | null>(null);

  async function generateTest() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/tasks/${taskId}/tests/generate?lang=${lang}`, { method: "POST" });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      const t = (await res.json()) as TestViewPublic;
      setTest(t);
      setAnswers({});
      setAttempt(null);
    } finally {
      setBusy(false);
    }
  }

  async function loadLatestTest() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/tasks/${taskId}/tests/latest`);
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      const t = (await res.json()) as TestViewPublic;
      setTest(t);
      setAnswers({});
      setAttempt(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitTestAttempt() {
    if (!test) return;
    setErr(null);
    setBusy(true);
    try {
      const payload = buildAnswersPayload(test, answers);
      const res = await apiFetch(`/api/v1/tests/${test.id}/attempt`, {
        method: "POST",
        body: JSON.stringify({ answers: payload }),
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

  async function submitHomework() {
    const text = hwText.trim();
    if (!text && !hwFile) {
      setErr(tr("Укажите текст и/или прикрепите файл.", "Мәтін не файл таңдаңыз.", "Provide text and/or attach a file."));
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      const fd = new FormData();
      if (text) fd.append("text_answer", text);
      if (hwFile) fd.append("file", hwFile);
      const res = await apiFetch(`/api/v1/tasks/${taskId}/homework/submit`, { method: "POST", body: fd });
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      const row = (await res.json()) as HomeworkViewPublic;
      setHwLatest(row);
      setHwText("");
      setHwFile(null);
      setHwFileKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function loadLatestHomework() {
    setErr(null);
    setBusy(true);
    try {
      const res = await apiFetch(`/api/v1/tasks/${taskId}/homework/latest`);
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      setHwLatest((await res.json()) as HomeworkViewPublic);
    } finally {
      setBusy(false);
    }
  }

  async function downloadHomeworkFile() {
    if (!hwLatest?.download_path) return;
    setErr(null);
    try {
      const res = await apiFetch(hwLatest.download_path);
      if (!res.ok) {
        setErr(await friendlyApiError(res));
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = hwLatest.original_filename || "homework";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErr(tr("Не удалось скачать файл.", "Файлды жүктеу сәтсіз.", "Failed to download file."));
    }
  }

  return (
    <div className="mt-3 space-y-3 border-t border-zinc-300 pt-3 text-xs text-zinc-800">
      <p className="font-medium uppercase tracking-wide text-zinc-700">{tr("Тест и домашка", "Тест және үй жұмысы", "Test & homework")}</p>
      {err ? <p className="text-rose-400">{err}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void generateTest()}
          className="rounded bg-violet-700/90 px-2 py-1 text-xs text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {busy ? "…" : tr("Новый тест", "Жаңа тест", "New test")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadLatestTest()}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
        >
          {tr("Загрузить тест", "Тестті жүктеу", "Load test")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void loadLatestHomework()}
          className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
        >
          {tr("Последняя домашка", "Соңғы үй жұмысы", "Latest homework")}
        </button>
      </div>
      {test ? (
        <div className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-950/30 p-3">
          <p className="text-zinc-700">
            {tr("Проходной балл", "Өту балы", "Passing score")}: {test.content.passing_score}% · {tr("вопросов", "сұрақ", "questions")}: {test.content.questions.length}
          </p>
          {test.content.questions.map((q, qi) => {
            const qid = String(q.id);
            const qt = String(q.type || "mcq").toLowerCase();
            return (
              <div key={qid || String(qi)} className="space-y-1">
                <p className="text-zinc-800">{q.prompt ?? qid}</p>
                {qt === "mcq" && q.options ? (
                  <div className="flex flex-col gap-1 pl-1">
                    {q.options.map((opt, oi) => (
                      <label key={oi} className="flex cursor-pointer items-center gap-2 text-zinc-700">
                        <input
                          type="radio"
                          name={`mcq-${taskId}-${qid}`}
                          checked={(answers[qid] ?? "") === String(oi)}
                          onChange={() => setAnswers((prev) => ({ ...prev, [qid]: String(oi) }))}
                          className="accent-emerald-500"
                        />
                        <span>{opt}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded border border-zinc-300 bg-zinc-950 px-2 py-1 text-zinc-900 outline-none ring-emerald-500/30 focus:ring-1"
                    value={answers[qid] ?? ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [qid]: e.target.value }))}
                  />
                )}
              </div>
            );
          })}
          <button
            type="button"
            disabled={busy}
            onClick={() => void submitTestAttempt()}
            className="rounded bg-emerald-700/90 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {tr("Отправить ответы", "Жауаптарды жіберу", "Submit answers")}
          </button>
          {attempt ? (
            <p className="text-emerald-400">
              {tr("Результат", "Нәтиже", "Result")}: {attempt.score}% · {attempt.passed ? tr("зачёт", "өтті", "passed") : tr("незачёт", "өтпеді", "failed")} (≥ {attempt.passing_score}%)
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-2 rounded-lg border border-zinc-200 bg-zinc-950/30 p-3">
        <p className="text-zinc-700">{tr("Домашнее задание", "Үй жұмысы", "Homework")}</p>
        <textarea
          rows={3}
          placeholder={tr("Текст ответа (или только файл ниже)", "Жауап мәтіні (немесе тек файл)", "Answer text (or only file)")}
          className="w-full rounded border border-zinc-300 bg-zinc-950 px-2 py-1 text-zinc-900 outline-none ring-emerald-500/30 focus:ring-1"
          value={hwText}
          onChange={(e) => setHwText(e.target.value)}
        />
        <input
          key={`hw-file-${taskId}-${hwFileKey}`}
          type="file"
          className="block w-full text-zinc-700 file:mr-2 file:rounded file:border-0 file:bg-zinc-800 file:px-2 file:py-1 file:text-zinc-200"
          onChange={(e) => setHwFile(e.target.files?.[0] ?? null)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void submitHomework()}
          className="rounded bg-zinc-200 px-2 py-1 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-50"
        >
          {tr("Отправить домашку", "Үй жұмысын жіберу", "Submit homework")}
        </button>
      </div>
      {hwLatest ? (
        <div className="rounded-lg border border-zinc-200 bg-zinc-950/30 p-3 text-zinc-700">
          <p className="font-medium text-zinc-900">{tr("Последняя сдача", "Соңғы жіберілім", "Latest submission")}</p>
          <p className="mt-1 text-zinc-700">{new Date(hwLatest.created_at).toLocaleString("ru-RU")}</p>
          {hwLatest.text_answer ? (
            <p className="mt-2 whitespace-pre-wrap text-zinc-800">{hwLatest.text_answer}</p>
          ) : null}
          {hwLatest.original_filename ? <p className="mt-1 text-zinc-700">{tr("Файл", "Файл", "File")}: {hwLatest.original_filename}</p> : null}
          {hwLatest.download_path ? (
            <button
              type="button"
              onClick={() => void downloadHomeworkFile()}
              className="mt-2 text-emerald-400 hover:underline"
            >
              {tr("Скачать вложение", "Тіркемені жүктеу", "Download attachment")}
            </button>
          ) : null}
          {hwLatest.grade != null ? <p className="mt-2 text-zinc-900">{tr("Оценка (AI)", "Баға (AI)", "Grade (AI)")}: {hwLatest.grade}%</p> : null}
          {hwLatest.ai_feedback ? (
            <p className="mt-1 whitespace-pre-wrap text-zinc-700">{hwLatest.ai_feedback}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
