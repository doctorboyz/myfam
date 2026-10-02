"use client";

// Safe haptic feedback wrapper that works in Telegram Mini App and falls back
// silently everywhere else. Telegram types live in src/types/telegram.d.ts.

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';

const tg = () =>
  typeof window !== 'undefined' ? window.Telegram?.WebApp?.HapticFeedback : undefined;

export function hapticImpact(style: HapticStyle = 'light') {
  try {
    tg()?.impactOccurred?.(style);
  } catch {
    /* ignore */
  }
}

export function hapticNotification(type: 'error' | 'success' | 'warning') {
  try {
    tg()?.notificationOccurred?.(type);
  } catch {
    /* ignore */
  }
}

export function hapticSelection() {
  try {
    tg()?.selectionChanged?.();
  } catch {
    /* ignore */
  }
}
