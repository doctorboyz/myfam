/**
 * AI transaction extraction from Thai text.
 * Ported from the LINE bot's ollama.ts (08a2eba) with two fixes:
 * - "today" uses Bangkok time (src/lib/timezone.ts), not UTC
 * - calls aiChat directly (no ollama wrapper layer)
 */

import { aiChat, AI_EXTRACT_TEXT_MODEL } from '@/lib/ai-client';
import { getBangkokDateString } from '@/lib/timezone';

export interface ExtractedTransaction {
  amount: number;
  date: string;
  description: string;
  type: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  categoryGroupName: string;
  merchantName?: string;
  accountName?: string;
  toAccountName?: string;
  fee?: number;
  confidence: number;
  needsConfirmation?: boolean;
}

export interface CategoryContextItem {
  id: string;
  name: string;
  groupName: string;
  groupType: string;
}

/**
 * Extract transaction data from a Thai text message using the text model.
 * Example: "ซื้อข้าวผัด 85 บาท" → { amount: 85, description: "ซื้อข้าวผัด", type: "expense" }
 */
export async function extractFromText(
  text: string,
  categories: CategoryContextItem[],
): Promise<ExtractedTransaction> {
  // Only send top-level group names (not every category) to keep the prompt short
  const groups = [...new Set(categories.map((c) => `${c.groupName}(${c.groupType})`))];
  const groupList = groups.join(', ');
  const today = getBangkokDateString();

  const systemPrompt = `คุณคือ AI สกัดข้อมูลธุรกรรมการเงินจากข้อความภาษาไทย
พิจารณา type อย่างรอบคอบ:
- expense (รายจ่าย): ซื้อ, จ่าย, ชำระ, ค่า, กิน, ดื่ม, เติม, โอนให้คนอื่น — เงินออกจากเรา
- income (รายรับ): รับ, เงินเข้า, เงินเดือน, โบนัส, ลูกค้าโอน, รับโอน — เงินเข้ามาหาเรา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

สำคัญมาก: ค่า type ต้องเป็นภาษาอังกฤษเท่านั้น ได้แก่ "expense" หรือ "income" หรือ "transfer" ห้ามใช้ภาษาอื่น

ถ้าข้อความไม่มีจำนวนเงินชัดเจน หรือไม่ใช่ข้อความเกี่ยวกับธุรกรรมการเงิน ให้ confidence ต่ำ (ต่ำกว่า 0.4)`;

  const userPrompt = `สกัดข้อมูลธุรกรรมจาก: "${text}"

วันนี้: ${today}
กลุ่มหมวด: ${groupList}

ตัวอย่าง:
"ซื้อข้าวผัด 85 บาท" → {"amount":85,"date":"${today}","description":"ซื้อข้าวผัด","type":"expense","categoryGroupName":"อาหาร","merchantName":null,"accountName":null,"confidence":0.95,"needsConfirmation":false}
"รับเงินเดือน 45000 บาท" → {"amount":45000,"date":"${today}","description":"เงินเดือน","type":"income","categoryGroupName":"เงินเดือน","merchantName":null,"accountName":null,"confidence":0.95,"needsConfirmation":false}
"โอนเงิน 5000 บาท" → {"amount":5000,"date":"${today}","description":"โอนเงิน","type":"transfer","categoryGroupName":"การเงิน","merchantName":null,"accountName":null,"confidence":0.8,"needsConfirmation":false}
"จ่ายให้แม่ 3000 บาท" → {"amount":3000,"date":"${today}","description":"จ่ายให้แม่","type":"expense","categoryGroupName":"ลูกและครอบครัว","merchantName":null,"accountName":null,"confidence":0.7,"needsConfirmation":true}
"สวัสดีครับ" → {"amount":0,"date":"${today}","description":"","type":"expense","categoryGroupName":"","merchantName":null,"accountName":null,"confidence":0.1,"needsConfirmation":false}
"85" → {"amount":85,"date":"${today}","description":"85","type":"expense","categoryGroupName":"","merchantName":null,"accountName":null,"confidence":0.2,"needsConfirmation":false}
"ซื้อของที่เซเว่น" → {"amount":0,"date":"${today}","description":"ซื้อของที่เซเว่น","type":"expense","categoryGroupName":"อาหาร","merchantName":"เซเว่น","accountName":null,"confidence":0.5,"needsConfirmation":false}
"จ่ายค่าน้ำ 500 จากบัญชีกสิกร" → {"amount":500,"date":"${today}","description":"ค่าน้ำ","type":"expense","categoryGroupName":"การเงิน","merchantName":null,"accountName":"กสิกร","confidence":0.9,"needsConfirmation":false}

ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"คำอธิบาย","type":"expenseหรือincomeหรือtransfer","categoryGroupName":"ชื่อกลุ่มหมวด","merchantName":"ชื่อร้านหรือnull","accountName":"ชื่อบัญชีหรือnull","confidence":0ถึง1,"needsConfirmation":trueหรือfalse}
ถ้าไม่มีจำนวนเงิน ให้ใส่ amount=0
accountName: ถ้าข้อความระบุบัญชี (เช่น "จากบัญชีกสิกร", "เข้ากระเป๋าสตางค์") ให้สกัดชื่อบัญชี ถ้าไม่ระบุให้ใส่ null
เลือก categoryGroupName ที่ตรงกับรายการมากที่สุดจากกลุ่มหมวดด้านบน`;

  const result = await aiChat({
    model: AI_EXTRACT_TEXT_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    format: 'json',
  });

  const extracted = parseExtractedTransaction(result);
  matchCategory(extracted, categories);
  return extracted;
}

/**
 * Match AI-returned categoryGroupName against known categories.
 * Three tiers: exact → case-insensitive → includes.
 */
export function matchCategory(
  extracted: ExtractedTransaction,
  categories: CategoryContextItem[],
): void {
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
 * Thai slips print years in Buddhist era (พ.ศ.) and models often pass them
 * through unconverted. Years ≥ 2400 can only be พ.ศ. (Gregorian 2400 is
 * centuries in the future), so normalize them to ค.ศ. by subtracting 543.
 */
function gregorianYear(year: number): number {
  return year >= 2400 ? year - 543 : year;
}

/**
 * Parse date strings from AI responses into YYYY-MM-DD format.
 * Handles: YYYY-MM-DD, DD/MM/YYYY, DD/MM/YY, and Buddhist-era years.
 */
export function parseDate(dateStr: string): string {
  const today = getBangkokDateString();
  if (!dateStr) return today;

  const iso = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    return `${gregorianYear(Number(iso[1]))}-${iso[2]}-${iso[3]}`;
  }

  const dmy = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const month = dmy[2].padStart(2, '0');
    const rawYear = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3];
    return `${gregorianYear(Number(rawYear))}-${month}-${day}`;
  }

  // Native Date parsing as fallback
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return getBangkokDateString(d);

  return today;
}

/**
 * Parse the AI response JSON into an ExtractedTransaction.
 * Handles common AI response quirks (markdown fences, truncated JSON).
 */
export function parseExtractedTransaction(raw: string): ExtractedTransaction {
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
    accountName: parsed.accountName ? String(parsed.accountName) : undefined,
    fee: Number(parsed.fee) > 0 ? Number(parsed.fee) : 0,
    confidence: Number(parsed.confidence) || 0.5,
    needsConfirmation: parsed.needsConfirmation === true,
  };
}

export interface ValidationResult {
  valid: boolean;
  missingFields: string[];
  message: string;
}

/** Validate extracted data; returns a polite Thai message listing gaps. */
export function validateExtracted(extracted: ExtractedTransaction): ValidationResult {
  const missingFields: string[] = [];

  if (!extracted.amount || extracted.amount <= 0) missingFields.push('amount');

  // Compare calendar dates, not timestamps: dates are Bangkok-day strings, while
  // new Date() is container-local (UTC in production). Between 00:00–07:00 Bangkok
  // the local "today" is still yesterday from the container's viewpoint, which would
  // wrongly flag every transaction as having a future date.
  const todayStr = getBangkokDateString();
  const minDateStr = '2020-01-01';
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(extracted.date) ||
    extracted.date > todayStr ||
    extracted.date < minDateStr
  ) {
    missingFields.push('date');
  }

  if (!extracted.description || extracted.description.trim().length === 0) {
    missingFields.push('description');
  }

  if (!['income', 'expense', 'transfer'].includes(extracted.type)) {
    missingFields.push('type');
  }

  if (missingFields.length === 0) {
    return { valid: true, missingFields: [], message: '' };
  }

  const fieldMessages: Record<string, string> = {
    amount: 'จำนวนเงิน',
    date: 'วันที่',
    description: 'รายละเอียดรายการ',
    type: 'ประเภทรายการ',
  };

  const missingLabels = missingFields.map((f) => fieldMessages[f] || f).join(' / ');

  let message = `🤖 ขออภัยนะครับ ข้อมูลไม่ครบถ้วน:\n\n`;
  message += `❌ ไม่พบ: ${missingLabels}\n\n`;
  message += `💡 ลองพิมพ์ใหม่ เช่น:\n`;
  if (missingFields.includes('amount')) message += `   "ซื้อข้าว 85 บาท"\n`;
  if (missingFields.includes('date')) message += `   "ซื้อข้าว 85 บาท วันนี้"\n`;
  if (missingFields.includes('description')) message += `   "ซื้อข้าว 85 บาท"\n`;
  message += `\nหรือส่งสลิปธนาคารมาได้เลยครับ`;

  return { valid: false, missingFields, message };
}