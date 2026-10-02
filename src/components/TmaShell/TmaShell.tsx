"use client";

import { useEffect } from "react";

// Minimal shape of what telegram-web-app.js injects.
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        enableClosingConfirmation?: () => void;
      };
    };
  }
}

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
