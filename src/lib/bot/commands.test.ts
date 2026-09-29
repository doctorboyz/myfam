import { describe, it, expect } from 'vitest';
import { detectCommand, parseStartCode } from './commands';

describe('detectCommand', () => {
  it('detects slash commands', () => {
    expect(detectCommand('/start ABC123')).toBe('start');
    expect(detectCommand('/help')).toBe('help');
    expect(detectCommand('/balance')).toBe('balance');
  });

  it('exact-matches keyboard button texts', () => {
    expect(detectCommand('ยืนยัน')).toBe('confirm');
    expect(detectCommand('ยกเลิก')).toBe('cancel');
    expect(detectCommand('เปลี่ยนหมวด')).toBe('change_category');
    expect(detectCommand('เงินเข้า')).toBe('money_in');
    expect(detectCommand('เงินออก')).toBe('money_out');
    expect(detectCommand('ยืนยันรายจ่าย')).toBe('confirm_expense');
    expect(detectCommand('ยืนยันปรับยอด')).toBe('confirm_reconcile');
    expect(detectCommand('ยกเลิกปรับยอด')).toBe('cancel_reconcile');
  });

  it('parses selection prefixes with the arg after the colon', () => {
    expect(detectCommand('เลือกบัญชี:กสิกร (kbank)')).toBe('select_account');
    expect(detectCommand('เลือกหมวด:อาหาร')).toBe('select_group');
    expect(detectCommand('เลือกประเภท:ค่ากินข้าว')).toBe('select_subcategory');
  });

  it('fuzzy-matches typed Thai queries', () => {
    expect(detectCommand('ดูยอดหน่อย')).toBe('balance');
    expect(detectCommand('เงินเหลือเท่าไหร่')).toBe('balance');
    expect(detectCommand('รายการล่าสุด')).toBe('recent');
    expect(detectCommand('สรุปยอดเดือนนี้')).toBe('summary');
    expect(detectCommand('สรุปสัปดาห์นี้')).toBe('summary');
    expect(detectCommand('ลบรายการล่าสุด')).toBe('delete_last');
    expect(detectCommand('งบประมาณ')).toBe('budget');
    expect(detectCommand('ปรับยอดกสิกรเป็น 5000')).toBe('reconcile');
    expect(detectCommand('ช่วยเหลือ')).toBe('help');
  });

  it('returns none for transaction text', () => {
    expect(detectCommand('ซื้อข้าวผัด 85 บาท')).toBe('none');
    expect(detectCommand('รับเงินเดือน 45000')).toBe('none');
  });

  it('skip buttons', () => {
    expect(detectCommand('ข้ามหมวด')).toBe('skip_group');
    expect(detectCommand('ข้ามประเภท')).toBe('skip_subcategory');
  });
});

describe('parseStartCode', () => {
  it('extracts and uppercases the code', () => {
    expect(parseStartCode('/start abcd23')).toBe('ABCD23');
  });
  it('rejects malformed starts', () => {
    expect(parseStartCode('/start')).toBeNull();
    expect(parseStartCode('/start บอท123')).toBeNull();
    expect(parseStartCode('hello /start abc123')).toBeNull();
  });
});