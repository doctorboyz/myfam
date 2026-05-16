import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Thai slip/receipt OCR using system Tesseract binary.
 * Requires: apk add tesseract-ocr tesseract-ocr-data-tha tesseract-ocr-data-eng
 */

const SLIP_KEYWORDS = [
  'จํานวนเงิน',
  'จำนวนเงิน',
  'บาท',
  'THB',
  'Transaction',
  'โอนเงิน',
  'จ่ายบิล',
  'สําเร็จ',
  'สำเร็จ',
  'TrueMoney',
  'KBank',
  'SCB',
  'Bangkok Bank',
  'จากบัญชี',
  'เข้าบัญชี',
  'Amount',
  'Fee',
  'ค่าธรรมเนียม',
  'รหัสอ้างอิง',
  'เลขที่รายการ',
  'ยอดรวม',
  'รายการ',
  'จ่าย',
  'รับ',
  'โอน',
  'PromptPay',
  'พร้อมเพย์',
  'Wallet',
  'สลิป',
  'ใบเสร็จ',
  'Receipt',
  'Slip',
  'Successful',
  'Complete',
  'Total',
  'Subtotal',
  'ภาษี',
  'VAT',
  'change',
  'เงินทอน',
  'ชำระเงิน',
];

/**
 * Extract text from an image buffer using Tesseract binary.
 * Writes image to a temp file, runs tesseract, reads stdout.
 */
export async function extractSlipText(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
  const tmpDir = os.tmpdir();
  const tmpBase = `slip-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tmpImage = path.join(tmpDir, `${tmpBase}.png`);
  const tmpOutput = path.join(tmpDir, `${tmpBase}`);

  try {
    // Write image to temp file
    fs.writeFileSync(tmpImage, imageBuffer);

    // Run tesseract: output to stdout with hocr for confidence info
    // Using -l tha+eng for Thai + English
    // Using --psm 6 for assume a single uniform block of text (good for receipts)
    const { stdout } = await execFileAsync('tesseract', [
      tmpImage,
      'stdout',
      '-l', 'tha+eng',
      '--psm', '6',
    ]);

    const text = stdout.trim();

    // Simple heuristic confidence: ratio of non-empty lines
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const nonEmptyRatio = lines.length > 0 ? 1 : 0;
    // Also check if any numbers exist (receipts always have numbers)
    const hasNumbers = /\d/.test(text);
    const confidence = nonEmptyRatio > 0 && hasNumbers ? 85 : 30;

    return { text, confidence };
  } catch (error) {
    console.error('Tesseract OCR error:', error);
    return { text: '', confidence: 0 };
  } finally {
    // Cleanup temp files
    try {
      fs.unlinkSync(tmpImage);
    } catch {
      // ignore
    }
  }
}

/**
 * Check if OCR text contains slip/receipt keywords.
 */
export function isSlipKeyword(text: string): boolean {
  const lower = text.toLowerCase();
  return SLIP_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Thai polite message when the image is not a slip/receipt.
 */
export function formatNonSlipMessage(): string {
  return `🤖 ขออภัยนะครับ\n\nระบบสามารถอ่านได้เฉพาะสลิปธนาคารและใบเสร็จรับเงินเท่านั้นครับ\n\n💡 ลองพิมพ์รายละเอียดธุรกรรมแทนได้เลย เช่น "ซื้อข้าว 85 บาท"`;
}

/**
 * Thai polite message when the slip is unreadable.
 */
export function formatUnclearSlipMessage(): string {
  return `🤖 สลิปนี้อ่านยากเกินไปนะครับ\n\n💡 กรุณาส่งรูปใหม่ที่ชัดกว่า หรือพิมพ์รายละเอียดธุรกรรมแทนได้เลย เช่น "โอนให้แม่ 3,000 บาท"`;
}
