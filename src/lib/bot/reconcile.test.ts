import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    reconciliation: { create: vi.fn() },
    account: { update: vi.fn(), findMany: vi.fn() },
  },
}));

vi.mock('@/lib/ai-client', () => ({
  aiChat: vi.fn(),
  AI_INTENT_MODEL: 'test-model',
}));

const { parseReconcileRegex, extractReconcile } = await import('./reconcile');
const { aiChat } = await import('@/lib/ai-client');

describe('parseReconcileRegex', () => {
  it('set: ปรับ <account> เป็น <amount>', () => {
    const r = parseReconcileRegex('ปรับ 1688 เป็น 5000');
    expect(r).toMatchObject({ mode: 'set', amount: 5000, accountNameRaw: '1688', confidence: 0.9 });
  });

  it('set with บัญชี prefix stripped', () => {
    const r = parseReconcileRegex('ปรับยอด บัญชี make เป็น 5000');
    expect(r).toMatchObject({ mode: 'set', amount: 5000, accountNameRaw: 'make' });
  });

  it('adjust เพิ่ม', () => {
    const r = parseReconcileRegex('ปรับ make เพิ่ม 1000');
    expect(r).toMatchObject({ mode: 'adjust', amount: 1000, adjustSign: 1, accountNameRaw: 'make' });
  });

  it('adjust ลด', () => {
    const r = parseReconcileRegex('กระทบยอด make ลด 500');
    expect(r).toMatchObject({ mode: 'adjust', amount: 500, adjustSign: -1 });
  });

  it('bare: ปรับยอด <amount>', () => {
    const r = parseReconcileRegex('ปรับยอด 4500');
    expect(r).toMatchObject({ mode: 'set', amount: 4500, accountNameRaw: null, confidence: 0.6 });
  });

  it('with หมายเหตุ', () => {
    const r = parseReconcileRegex('ปรับ make เป็น 5000 หมายเหตุ: ลืมบันทึกเมื่อวาน');
    expect(r).toMatchObject({ mode: 'set', amount: 5000, note: 'ลืมบันทึกเมื่อวาน' });
  });

  it('handles commas in amounts', () => {
    const r = parseReconcileRegex('ปรับ make เป็น 5,000');
    expect(r).toMatchObject({ amount: 5000 });
  });

  it('returns null for non-reconcile text', () => {
    expect(parseReconcileRegex('ซื้อข้าวผัด 85 บาท')).toBeNull();
  });
});

describe('extractReconcile — AI fallback', () => {
  beforeEach(() => {
    vi.mocked(aiChat).mockReset();
  });

  it('skips the AI when the regex matches', async () => {
    const r = await extractReconcile('ปรับ make เป็น 5000');
    expect(r.mode).toBe('set');
    expect(aiChat).not.toHaveBeenCalled();
  });

  it('falls back to the AI for unmatched phrasings', async () => {
    vi.mocked(aiChat).mockResolvedValue(
      '{"mode":"set","amount":3000,"adjustSign":0,"accountNameRaw":"กสิกร","note":null,"confidence":0.8}',
    );
    const r = await extractReconcile('จริงๆ มีอยู่ 3000 ในกสิกร');
    expect(r).toMatchObject({ mode: 'set', amount: 3000, accountNameRaw: 'กสิกร' });
    expect(aiChat).toHaveBeenCalled();
  });

  it('degrades to low confidence when the AI fails', async () => {
    vi.mocked(aiChat).mockRejectedValue(new Error('boom'));
    const r = await extractReconcile('จริงๆ มีอยู่เยอะ');
    expect(r.amount).toBe(0);
    expect(r.confidence).toBeLessThan(0.4);
  });
});