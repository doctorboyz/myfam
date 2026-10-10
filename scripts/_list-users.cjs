// List all myfam users + existing telegram links (read-only)
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

(async () => {
  const users = await p.user.findMany({
    select: {
      id: true, name: true, displayName: true, role: true, familyId: true,
      telegramLink: { select: { telegramUserId: true, displayName: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  for (const u of users) {
    console.log(`${u.name.padEnd(12)} ${u.role.padEnd(8)} fam=${u.familyId?.slice(0, 8)} id=${u.id}`);
    console.log(`  display: ${u.displayName ?? '-'}  tg: ${u.telegramLink ? `${u.telegramLink.telegramUserId} (${u.telegramLink.displayName ?? '-'})` : 'not linked'}`);
  }
  await p.$disconnect();
  await pool.end();
})();