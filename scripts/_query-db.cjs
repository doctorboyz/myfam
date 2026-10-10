require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

(async () => {
  // Check both Lita users
  const litaOld = '12a4f3b7-66d0-40e9-81d6-c1d5ccb6eb39';
  const litaNew = 'eb0c6f63-4b65-4fb9-a5f6-3c910000ba21';
  
  for (const uid of [litaOld, litaNew]) {
    const user = await p.user.findUnique({ where: { id: uid }, select: { id: true, name: true, role: true, familyId: true, createdAt: true } });
    console.log(`\n=== User: ${user.name} (${user.role}) ===`);
    const accts = await p.account.count({ where: { ownerId: uid } });
    const txs = await p.transaction.count({ where: { createdById: uid } });
    console.log(`  Accounts: ${accts}, Transactions: ${txs}`);
  }

  // Check empty family
  console.log('\n=== 『Lita』♛ Family ===');
  const litaFamId = '089623cc-e81e-4ee7-a70f-414915e590ae';
  const famMembers = await p.user.count({ where: { familyId: litaFamId } });
  console.log(`  Members: ${famMembers}`);

  await p.$disconnect();
  await pool.end();
})();
