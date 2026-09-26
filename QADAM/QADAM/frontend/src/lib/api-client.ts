import { getApiBaseUrl } from "@/lib/api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/auth";

let refreshInFlight: Promise<boolean> | null = null;

function networkErrorResponse(baseUrl: string): Response {
  return new Response(
    JSON.stringify({ detail: `Сервер недоступен (${baseUrl}). Проверьте, что backend запущен.` }),
    {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "application/json" },
    },
  );
}

async function refreshAccessToken(): Promise<boolean> {
  if (refreshInFlight) {
    return refreshInFlight;
  }
  refreshInFlight = (async () => {
    try {
      const refresh = getRefreshToken();
      if (!refresh) return false;
      const base = getApiBaseUrl();
      const res = await fetch(`${base}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refresh }),
      });
      if (!res.ok) {
        clearTokens();
        return false;
      }
      const body = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
      };
      if (!body.access_token || !body.refresh_token) {
        clearTokens();
        return false;
      }
      setTokens(body.access_token, body.refresh_token);
      return true;
    } catch {
      clearTokens();
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const base = getApiBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const buildHeaders = () => {
    const headers = new Headers(init.headers);
    const token = getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (!headers.has("Content-Type") && init.body && typeof init.body === "string") {
      headers.set("Content-Type", "application/json");
    }
    return headers;
  };

  const doFetch = () => fetch(url, { ...init, headers: buildHeaders() });
  const safeDoFetch = async () => {
    try {
      return await doFetch();
    } catch {
      return networkErrorResponse(base);
    }
  };

  let res = await safeDoFetch();
  const hadSession = !!(getAccessToken() || getRefreshToken());
  if (res.status === 401 && getRefreshToken()) {
    const ok = await refreshAccessToken();
    if (ok) {
      res = await safeDoFetch();
    }
  }
  const authPublicPath =
    url.includes("/api/v1/auth/login") ||
    url.includes("/api/v1/auth/register") ||
    url.includes("/api/v1/auth/refresh");
  if (res.status === 401 && !authPublicPath) {
    clearTokens();
    if (hadSession && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("qadam:session-expired"));
    }
  }
  return res;
}

function formatDetailFromBody(detail: unknown): string | null {
  if (detail == null) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((x) => {
        if (typeof x === "string") return x;
        if (x && typeof x === "object" && "msg" in x && typeof (x as { msg: unknown }).msg === "string") {
          return (x as { msg: string }).msg;
        }
        return JSON.stringify(x);
      })
      .join("; ");
  }
  if (typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.message === "string") return o.message;
    if (typeof o.msg === "string") return o.msg;
    return JSON.stringify(detail);
  }
  return null;
}

/** Текст ошибки для UI: 429 и типичный FastAPI `detail`, иначе сырое тело. */
export async function friendlyApiError(res: Response): Promise<string> {
  let t: string;
  try {
    t = await res.text();
  } catch {
    return res.statusText || "Ошибка запроса";
  }
  if (res.status === 429) {
    try {
      const j = JSON.parse(t) as { detail?: unknown };
      const d = formatDetailFromBody(j.detail);
      if (d) return `Слишком много запросов: ${d}`;
    } catch {
      /* не JSON */
    }
    return "Слишком много запросов за короткое время. Подождите и повторите.";
  }
  try {
    const j = JSON.parse(t) as { detail?: unknown };
    const d = formatDetailFromBody(j.detail);
    if (d) return d;
  } catch {
    /* не JSON */
  }
  return t.trim() || res.statusText || "Ошибка запроса";
}
