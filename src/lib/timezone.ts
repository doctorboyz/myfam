/**
 * Timezone utilities for consistent GMT+7 (Bangkok) time display.
 * All user-facing dates/times should use these helpers so that
 * LIFF users inside LINE (who may be in different timezones)
 * always see Bangkok time.
 */

const BANGKOK_TZ = 'Asia/Bangkok';

const bangkokFormatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('th-TH', { ...options, timeZone: BANGKOK_TZ });

const bangkokShortFormatter = (options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-US', { ...options, timeZone: BANGKOK_TZ });

/** Get current Bangkok time as a Date-like string (for display only) */
export function getBangkokDate(): Date {
  const now = new Date();
  const bangkokOffset = 7 * 60; // GMT+7 in minutes
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + bangkokOffset * 60000);
}

/** Get Bangkok hour (0-23) for greeting logic */
export function getBangkokHour(): number {
  return parseInt(
    bangkokShortFormatter({ hour: 'numeric', hour12: false }).format(new Date()),
    10
  );
}

/** Format date in Bangkok timezone with Thai locale */
export function formatBangkokDate(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  return bangkokFormatter(options ?? defaultOptions).format(d);
}

/** Format time in Bangkok timezone */
export function formatBangkokTime(date: Date | string, options?: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: '2-digit',
    minute: '2-digit',
  };
  return bangkokFormatter(options ?? defaultOptions).format(d);
}

/** Format short date in Bangkok timezone */
export function formatBangkokShortDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return bangkokFormatter({
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }).format(d);
}

/** Get Bangkok timezone date string for input[type=date] (YYYY-MM-DD) */
export function getBangkokDateString(date: Date = new Date()): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return bangkokShortFormatter({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d).split('/').reverse().join('-');
}