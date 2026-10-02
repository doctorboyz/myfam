import { describe, it, expect } from 'vitest';
import {
  filtersToParams,
  paramsToFilters,
  filtersToQueryString,
} from './filters-url';
import { getBangkokDateString } from './timezone';
import { UNCATEGORIZED_FILTER } from '@/types';

const fallback = {
  users: [],
  dateRange: { start: new Date(2026, 9, 1), end: new Date(2026, 9, 31) },
  types: [],
  categories: [],
  accounts: [],
};

describe('filters-url round-trip', () => {
  it('keeps every filter dimension across serialize → parse', () => {
    const filters = {
      users: ['u1', 'u2'],
      dateRange: { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30) },
      types: ['expense' as const],
      categories: ['cat1', 'cat2'],
      accounts: ['acc1'],
    };
    const parsed = paramsToFilters(filtersToParams(filters), fallback);
    expect(parsed.users).toEqual(['u1', 'u2']);
    expect(parsed.types).toEqual(['expense']);
    expect(parsed.categories).toEqual(['cat1', 'cat2']);
    expect(parsed.accounts).toEqual(['acc1']);
    // Bangkok YYYY-MM-DD strings parse back to the same calendar day
    expect(getBangkokDateString(parsed.dateRange.start!)).toBe('2026-09-01');
    expect(getBangkokDateString(parsed.dateRange.end!)).toBe('2026-09-30');
  });

  it('preserves the uncategorized pseudo-option (the กาแฟ โกโก้ cleanup path)', () => {
    const filters = {
      ...fallback,
      categories: [UNCATEGORIZED_FILTER],
    };
    const parsed = paramsToFilters(filtersToParams(filters), fallback);
    expect(parsed.categories).toEqual([UNCATEGORIZED_FILTER]);
  });

  it('preserves an explicit "ทั้งหมด" (null) date range across a refresh', () => {
    const filters = { ...fallback, dateRange: { start: null, end: null } };
    const parsed = paramsToFilters(filtersToParams(filters), fallback);
    expect(parsed.dateRange.start).toBeNull();
    expect(parsed.dateRange.end).toBeNull();
  });

  it('falls back to defaults when no params are present', () => {
    const parsed = paramsToFilters(new URLSearchParams(), fallback);
    expect(parsed.users).toEqual([]);
    expect(parsed.dateRange.start).toEqual(fallback.dateRange.start);
    expect(parsed.dateRange.end).toEqual(fallback.dateRange.end);
  });

  it('emits no params for the default empty filter set', () => {
    const empty = {
      users: [],
      dateRange: { start: null, end: null },
      types: [],
      categories: [],
      accounts: [],
    };
    // range=all is still emitted — a null range is meaningful, not default
    expect(filtersToQueryString(empty)).toBe('?range=all');
  });
});