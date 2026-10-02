"use client";

import { useEffect } from "react";

// Show Telegram Mini App native back button while a modal/sheet is open.
// Falls back silently outside Telegram.
export function useTmaBackButton(visible: boolean, onClick: () => void) {
  useEffect(() => {
    const backBtn = window.Telegram?.WebApp?.BackButton;
    if (!backBtn) return;

    if (visible) {
      backBtn.show?.();
      backBtn.onClick?.(onClick);
    } else {
      backBtn.hide?.();
      // Telegram JS SDK does not expose an off-click API in the minimal
      // types we declare; hiding is enough to stop interaction.
    }

    return () => {
      backBtn.hide?.();
    };
  }, [visible, onClick]);
}
