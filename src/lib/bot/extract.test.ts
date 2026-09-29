import { describe, it, expect, vi } from 'vitest';

// Hoisted with vi.mock — extract.ts must pick up the mock on import
const aiChat = vi.fn();
vi.mock('@/lib/ai-client', () => ({
  aiChat: (...args: unknown[]) => aiChat(...(args as [])),
  AI_EXTRACT_TEXT_MODEL: 'test-model',
  AI_INTENT_MODEL: 'test-model',
  AI_EXTRACT_SLIP_MODEL: 'test-vision-model',
}));

import {
  matchCategory,
  parseDate,
  parseExtractedTransaction,
  validateExtracted,
  extractFromText,
  type CategoryContextItem,
} from './extract';
import { getBangkokDateString } from '@/lib/timezone';

const categories: CategoryContextItem[] = [
  { id: 'cat-food', name: 'ค่าอาหาร', groupName: 'อาหาร', groupType: 'expense' },
  { id: 'cat-transport', name: 'ค่าเดินทาง', groupName: 'เดินทาง', groupType: 'expense' },
  { id: 'cat-salary', name: 'เงินเดือน', groupName: 'รายรับ', groupType: 'income' },
];

describe('parseExtractedTransaction', () => {
  it('parses a plain JSON response', () => {
    const r = parseExtractedTransaction(
      '{"amount":85,"date":"2026-09-29","description":"ซื้อข้าวผัด","type":"expense","categoryGroupName":"อาหาร","confidence":0.95}',
    );
    expect(r.amount).toBe(85);
    expect(r.type).toBe('expense');
    expect(r.confidence).toBe(0.95);
  });

  it('strips markdown fences', () => {
    const r = parseExtractedTransaction(
      '```json\n{"amount":100,"date":"2026-09-29","description":"test","type":"income","categoryGroupName":"","confidence":0.9}\n```',
    );
    expect(r.amount).toBe(100);
  });

  it('repairs trailing garbage after the last closing brace', () => {
    const r = parseExtractedTransaction(
      '{"amount":50,"date":"2026-09-29","description":"ค่าน้ำ","type":"expense","categoryGroupName":"การเงิน","confidence":0.8} เพิ่มเติม...',
    );
    expect(r.amount).toBe(50);
  });

  it('throws on completely invalid JSON', () => {
    expect(() => parseExtractedTransaction('not json at all')).toThrow(/invalid JSON/);
  });

  it('coerces bad type to expense and clamps missing fee/confidence', () => {
    const r = parseExtractedTransaction(
      '{"amount":10,"date":"2026-09-29","description":"x","type":"รายจ่าย","categoryGroupName":"","fee":-5,"confidence":"abc"}',
    );
    expect(r.type).toBe('expense');
    expect(r.fee).toBe(0);
    expect(r.confidence).toBe(0.5);
  });
});

describe('matchCategory — three tiers', () => {
  it('exact group match sets categoryId', () => {
    const e = parseExtractedTransaction(
      '{"amount":85,"date":"2026-09-29","description":"ข้าว","type":"expense","categoryGroupName":"อาหาร","confidence":0.9}',
    );
    matchCategory(e, categories);
    expect(e.categoryId).toBe('cat-food');
  });

  it('case-insensitive match', () => {
    const e = parseExtractedTransaction(
      '{"amount":85,"date":"2026-09-29","description":"x","type":"expense","categoryGroupName":"อาหาร","confidence":0.9}',
    );
    // Thai has no case, so test with an English category
    const engCats: CategoryContextItem[] = [
      { id: 'cat-food', name: 'Food', groupName: 'food', groupType: 'expense' },
    ];
    const e2 = parseExtractedTransaction(
      '{"amount":85,"date":"2026-09-29","description":"x","type":"expense","categoryGroupName":"FOOD","confidence":0.9}',
    );
    matchCategory(e2, engCats);
    expect(e2.categoryId).toBe('cat-food');
    expect(e).toBeTruthy();
  });

  it('includes match', () => {
    const e = parseExtractedTransaction(
      '{"amount":85,"date":"2026-09-29","description":"x","type":"expense","categoryGroupName":"ค่าอาหารและเครื่องดื่ม","confidence":0.9}',
    );
    matchCategory(e, categories);
    expect(e.categoryId).toBe('cat-food');
  });

  it('no match leaves categoryId null', () => {
    const e = parseExtractedTransaction(
      '{"amount":85,"date":"2026-09-29","description":"x","type":"expense","categoryGroupName":"ไม่มีหมวดนี้","confidence":0.9}',
    );
    matchCategory(e, categories);
    expect(e.categoryId).toBeNull();
  });
});

describe('parseDate', () => {
  it('passes through YYYY-MM-DD', () => {
    expect(parseDate('2026-01-15')).toBe('2026-01-15');
  });
  it('converts DD/MM/YYYY', () => {
    expect(parseDate('15/01/2026')).toBe('2026-01-15');
  });
  it('converts DD/MM/YY with century fix', () => {
    expect(parseDate('5/9/26')).toBe('2026-09-05');
  });
});

describe('validateExtracted — confidence gate', () => {
  const good = {
    amount: 85,
    date: '2026-09-29',
    description: 'ซื้อข้าวผัด',
    type: 'expense' as const,
    categoryId: null,
    categoryGroupName: '',
    confidence: 0.95,
  };

  it('accepts a complete extraction', () => {
    const v = validateExtracted(good);
    expect(v.valid).toBe(true);
    expect(v.message).toBe('');
  });

  it('rejects amount 0 with a Thai message mentioning the gap', () => {
    const v = validateExtracted({ ...good, amount: 0 });
    expect(v.valid).toBe(false);
    expect(v.missingFields).toContain('amount');
    expect(v.message).toContain('จำนวนเงิน');
  });

  it('rejects empty description and future dates', () => {
    expect(validateExtracted({ ...good, description: '' }).missingFields).toContain('description');
    expect(validateExtracted({ ...good, date: '2099-01-01' }).missingFields).toContain('date');
  });

  it('accepts today’s Bangkok date when the process runs UTC and Bangkok is already tomorrow', () => {
    // Production containers run UTC. Between 00:00–07:00 Bangkok (17:00–24:00 UTC)
    // the Bangkok calendar date is "tomorrow" from the container's viewpoint, so
    // comparing the Bangkok date against a container-local timestamp wrongly flags
    // every transaction as having a future date.
    const originalTz = process.env.TZ;
    process.env.TZ = 'UTC';
    vi.setSystemTime(new Date('2026-09-29T22:55:00Z')); // 2026-09-30 05:55 in Bangkok
    try {
      const v = validateExtracted({ ...good, date: getBangkokDateString() });
      expect(v.valid).toBe(true);
    } finally {
      vi.useRealTimers();
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    }
  });
});

describe('extractFromText — AI wiring (mocked)', () => {
  it('calls the text model and matches the category', async () => {
    aiChat.mockResolvedValue(
      '{"amount":85,"date":"2026-09-29","description":"ซื้อข้าวผัด","type":"expense","categoryGroupName":"อาหาร","confidence":0.95}',
    );
    const result = await extractFromText('ซื้อข้าวผัด 85 บาท', categories);
    expect(result.amount).toBe(85);
    expect(result.categoryId).toBe('cat-food');
    expect(result.type).toBe('expense');
  });
});