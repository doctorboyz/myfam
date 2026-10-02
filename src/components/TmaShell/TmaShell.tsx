"use client";

import { useEffect } from "react";

export function TmaShell() {
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    document.body.classList.add("tma");
    tg.ready?.();
    tg.expand?.();
    tg.setHeaderColor?.("#050505");
    tg.setBackgroundColor?.("#050505");
    tg.enableClosingConfirmation?.();
  }, []);

  return null;
}
