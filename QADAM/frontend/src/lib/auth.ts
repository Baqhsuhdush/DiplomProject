const ACCESS = "qadam_access_token";
const REFRESH = "qadam_refresh_token";

/** Событие на этой вкладке после setTokens / clearTokens (для UI и хуков). */
export const QADAM_AUTH_CHANGED_EVENT = "qadam:auth-changed" as const;

export function matchesAuthStorageKey(key: string | null): boolean {
  return key === ACCESS || key === REFRESH;
}

function notifyAuthChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(QADAM_AUTH_CHANGED_EVENT));
}

export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS);
}

export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH);
}

export function setTokens(access: string, refresh: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
  notifyAuthChanged();
}

export function clearTokens() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  notifyAuthChanged();
}
