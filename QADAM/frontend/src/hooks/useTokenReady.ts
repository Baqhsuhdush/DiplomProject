"use client";

import { useEffect, useState } from "react";

import { getAccessToken, matchesAuthStorageKey, QADAM_AUTH_CHANGED_EVENT } from "@/lib/auth";

/** true, если в localStorage есть access-токен (выход, истечение сессии, другая вкладка). */
export function useTokenReady(): boolean {
  const [ready, setReady] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return !!getAccessToken();
  });
  useEffect(() => {
    const read = () => setReady(!!getAccessToken());
    read();
    const onSessionExpired = () => read();
    const onAuthChanged = () => read();
    const onStorage = (e: StorageEvent) => {
      if (matchesAuthStorageKey(e.key)) read();
    };
    window.addEventListener("qadam:session-expired", onSessionExpired);
    window.addEventListener(QADAM_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("qadam:session-expired", onSessionExpired);
      window.removeEventListener(QADAM_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return ready;
}
