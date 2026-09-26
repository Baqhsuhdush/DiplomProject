"use client";

import { useEffect, useRef } from "react";

import { useTokenReady } from "@/hooks/useTokenReady";

/**
 * Сброс локального состояния при отсутствии access-токена (выход, истечение, другая вкладка).
 * Колбэк может быть новым на каждом рендере — внутри хранится в ref.
 */
export function useOnLoggedOut(onLoggedOut: () => void) {
  const tokenReady = useTokenReady();
  const cb = useRef(onLoggedOut);
  cb.current = onLoggedOut;
  useEffect(() => {
    if (tokenReady) return;
    cb.current();
  }, [tokenReady]);
}
