/**
 * Fuzzy matching for accounts and categories from free Thai text.
 */

import { prisma } from '@/lib/prisma';

export interface AccountLike {
  id: string;
  name: string;
  alias?: string | null;
}

/** Fuzzy-match an account by AI-extracted accountName. */
export function matchAccountByName(
  accounts: AccountLike[],
  accountName: string,
): AccountLike | null {
  const searchName = accountName.toLowerCase().trim();
  return (
    accounts.find(
      (a) =>
        a.name.toLowerCase().includes(searchName) ||
        searchName.includes(a.name.toLowerCase()) ||
        (a.alias && (a.alias.toLowerCase().includes(searchName) || searchName.includes(a.alias.toLowerCase()))),
    ) ?? null
  );
}

/**
 * Match an account from raw text (reconcile flow): exact name → exact alias → contains.
 * Returns the account row from the DB, owned by the user.
 */
export async function matchAccountByText(
  text: string,
  userId: string,
): Promise<{ id: string; name: string; alias: string | null; balance: { toString(): string } } | null> {
  const accounts = await prisma.account.findMany({
    where: { ownerId: userId, status: 'active' },
    orderBy: { createdAt: 'asc' },
  });
  if (accounts.length === 0) return null;

  const q = text.toLowerCase().trim();

  // Exact name / alias match
  let match = accounts.find(
    (a) => a.name.toLowerCase() === q || (a.alias && a.alias.toLowerCase() === q),
  );

  // Contains match
  if (!match) {
    match = accounts.find(
      (a) => a.name.toLowerCase().includes(q) || q.includes(a.name.toLowerCase()),
    );
  }

  return match ?? null;
}

/** Display string for keyboards: "name" or "name(alias)". */
export function accountDisplay(a: { name: string; alias?: string | null }): string {
  return a.alias ? `${a.name}(${a.alias})` : a.name;
}

/** Resolve a keyboard display string back to an account (name or name(alias)). */
export async function findAccountByDisplay(
  display: string,
  userId: string,
): Promise<{ id: string; name: string; alias: string | null } | null> {
  const name = display.replace(/\([^)]*\)$/, '').trim();
  return prisma.account.findFirst({
    where: {
      ownerId: userId,
      status: 'active',
      OR: [{ name }, { alias: display }],
    },
  });
}