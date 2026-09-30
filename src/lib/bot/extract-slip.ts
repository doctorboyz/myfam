/**
 * AI slip/receipt vision extraction — first implementation of
 * AI_EXTRACT_SLIP_MODEL (the env existed but had no call site).
 *
 * Kill switch: TELEGRAM_SLIP_ENABLED must be 'true' to run; callers
 * degrade gracefully ("พิมพ์รายละเอียดแทน") when it is off.
 */

import { aiChat, AI_EXTRACT_SLIP_MODEL } from '@/lib/ai-client';
import { getBangkokDateString } from '@/lib/timezone';
import {
  parseExtractedTransaction,
  matchCategory,
  formatCategoryList,
  type CategoryContextItem,
  type ExtractedTransaction,
} from './extract';

export function isSlipEnabled(): boolean {
  return process.env.TELEGRAM_SLIP_ENABLED === 'true';
}

/** Resize a base64 image (sharp) for cloud inference — balances speed vs OCR accuracy. */
export async function resizeImageBase64(base64: string, maxDim: number): Promise<string> {
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

/**
 * Extract transaction data from a slip/receipt image using the vision model.
 * Resized to 512px JPEG — Telegram recompresses photos to ~1280px already.
 */
export async function extractFromSlip(
  imageBase64: string,
  categories: CategoryContextItem[],
): Promise<ExtractedTransaction> {
  if (!isSlipEnabled()) {
    throw new Error('slip reading is disabled');
  }

  const resizedBase64 = await resizeImageBase64(imageBase64, 512);
  const categoryList = formatCategoryList(categories);

  const prompt = `อ่านสลิป/ใบเสร็จ/QR payment นี้แล้วสกัดข้อมูลธุรกรรม
วันนี้: ${getBangkokDateString()}
หมวดหมู่: ${categoryList}

สำคัญ: พิจารณา type จากสลิปอย่างรอบคอบ:
- expense (เราจ่ายออก): เห็นชื่อเราเป็น "ผู้โอน" หรือ "จากบ/ช", มีคำว่า "โอนเงิน", "จ่าย", "ชำระ", PromptPay ที่เราแสกนจ่าย
- income (เรารับเข้า): เห็นชื่อเราเป็น "ผู้รับโอน" หรือ "เข้าบ/ช", มีคำว่า "รับโอน", "รับเงิน", "CREDIT", สลิปที่คนอื่นส่งมา
- transfer: โอนระหว่างบัญชีตัวเอง
- ถ้าไม่แน่ใจว่า expense หรือ income ให้ใส่ needsConfirmation=true

สำคัญมาก: ค่า type ต้องเป็นภาษาอังกฤษเท่านั้น ได้แก่ "expense" หรือ "income" หรือ "transfer" ห้ามใช้ภาษาอื่น

สำคัญมาก: สลิปไทยพิมพ์วันที่เป็น พ.ศ. (เช่น 9 พ.ค. 2569, 09/05/2569) — ต้องแปลงเป็น ค.ศ. โดยลบ 543 จากปี ก่อนใส่ในช่อง date (2569 - 543 = 2026) ห้ามส่งปี พ.ศ. ตรงๆ

ตอบเป็น JSON เท่านั้น:
{"amount":จำนวนเงิน,"date":"YYYY-MM-DD","description":"ชื่อร้านหรือรายการ","type":"expenseหรือincomeหรือtransfer","categoryGroupName":"ชื่อหมวดหมู่ย่อยจากด้านบน","merchantName":"ชื่อร้าน","accountName":"ชื่อบัญชีหรือnull","confidence":0ถึง1,"needsConfirmation":trueหรือfalse}
ถ้าอ่านจำนวนเงินไม่ได้ให้ใส่ amount=0
accountName: ถ้าสลิประบุบัญชี (เช่น "จากบัญชี xxx", "เข้าบัญชี xxx", "xxx ไทยพาณิชย์") ให้สกัดชื่อบัญชี ถ้าไม่ระบุให้ใส่ null
เลือก categoryGroupName เป็นชื่อหมวดหมู่ย่อยที่ตรงกับรายการมากที่สุดจากหมวดหมู่ด้านบน ถ้าไม่มีหมวดย่อยที่ตรง ให้ใส่ชื่อกลุ่มหมวดแทน`;

  const result = await aiChat({
    model: AI_EXTRACT_SLIP_MODEL,
    messages: [{ role: 'user', content: prompt, images: [resizedBase64] }],
    format: 'json',
    temperature: 0.1,
    topP: 0.6,
  });

  const extracted = parseExtractedTransaction(result);
  matchCategory(extracted, categories);
  return extracted;
}