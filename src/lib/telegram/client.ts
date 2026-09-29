/**
 * Telegram Bot API client — raw fetch, no SDK.
 * ~150 lines like the old line.ts. Never logs the token.
 */

import type { ReplyMarkup } from './types';

const API_BASE = 'https://api.telegram.org';

function token(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  return t;
}

async function callApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}/bot${token()}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });

  const data = (await response.json()) as { ok: boolean; result?: T; description?: string };
  if (!data.ok) {
    throw new Error(`Telegram API ${method} failed: ${data.description ?? response.status}`);
  }
  return data.result as T;
}

/** Send a text message. Plain text (no parse_mode) — Thai-friendly, no escaping issues. */
export async function sendMessage(
  chatId: number | string,
  text: string,
  replyMarkup?: ReplyMarkup,
): Promise<void> {
  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: text.slice(0, 4096), // hard Telegram limit
  };
  if (replyMarkup) body.reply_markup = replyMarkup;
  await callApi('sendMessage', body);
}

/** Show a chat action ("typing…", "upload_photo…") while processing. */
export async function sendChatAction(
  chatId: number | string,
  action: 'typing' | 'upload_photo',
): Promise<void> {
  await callApi('sendChatAction', { chat_id: chatId, action });
}

/** Get file metadata (file_path) for a file_id. Path expires in ~1 hour. */
export async function getFile(fileId: string): Promise<{ file_id: string; file_path?: string }> {
  return callApi('getFile', { file_id: fileId });
}

/** Download file bytes via the file path returned by getFile. */
export async function downloadFile(filePath: string): Promise<Buffer> {
  const response = await fetch(`${API_BASE}/file/bot${token()}/${filePath}`, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    throw new Error(`Telegram file download failed: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Convenience: download the largest photo of a message directly. */
export async function downloadPhoto(fileId: string): Promise<Buffer> {
  const file = await getFile(fileId);
  if (!file.file_path) throw new Error('Telegram returned no file_path');
  return downloadFile(file.file_path);
}