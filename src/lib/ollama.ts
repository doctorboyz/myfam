/**
 * Ollama API client for AI text generation and vision (OCR).
 *
 * Two models are used:
 * - Text chat (Thai understanding): qwen3:8b (local)
 * - Vision/OCR (slip receipt): qwen3.5:cloud (Ollama Max cloud, 397B params)
 *
 * Text model runs locally; vision model uses Ollama Max cloud for GPU inference.
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || 'qwen3:8b';
const OLLAMA_VISION_MODEL = process.env.OLLAMA_VISION_MODEL || 'qwen3.5:cloud';

interface OllamaGenerateOptions {
  model?: string;
  prompt: string;
  images?: string[];
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  format?: 'json' | 'text';
}

interface OllamaGenerateResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration: number;
  eval_count: number;
}

interface OllamaChatOptions {
  model?: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
    images?: string[];
  }>;
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  format?: 'json' | 'text';
}

interface OllamaChatResponse {
  model: string;
  message: {
    role: string;
    content: string;
    images?: string[];
  };
  done: boolean;
  total_duration: number;
  eval_count: number;
}

/**
 * Call Ollama /api/generate endpoint (single prompt).
 * Use for simple text generation or vision tasks with a single prompt.
 */
export async function ollamaGenerate(options: OllamaGenerateOptions): Promise<string> {
  const model = options.model || OLLAMA_TEXT_MODEL;

  const body = {
    model,
    prompt: options.prompt,
    images: options.images,
    stream: false,
    format: options.format || 'json',
    options: {
      temperature: options.temperature ?? 0.1,
      top_p: options.topP ?? 0.6,
      repetition_penalty: options.repetitionPenalty ?? 1.1,
    },
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000), // 5 min for CPU inference
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama generate error (${response.status}): ${errorText}`);
  }

  const data: OllamaGenerateResponse = await response.json();
  return data.response;
}

/**
 * Call Ollama /api/chat endpoint (multi-turn conversation).
 * Use for complex interactions that need system prompts or conversation context.
 */
export async function ollamaChat(options: OllamaChatOptions): Promise<string> {
  const model = options.model || OLLAMA_TEXT_MODEL;

  const body = {
    model,
    messages: options.messages,
    stream: false,
    format: options.format || 'json',
    options: {
      temperature: options.temperature ?? 0.1,
      top_p: options.topP ?? 0.6,
      repetition_penalty: options.repetitionPenalty ?? 1.1,
    },
  };

  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300_000), // 5 min for CPU inference
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama chat error (${response.status}): ${errorText}`);
  }

  const data: OllamaChatResponse = await response.json();
  return data.message.content;
}

/**
 * Extract transaction data from a Thai text message using the text model.
 * Example: "ซื้อข้าวผัด 85 บาท" → { amount: 85, description: "ซื้อข้าวผัด", type: "expense" }
 */
export async function extractFromText(
  text: string,
  categories: Array<{ id: string; name: string; groupName: string; groupType: string }>,
): Promise<ExtractedTransaction> {
  // Only send top-level group names (not all 73 categories) to keep prompt short
  const groups = [...new Set(categories.map((c) => `${c.groupName}(${c.groupType})`))];
  const groupList = groups.join(', ');

  const prompt = `สกัดข้อมูลธุรกรรมจาก: "${text}"
วันนี้: ${new Date().toISOString().split('T')[0]}
กลุ่มหมวด: ${groupList}
ตอบเป็น JSON: {"amount":0,"date":"YYYY-MM-DD","description":"คำอธิบาย","type":"income|expense","categoryGroupName":"กลุ่มหมวด","merchantName":null,"confidence":0-1}`;

  const result = await ollamaChat({
    model: OLLAMA_TEXT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    format: 'json',
  });

  const extracted = parseExtractedTransaction(result);

  // Match category from group name after extraction
  matchCategory(extracted, categories);

  return extracted;
}

/**
 * Extract transaction data from a slip/receipt image using the vision model.
 * Cloud model can handle larger images — resized to 768px for better OCR accuracy.
 */
export async function extractFromSlip(
  imageBase64: string,
  categories: Array<{ id: string; name: string; groupName: string; groupType: string }>,
): Promise<ExtractedTransaction> {
  // Resize image for cloud inference (512px balances speed vs accuracy)
  const resizedBase64 = await resizeImageBase64(imageBase64, 512);

  // Send group names for category matching
  const groups = [...new Set(categories.map((c) => `${c.groupName}(${c.groupType})`))];
  const groupList = groups.join(', ');

  const prompt = `อ่านสลิป/ใบเสร็จ/QR payment นี้แล้วสกัดข้อมูลธุรกรรม
วันนี้: ${new Date().toISOString().split('T')[0]}
กลุ่มหมวด: ${groupList}
ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"ชื่อร้านหรือรายการ","type":"expenseหรือincome","categoryGroupName":"ชื่อกลุ่มหมวดจากด้านบน","merchantName":"ชื่อร้าน","confidence":0ถึง1}
ถ้าอ่านจำนวนเงินไม่ได้ให้ใส่ amount=0
เลือก categoryGroupName ที่ตรงกับรายการมากที่สุดจากกลุ่มหมวดด้านบน`;

  const result = await ollamaGenerate({
    model: OLLAMA_VISION_MODEL,
    prompt,
    images: [resizedBase64],
    format: 'json',
    temperature: 0.1,
    topP: 0.6,
    repetitionPenalty: 1.1,
  });

  const extracted = parseExtractedTransaction(result);

  // Match category from group name after extraction
  matchCategory(extracted, categories);

  return extracted;
}

/**
 * Match AI-returned categoryGroupName against known categories.
 * Tries exact match first, then case-insensitive, then includes-match.
 */
function matchCategory(
  extracted: ExtractedTransaction,
  categories: Array<{ id: string; name: string; groupName: string; groupType: string }>,
) {
  if (!extracted.categoryGroupName) return;

  const aiGroup = extracted.categoryGroupName.trim();

  // 1. Exact match on groupName or name
  let match = categories.find(
    (c) => c.groupName === aiGroup || c.name === aiGroup,
  );

  // 2. Case-insensitive match
  if (!match) {
    const aiLower = aiGroup.toLowerCase();
    match = categories.find(
      (c) => c.groupName.toLowerCase() === aiLower || c.name.toLowerCase() === aiLower,
    );
  }

  // 3. Includes match — AI response contains or is contained in a category name
  if (!match) {
    match = categories.find(
      (c) => aiGroup.includes(c.groupName) || c.groupName.includes(aiGroup),
    );
  }

  if (match) {
    extracted.categoryId = match.id;
    extracted.categoryGroupName = match.groupName;
  }
}

/**
 * Type for AI-extracted transaction data.
 */
export interface ExtractedTransaction {
  amount: number;
  date: string;
  description: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  categoryGroupName: string;
  merchantName?: string;
  confidence: number;
}

/**
 * Parse date strings from AI responses into YYYY-MM-DD format.
 * Handles: YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, D MMM YYYY (Thai), etc.
 */
function parseDate(dateStr: string): string {
  const today = new Date().toISOString().split('T')[0];
  if (!dateStr) return today;

  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  // DD/MM/YYYY or DD/MM/YY
  const dmy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${year}-${month}-${day}`;
  }

  // Try native Date parsing as fallback
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];

  return today;
}

/**
 * Parse the AI response JSON into an ExtractedTransaction.
 * Handles common AI response quirks (markdown fences, extra text).
 */
function parseExtractedTransaction(raw: string): ExtractedTransaction {
  let jsonStr = raw.trim();

  // Strip markdown code fences if present
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    // Try to fix truncated JSON by closing open braces
    const lastBrace = jsonStr.lastIndexOf('}');
    if (lastBrace > 0) {
      try {
        parsed = JSON.parse(jsonStr.slice(0, lastBrace + 1));
      } catch {
        throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
      }
    } else {
      throw new Error(`AI returned invalid JSON: ${raw.slice(0, 200)}`);
    }
  }

  return {
    amount: Number(parsed.amount) || 0,
    date: parseDate(String(parsed.date ?? '')),
    description: String(parsed.description || ''),
    type: ['income', 'expense', 'transfer'].includes(String(parsed.type))
      ? (parsed.type as ExtractedTransaction['type'])
      : 'expense',
    categoryId: typeof parsed.categoryId === 'string' ? parsed.categoryId : null,
    categoryGroupName: String(parsed.categoryGroupName || ''),
    merchantName: parsed.merchantName ? String(parsed.merchantName) : undefined,
    confidence: Number(parsed.confidence) || 0.5,
  };
}

/**
 * Format a Thai confirmation message for a created transaction.
 */
export function formatConfirmationMessage(
  transaction: { amount: number | { toString(): string }; type: string; description: string | null; date: string | Date },
  extracted: ExtractedTransaction,
): string {
  const typeLabel = extracted.type === 'income' ? 'รายรับ' : 'รายจ่าย';
  const amount = new Intl.NumberFormat('th-TH').format(Number(transaction.amount));

  let msg = `✅ บันทึก${typeLabel}แล้ว!\n`;
  msg += `📝 ${transaction.description || extracted.description}\n`;
  msg += `💰 ${amount} บาท\n`;

  if (extracted.categoryGroupName) {
    msg += `📂 หมวด: ${extracted.categoryGroupName}`;
    if (extracted.categoryId) {
      // Find category name from the extraction context
    }
    msg += '\n';
  }

  if (extracted.merchantName) {
    msg += `🏪 ร้าน: ${extracted.merchantName}\n`;
  }

  const confidence = extracted.confidence;
  if (confidence < 0.7) {
    msg += `\n⚠️ ความมั่นใจ: ${Math.round(confidence * 100)}% — กรุณาตรวจสอบความถูกต้อง`;
  }

  return msg;
}

/**
 * Format an error message in Thai.
 */
export function formatErrorMessage(error: string): string {
  const errorMap: Record<string, string> = {
    'AI returned invalid JSON': 'ขออภัย ระบบไม่สามารถอ่านข้อมูลได้ กรุณาลองใหม่',
    'Ollama generate error': 'ขออภัย ระบบ AI ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
    'Ollama chat error': 'ขออภัย ระบบ AI ไม่พร้อมใช้งาน กรุณาลองใหม่ภายหลัง',
    'User has no active account': 'ยังไม่มีบัญชี กรุณาสร้างบัญชีในแอป MyFam ก่อน',
    'User not linked': 'ยังไม่ได้เชื่อมบัญชี กรุณาพิมพ์ "ลิงก์" เพื่อเชื่อมต่อ',
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (error.includes(key)) return value;
  }

  return 'ขออภัย เกิดข้อผิดพลาด กรุณาลองใหม่';
}

// Export model names for use in other modules
export { OLLAMA_TEXT_MODEL, OLLAMA_VISION_MODEL };

/**
 * Resize a base64-encoded image to a maximum dimension.
 * Balances quality vs inference speed — cloud models can handle larger images.
 */
async function resizeImageBase64(base64: string, maxDim: number): Promise<string> {
  // Strip data URL prefix if present
  const pure = base64.replace(/^data:image\/\w+;base64,/, '');

  // Dynamic import to avoid bundling sharp in client bundles
  const { default: sharp } = await import('sharp');
  const buffer = Buffer.from(pure, 'base64');
  const resized = await sharp(buffer)
    .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  return resized.toString('base64');
}