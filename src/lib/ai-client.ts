/**
 * Unified AI Client — supports Ollama and OpenRouter backends.
 *
 * Model format: "provider:model"
 *   ollama:qwen3.5:cloud     → Ollama native API
 *   openrouter:claude-sonnet  → OpenRouter API (OpenAI-compatible)
 *   qwen3.5:cloud             → defaults to Ollama (backward compatible)
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// ── Per-intent model configs ───────────────────────────────────────

export const AI_RESPONSE_MODEL = process.env.AI_RESPONSE_MODEL || 'ollama:qwen2.5:7b';
export const AI_INTENT_MODEL = process.env.AI_INTENT_MODEL || 'ollama:qwen2.5:7b';
export const AI_EXTRACT_TEXT_MODEL = process.env.AI_EXTRACT_TEXT_MODEL || 'ollama:qwen2.5:7b';
export const AI_EXTRACT_SLIP_MODEL = process.env.AI_EXTRACT_SLIP_MODEL || 'ollama:qwen3.5:cloud';

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

function parseModel(model: string): { provider: 'ollama' | 'openrouter'; model: string } {
  if (model.startsWith('openrouter:')) {
    return { provider: 'openrouter', model: model.slice('openrouter:'.length) };
  }
  if (model.startsWith('ollama:')) {
    return { provider: 'ollama', model: model.slice('ollama:'.length) };
  }
  return { provider: 'ollama', model };
}

// ── Ollama Backend ─────────────────────────────────────────────────

async function callOllama(options: AiChatOptions & { model: string }): Promise<string> {
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
    headers: { 'Content-Type': 'application/json' },
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

// ── OpenRouter Backend ─────────────────────────────────────────────

async function callOpenRouter(options: AiChatOptions & { model: string }): Promise<string> {
  if (!OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }

  const openRouterMessages = options.messages.map((m) => {
    if (m.images?.length) {
      return {
        role: m.role,
        content: [
          { type: 'text', text: m.content },
          ...m.images.map((img) => ({
            type: 'image_url',
            image_url: { url: img },
          })),
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const body: Record<string, unknown> = {
    model: options.model,
    messages: openRouterMessages,
    temperature: options.temperature ?? 0.1,
    top_p: options.topP ?? 0.6,
  };

  if (options.format === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
      'X-Title': 'MyFam',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// ── Unified Chat ───────────────────────────────────────────────────

export async function aiChat(options: AiChatOptions): Promise<string> {
  const { provider, model } = parseModel(options.model);

  if (provider === 'openrouter') {
    return callOpenRouter({ ...options, model });
  }
  return callOllama({ ...options, model });
}
