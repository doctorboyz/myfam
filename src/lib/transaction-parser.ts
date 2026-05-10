import { Account, TransactionType } from '@/types';

export interface ParsedTransaction {
  amount: number;
  type: TransactionType;
  fromAccount?: Account;
  toAccount?: Account;
  confidence: number;
}

/**
 * Parse Thai text into a transaction.
 *
 * Patterns:
 *   "โอน 5000 จากกรุงไทยไปกสิกร" → transfer
 *   "รายจ่าย 500 อาหาร กรุงไทย"   → expense
 *   "รายรับ 50000 เงินเดือน กรุงไทย" → income
 */
export function parseTransaction(
  text: string,
  accounts: Account[],
): ParsedTransaction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Detect type and extract amount + remainder
  const typeResult = detectType(trimmed);
  if (!typeResult) return null;

  const { type, amount, remainder } = typeResult;
  if (amount <= 0) return null;

  // Find accounts from remainder
  const matched = matchAccounts(remainder, accounts);

  const result: ParsedTransaction = { amount, type, confidence: 1.0 };

  if (type === 'transfer') {
    // "จากกรุงไทยไปกสิกร" or "กรุงไทย กสิกร"
    if (matched.length >= 2) {
      result.fromAccount = matched[0].account;
      result.toAccount = matched[1].account;
      result.confidence = Math.min(matched[0].confidence, matched[1].confidence);
    } else if (matched.length === 1) {
      result.fromAccount = matched[0].account;
      result.confidence = matched[0].confidence * 0.7;
    }
  } else {
    // income/expense — single account
    if (matched.length >= 1) {
      result.fromAccount = matched[0].account;
      result.confidence = matched[0].confidence;
    }
  }

  return result;
}

function detectType(text: string): {
  type: TransactionType;
  amount: number;
  remainder: string;
} | null {
  // Transfer patterns
  const transferRe =
    /โอน\s*([\d,]+(?:\.\d+)?)\s*(?:จาก)?\s*(.+)/i;
  let m = text.match(transferRe);
  if (m) {
    return {
      type: 'transfer',
      amount: parseNumber(m[1]),
      remainder: m[2].replace(/^จาก\s*/, ''),
    };
  }

  // Expense patterns
  const expenseRe =
    /(?:รายจ่าย|จ่าย|ใช้|ซื้อ)\s*([\d,]+(?:\.\d+)?)\s*(.*)/i;
  m = text.match(expenseRe);
  if (m) {
    return { type: 'expense', amount: parseNumber(m[1]), remainder: m[2] };
  }

  // Income patterns
  const incomeRe =
    /(?:รายรับ|รับ|ได้)\s*([\d,]+(?:\.\d+)?)\s*(.*)/i;
  m = text.match(incomeRe);
  if (m) {
    return { type: 'income', amount: parseNumber(m[1]), remainder: m[2] };
  }

  // Fallback: just a number → assume expense
  const numRe = /([\d,]+(?:\.\d+)?)\s*(.*)/;
  m = text.match(numRe);
  if (m) {
    return {
      type: 'expense',
      amount: parseNumber(m[1]),
      remainder: m[2],
    };
  }

  return null;
}

function parseNumber(s: string): number {
  return parseFloat(s.replace(/,/g, '')) || 0;
}

interface AccountMatch {
  account: Account;
  confidence: number;
}

/**
 * Fuzzy-match account names from text.
 * Checks name, alias (accountNo), and partial matches.
 */
function matchAccounts(text: string, accounts: Account[]): AccountMatch[] {
  const results: AccountMatch[] = [];

  // Split remainder by "ไป" (transfer direction) or spaces
  const parts = text
    .split(/\s*ไป\s*/)
    .flatMap((p) => p.split(/\s+/))
    .filter(Boolean);

  for (const part of parts) {
    const match = findBestMatch(part, accounts);
    if (match) {
      results.push(match);
    }
  }

  return results;
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

    // Exact
    if (name === lower || accNo === lower) {
      return { account: acc, confidence: 1.0 };
    }

    // Starts with
    if (name.startsWith(lower) || (accNo && accNo.startsWith(lower))) {
      if (!best || best.confidence < 0.8) {
        best = { account: acc, confidence: 0.8 };
      }
      continue;
    }

    // Contains
    if (name.includes(lower) || (accNo && accNo.includes(lower))) {
      if (!best || best.confidence < 0.6) {
        best = { account: acc, confidence: 0.6 };
      }
    }
  }

  return best;
}