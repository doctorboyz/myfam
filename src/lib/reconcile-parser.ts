import { Account } from '@/types';

export interface ParsedReconcile {
  newBalance: number;
  account: Account;
  confidence: number;
}

/**
 * Parse Thai text into a reconcile record.
 *
 * Patterns:
 *   "ยอดจริง 15000 กรุงไทย"
 *   "กระทบยอด 15000 กรุงไทย"
 *   "15000 กรุงไทย"
 */
export function parseReconcile(
  text: string,
  accounts: Account[],
): ParsedReconcile | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Extract number and account name
  const re =
    /(?:ยอดจริง|กระทบยอด)?\s*([\d,]+(?:\.\d+)?)\s+(.+)/i;
  const m = trimmed.match(re);
  if (!m) return null;

  const amount = parseFloat(m[1].replace(/,/g, '')) || 0;
  if (amount <= 0) return null;

  const remainder = m[2].trim();
  const match = findBestMatch(remainder, accounts);
  if (!match) return null;

  return {
    newBalance: amount,
    account: match.account,
    confidence: match.confidence,
  };
}

interface AccountMatch {
  account: Account;
  confidence: number;
}

function findBestMatch(
  fragment: string,
  accounts: Account[],
): AccountMatch | null {
  const lower = fragment.toLowerCase();
  let best: AccountMatch | null = null;

  for (const acc of accounts) {
    const name = acc.name.toLowerCase();
    const accNo = acc.accountNo?.toLowerCase() || '';

    if (name === lower || accNo === lower) {
      return { account: acc, confidence: 1.0 };
    }

    if (name.startsWith(lower) || (accNo && accNo.startsWith(lower))) {
      if (!best || best.confidence < 0.8) {
        best = { account: acc, confidence: 0.8 };
      }
      continue;
    }

    if (name.includes(lower) || (accNo && accNo.includes(lower))) {
      if (!best || best.confidence < 0.6) {
        best = { account: acc, confidence: 0.6 };
      }
    }
  }

  return best;
}