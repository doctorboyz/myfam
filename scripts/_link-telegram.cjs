// Bind family Telegram IDs directly to myfam users (bypasses /start code).
// Usage: DATABASE_URL='postgresql://myfam:<pw>@localhost:5433/myfam' node scripts/_link-telegram.cjs
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const MAPPINGS = [
  { telegramUserId: '8644874774', name: 'Tukkie', userName: '🥰Tukky🥰' },
  { telegramUserId: '8705040053', name: 'Boyz', userName: 'boyz' },
  { telegramUserId: '8319586668', name: 'Lisha', userName: 'Lisha' },
  { telegramUserId: '8780951704', name: 'Lita', userName: 'Lita' },
];

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

(async () => {
  for (const m of MAPPINGS) {
    // resolve the myfam user by name (unique enough per family in this dataset)
    const user = await p.user.findFirst({
      where: { name: m.userName },
      select: { id: true, name: true, role: true },
    });
    if (!user) { console.log(`✗ ${m.name}: no myfam user named "${m.userName}"`); continue; }

    // conflict checks — same rules as bindTelegramUser
    const tgTaken = await p.telegramLink.findUnique({ where: { telegramUserId: m.telegramUserId } });
    if (tgTaken && tgTaken.userId !== user.id) {
      console.log(`✗ ${m.name}: TG ${m.telegramUserId} already linked to user ${tgTaken.userId}`);
      continue;
    }
    const userTaken = await p.telegramLink.findUnique({ where: { userId: user.id } });
    if (userTaken && userTaken.telegramUserId !== m.telegramUserId) {
      console.log(`✗ ${m.name}: user already linked to TG ${userTaken.telegramUserId}`);
      continue;
    }

    await p.telegramLink.upsert({
      where: { telegramUserId: m.telegramUserId },
      create: { telegramUserId: m.telegramUserId, userId: user.id, displayName: m.name },
      update: { userId: user.id, displayName: m.name },
    });
    console.log(`✓ ${m.name} (${user.role}) → TG ${m.telegramUserId} → myfam ${user.id}`);
  }
  await p.$disconnect();
  await pool.end();
})();