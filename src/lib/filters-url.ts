/**
 * Serialize dashboard/transaction filters to URL search params and back,
 * so a filtered view survives refresh and can be linked from the
 * dashboard (month nav, category drill-down, "uncategorized" chip).
 *
 * Date round-trip: dates serialize as Bangkok YYYY-MM-DD strings and are
 * parsed with `new Date('YYYY-MM-DD')` — the same pattern the date-input
 * handler in DashboardFilter already uses, which getFilteredTransactions
 * normalizes with setHours().
 */
import { DashboardFilters, TransactionType } from '@/types';
import { getBangkokDateString } from './timezone';

function toList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
}

function toDateString(date: Date | null): string | null {
  return date && !isNaN(date.getTime()) ? getBangkokDateString(date) : null;
}

export function filtersToParams(filters: DashboardFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.users.length) params.set('users', filters.users.join(','));
  if (filters.types.length) params.set('types', filters.types.join(','));
  if (filters.categories.length) params.set('categories', filters.categories.join(','));
  if (filters.accounts.length) params.set('accounts', filters.accounts.join(','));

  const start = toDateString(filters.dateRange.start);
  const end = toDateString(filters.dateRange.end);
  if (start) params.set('start', start);
  if (end) params.set('end', end);
  // Explicit "ทั้งหมด" (both ends null) must survive a refresh —
  // without this marker it would fall back to the default month.
  if (!start && !end) params.set('range', 'all');
  return params;
}

export function paramsToFilters(
  params: URLSearchParams,
  fallback: DashboardFilters
): DashboardFilters {
  if (params.get('range') === 'all') {
    return { ...fallback, dateRange: { start: null, end: null } };
  }
  const users = toList(params, 'users');
  const types = toList(params, 'types') as TransactionType[];
  const categories = toList(params, 'categories');
  const accounts = toList(params, 'accounts');
  const startRaw = params.get('start');
  const endRaw = params.get('end');
  const parseDate = (raw: string | null) => (raw ? new Date(raw) : null);
  return {
    users: users.length ? users : fallback.users,
    types: types.length ? types : fallback.types,
    categories: categories.length ? categories : fallback.categories,
    accounts: accounts.length ? accounts : fallback.accounts,
    dateRange: {
      start: parseDate(startRaw) ?? fallback.dateRange.start,
      end: parseDate(endRaw) ?? fallback.dateRange.end,
    },
  };
}

/** Query string (with leading '?') for a link to /transactions. */
export function filtersToQueryString(filters: DashboardFilters): string {
  const qs = filtersToParams(filters).toString();
  return qs ? `?${qs}` : '';
}