/**
 * Display name resolver with many-to-many alias support.
 *
 * Rules:
 * - Viewing yourself → your LINE display name (LineLink.displayName) or User.name
 * - Viewing others → alias set by viewer, fallback to User.name
 */

import { prisma } from './prisma';

type UserWithLineLink = {
  id: string;
  name: string;
  lineLink?: { displayName: string | null } | null;
};

/**
 * Resolve the display name for `targetUser` as seen by `viewerId`.
 */
export async function resolveDisplayName(
  viewerId: string,
  targetUser: UserWithLineLink,
): Promise<string> {
  // Viewing yourself: prefer LINE display name
  if (viewerId === targetUser.id) {
    return targetUser.lineLink?.displayName ?? targetUser.name;
  }

  // Viewing others: check alias set by viewer
  const alias = await prisma.userAlias.findUnique({
    where: { ownerId_targetId: { ownerId: viewerId, targetId: targetUser.id } },
  });

  return alias?.alias ?? targetUser.name;
}

/**
 * Batch resolve display names for multiple users.
 * Returns a Map<userId, displayName>.
 */
export async function resolveDisplayNames(
  viewerId: string,
  users: UserWithLineLink[],
): Promise<Map<string, string>> {
  const targetIds = users.map((u) => u.id);

  const aliases = await prisma.userAlias.findMany({
    where: { ownerId: viewerId, targetId: { in: targetIds } },
  });

  const aliasMap = new Map(aliases.map((a) => [a.targetId, a.alias]));

  const result = new Map<string, string>();
  for (const user of users) {
    if (user.id === viewerId) {
      result.set(user.id, user.lineLink?.displayName ?? user.name);
    } else {
      result.set(user.id, aliasMap.get(user.id) ?? user.name);
    }
  }

  return result;
}
