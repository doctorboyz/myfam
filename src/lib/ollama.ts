/**
 * Ollama API client for AI text generation and vision (OCR).
 *
 * Both models use Ollama Max cloud (qwen3.5:cloud, 397B params):
 * - Text chat (Thai understanding): qwen3.5:cloud
 * - Vision/OCR (slip receipt): qwen3.5:cloud
 */

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_TEXT_MODEL = process.env.OLLAMA_TEXT_MODEL || 'qwen3.5:cloud';
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

  const systemPrompt = `คุณคือ AI สกัดข้อมูลธุรกรรมการเงินจากข้อความภาษาไทย
พิจารณา type อย่างรอบคอบ:
- expense (รายจ่าย): ซื้อ, จ่าย, ชำระ, ค่า, กิน, ดื่ม, เติม, โอนให้คนอื่น — เงินออกจากเรา
- income (รายรับ): รับ, เงินเข้า, เงินเดือน, โบนัส, ลูกค้าโอน, รับโอน — เงินเข้ามาหาเรา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

ถ้าข้อความไม่มีจำนวนเงินชัดเจน หรือไม่ใช่ข้อความเกี่ยวกับธุรกรรมการเงิน ให้ confidence ต่ำ (ต่ำกว่า 0.4)`;

  const today = new Date().toISOString().split('T')[0];

  const userPrompt = `สกัดข้อมูลธุรกรรมจาก: "${text}"

วันนี้: ${today}
กลุ่มหมวด: ${groupList}

ตัวอย่าง:
"ซื้อข้าวผัด 85 บาท" → {"amount":85,"date":"${today}","description":"ซื้อข้าวผัด","type":"expense","categoryGroupName":"อาหาร","merchantName":null,"confidence":0.95,"needsConfirmation":false}
"รับเงินเดือน 45000 บาท" → {"amount":45000,"date":"${today}","description":"เงินเดือน","type":"income","categoryGroupName":"เงินเดือน","merchantName":null,"confidence":0.95,"needsConfirmation":false}
"โอนเงิน 5000 บาท" → {"amount":5000,"date":"${today}","description":"โอนเงิน","type":"transfer","categoryGroupName":"การเงิน","merchantName":null,"confidence":0.8,"needsConfirmation":false}
"จ่ายให้แม่ 3000 บาท" → {"amount":3000,"date":"${today}","description":"จ่ายให้แม่","type":"expense","categoryGroupName":"ลูกและครอบครัว","merchantName":null,"confidence":0.7,"needsConfirmation":true}
"สวัสดีครับ" → {"amount":0,"date":"${today}","description":"","type":"expense","categoryGroupName":"","merchantName":null,"confidence":0.1,"needsConfirmation":false}
"85" → {"amount":85,"date":"${today}","description":"85","type":"expense","categoryGroupName":"","merchantName":null,"confidence":0.2,"needsConfirmation":false}
"ซื้อของที่เซเว่น" → {"amount":0,"date":"${today}","description":"ซื้อของที่เซเว่น","type":"expense","categoryGroupName":"อาหาร","merchantName":"เซเว่น","confidence":0.5,"needsConfirmation":false}

ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"คำอธิบาย","type":"expenseหรือincomeหรือtransfer","categoryGroupName":"ชื่อกลุ่มหมวด","merchantName":"ชื่อร้านหรือnull","confidence":0ถึง1,"needsConfirmation":trueหรือfalse}
ถ้าไม่มีจำนวนเงิน ให้ใส่ amount=0
เลือก categoryGroupName ที่ตรงกับรายการมากที่สุดจากกลุ่มหมวดด้านบน`;

  const result = await ollamaChat({
    model: OLLAMA_TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
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

สำคัญ: พิจารณา type จากสลิปอย่างรอบคอบ:
- expense (เราจ่ายออก): เห็นชื่อเราเป็น "ผู้โอน" หรือ "จากบ/ช", มีคำว่า "โอนเงิน", "จ่าย", "ชำระ", PromptPay ที่เราแสกนจ่าย
- income (เรารับเข้า): เห็นชื่อเราเป็น "ผู้รับโอน" หรือ "เข้าบ/ช", มีคำว่า "รับโอน", "รับเงิน", "CREDIT", สลิปที่คนอื่นส่งมา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"ชื่อร้านหรือรายการ","type":"expenseหรือincomeหรือtransfer","categoryGroupName":"ชื่อกลุ่มหมวดจากด้านบน","merchantName":"ชื่อร้าน","confidence":0ถึง1,"needsConfirmation":trueหรือfalse}
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
  needsConfirmation?: boolean;
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
    needsConfirmation: parsed.needsConfirmation === true,
  };
}

/**
 * Format a Thai confirmation message for a created transaction.
 */
export function formatConfirmationMessage(
  transaction: { amount: number | { toString(): string }; type: string; description: string | null; date: string | Date },
  extracted: ExtractedTransaction,
): string {
  const typeLabel = extracted.type === 'income' ? 'รายรับ' : extracted.type === 'transfer' ? 'โอน' : 'รายจ่าย';
  const amount = new Intl.NumberFormat('th-TH').format(Number(transaction.amount));

  let msg = `✅ บันทึก${typeLabel}แล้ว!\n`;
  msg += `📝 ${transaction.description || extracted.description}\n`;
  msg += `💰 ${amount} บาท\n`;

  if (extracted.categoryGroupName) {
    msg += `📂 หมวด: ${extracted.categoryGroupName}\n`;
  }

  if (extracted.merchantName) {
    msg += `🏪 ร้าน: ${extracted.merchantName}\n`;
  }

  if (extracted.needsConfirmation) {
    msg += `\n❓ ไม่แน่ใจว่าเป็นรายรับหรือรายจ่าย — กรุณาตรวจสอบ`;
  } else if (extracted.confidence < 0.7) {
    msg += `\n⚠️ ความมั่นใจ: ${Math.round(extracted.confidence * 100)}% — กรุณาตรวจสอบความถูกต้อง`;
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
 * Intent types the LLM can detect from user messages.
 */
export type UserIntent = 'create_transaction' | 'balance' | 'recent' | 'summary' | 'budget' | 'help';

/**
 * Use LLM to detect the user's intent from a Thai text message.
 * Routes between transaction creation and data queries.
 */
export async function detectIntent(text: string): Promise<UserIntent> {
  const prompt = `จากข้อความต่อไปนี้ ระบุความตั้งใจของผู้ใช้:

ข้อความ: "${text}"

ตอบเป็น JSON เท่านั้น โดยเลือก intent หนึ่งตัวเท่านั้น:
- "create_transaction" — ผู้ใช้ต้องการบันทึกรายการใช้เงิน/รับเงิน (มีจำนวนเงิน)
- "balance" — ผู้ใช้ต้องการดูยอดเงินคงเหลือ
- "recent" — ผู้ใช้ต้องการดูรายการล่าสุด
- "summary" — ผู้ใช้ต้องการดูสรุปยอดรายรับรายจ่าย
- "help" — ผู้ใช้ถามว่าบอททำอะไรได้ หรือข้อความไม่เข้ากรณีอื่น

ตอบ: {"intent":"..."}`;

  try {
    const result = await ollamaChat({
      model: OLLAMA_TEXT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      format: 'json',
      temperature: 0,
      topP: 0.3,
    });

    const parsed = JSON.parse(result.trim().replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, ''));
    const intent = String(parsed.intent ?? '');

    if (['create_transaction', 'balance', 'recent', 'summary', 'help'].includes(intent)) {
      return intent as UserIntent;
    }
  } catch {
    // Fall through to keyword detection
  }

  // Fallback: keyword-based detection
  return detectIntentByKeywords(text);
}

/**
 * Fallback intent detection using Thai/English keywords.
 * Used when LLM is unavailable or returns unexpected output.
 */
function detectIntentByKeywords(text: string): UserIntent {
  const q = text.toLowerCase().trim();

  if (/(ดูยอด|ยอดคงเหลือ|ยอดเงิน|เงินเหลือ|เหลือเท่าไหร่|balance)/i.test(q)) return 'balance';
  if (/(รายการล่าสุด|ล่าสุด|รายการวันนี้|วันนี้|recent|last)/i.test(q)) return 'recent';
  if (/(สรุป|สรุปยอด|รวม|รวมรายจ่าย|รวมรายรับ|summary|total)/i.test(q)) return 'summary';
  if (/(^งบ$|งบประมาณ|budget)/i.test(q)) return 'budget';
  if (/(ช่วย|ใช้ยังไง|ทำอะไรได้|help|บอททำอะไร)/i.test(q)) return 'help';

  return 'create_transaction';
}

/**
 * LINE Quick Reply items for the main menu.
 * Shown after every bot response so users can tap to navigate.
 */
export const QUICK_REPLY_ITEMS = [
  { label: '📱 เปิด MyFam', type: 'uri' as const, uri: `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID || ''}` },
  { label: '📊 ดูสรุปยอด', action: 'สรุปยอด' },
  { label: '❓ ช่วยเหลือ', action: 'ช่วยเหลือ' },
] as const;

/**
 * Quick Reply items shown when type needs confirmation (expense vs income).
 */
export const CONFIRM_TYPE_ITEMS = [
  { label: '✅ ใช่ รายจ่าย', action: 'ยืนยันรายจ่าย' },
  { label: '✅ ใช่ รายรับ', action: 'ยืนยันรายรับ' },
  { label: '❌ ยกเลิก', action: 'ยกเลิก' },
] as const;

/**
 * Build Quick Reply items for category group selection.
 * Groups are filtered by transaction type (expense/income/transfer).
 * LINE allows max 13 items per Quick Reply.
 */
export function buildCategoryGroupReply(
  groups: Array<{ id: string; name: string; type: string }>,
  transactionType: 'income' | 'expense' | 'transfer',
  pendingTransactionId?: string,
) {
  const filtered = groups.filter((g) => g.type === transactionType);
  // Format: "เลือกหมวด:{groupId}" so we can parse it back
  const items = filtered.slice(0, 12).map((g) => ({
    label: g.name,
    action: `เลือกหมวด:${g.id}`,
  }));
  // Add cancel option
  items.push({ label: '❌ ข้าม', action: 'ข้ามหมวด' });
  return formatQuickReply(items);
}

/**
 * Build Quick Reply items for subcategory selection within a group.
 */
export function buildSubcategoryReply(
  categories: Array<{ id: string; name: string }>,
) {
  // LINE allows max 13 items
  const items = categories.slice(0, 12).map((c) => ({
    label: c.name,
    action: `เลือกประเภท:${c.id}`,
  }));
  items.push({ label: '❌ ข้าม', action: 'ข้ามประเภท' });
  return formatQuickReply(items);
}

/**
 * Format a LINE Quick Reply JSON for the given actions.
 * Returns the LINE Messaging API quickReply structure.
 */
export function formatQuickReply(
  actions: ReadonlyArray<
    | { label: string; action: string }
    | { label: string; type: 'uri'; uri: string }
  >,
) {
  return {
    type: 'quickReply' as const,
    items: actions.map((a) => {
      if ('type' in a && a.type === 'uri') {
        return {
          type: 'action' as const,
          action: {
            type: 'uri' as const,
            label: a.label,
            uri: a.uri,
          },
        };
      }
      return {
        type: 'action' as const,
        action: {
          type: 'message' as const,
          label: (a as { label: string; action: string }).label,
          text: (a as { label: string; action: string }).action,
        },
      };
    }),
  };
}

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