/**
 * AI Client — Ollama Cloud only.
 *
 * All model calls go through Ollama's /api/chat endpoint at OLLAMA_BASE_URL
 * (default: https://api.ollama.com), authenticated with OLLAMA_API_KEY.
 *
 * Model format: "ollama:<model>" or bare "<model>" (both resolve to Ollama).
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'https://api.ollama.com';
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || '';

// ── Per-intent model configs ───────────────────────────────────────
// Defaults use placeholder cloud model names — set AI_*_MODEL in .env.
export const AI_RESPONSE_MODEL = process.env.AI_RESPONSE_MODEL || 'ollama:qwen3:32b';
export const AI_INTENT_MODEL = process.env.AI_INTENT_MODEL || 'ollama:qwen3:32b';
export const AI_EXTRACT_TEXT_MODEL = process.env.AI_EXTRACT_TEXT_MODEL || 'ollama:qwen3:32b';
export const AI_EXTRACT_SLIP_MODEL = process.env.AI_EXTRACT_SLIP_MODEL || 'ollama:qwen3:32b';

// ── Types ──────────────────────────────────────────────────────────

export interface AiChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface AiChatOptions {
  model: string;
  messages: AiChatMessage[];
  temperature?: number;
  topP?: number;
  format?: 'json' | 'text';
}

// ── Model Parsing ──────────────────────────────────────────────────

function parseModel(model: string): string {
  if (model.startsWith('ollama:')) {
    return model.slice('ollama:'.length);
  }
  return model;
}

// ── Ollama Backend ─────────────────────────────────────────────────

async function callOllama(options: AiChatOptions & { model: string }): Promise<string> {
  if (!OLLAMA_API_KEY) {
    throw new Error('OLLAMA_API_KEY not configured');
  }

  const ollamaMessages = options.messages.map((m) => {
    const msg: Record<string, unknown> = { role: m.role, content: m.content };
    if (m.images?.length) msg.images = m.images;
    return msg;
  });

  const body = {
    model: options.model,
    messages: ollamaMessages,
    stream: false,
    format: options.format || 'json',
    options: {
      temperature: options.temperature ?? 0.1,
      top_p: options.topP ?? 0.6,
      repetition_penalty: 1.1,
    },
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OLLAMA_API_KEY}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama chat error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.message.content;
}

// ── Unified Chat ───────────────────────────────────────────────────

export async function aiChat(options: AiChatOptions): Promise<string> {
  const model = parseModel(options.model);
  return callOllama({ ...options, model });
}