/**
 * Telegram Bot API types — minimal subset used by myfam.
 * Raw fetch client, no SDK (same philosophy as the old line.ts).
 */

export interface TelegramUser {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  first_name?: string;
  title?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

/** Reply keyboard markup — buttons send their text as a message. */
export interface ReplyKeyboard {
  keyboard: string[][];
  resize_keyboard?: boolean;
  one_time_keyboard?: boolean;
}

export type ReplyMarkup = ReplyKeyboard | { remove_keyboard: true };

/**
 * Abstract message sender. Production wraps telegram sendMessage;
 * sandbox/tests collect messages into an array so the whole bot
 * pipeline is testable without network access.
 */
export type BotSender = (text: string, keyboard?: ReplyMarkup) => Promise<void>;