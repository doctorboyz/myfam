require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const p = new PrismaClient({ adapter });

const DOCTORBOYZ_FAMILY = 'de09cbb3-3da1-403c-bd85-e0e1df0b75ec';
const OLD_LITA = '12a4f3b7-66d0-40e9-81d6-c1d5ccb6eb39';
const NEW_LITA = 'eb0c6f63-4b65-4fb9-a5f6-3c910000ba21';
const LITA_FAMILY = '089623cc-e81e-4ee7-a70f-414915e590ae';

(async () => {
  // Step 1: Delete old placeholder Lita (no data)
  console.log('1. Deleting old placeholder Lita...');
  await p.user.delete({ where: { id: OLD_LITA } });
  console.log('   Done.');

  // Step 2: Move 『Lita』♛ to DoctorBoyz family, change role to child, rename to Lita
  console.log('2. Moving 『Lita』♛ to DoctorBoyz family...');
  const updated = await p.user.update({
    where: { id: NEW_LITA },
    data: {
      name: 'Lita',
      role: 'child',
      familyId: DOCTORBOYZ_FAMILY,
    },
  });
  console.log(`   Done: ${updated.name} (${updated.role}) → family ${updated.familyId}`);

  // Step 3: Delete empty family
  console.log('3. Deleting empty 『Lita』♛ Family...');
  await p.family.delete({ where: { id: LITA_FAMILY } });
  console.log('   Done.');

  // Verify
  console.log('\n=== Final State ===');
  const users = await p.user.findMany({
    where: { familyId: DOCTORBOYZ_FAMILY },
    select: { id: true, name: true, role: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const u of users) console.log(`  ${u.name} (${u.role})`);

  const families = await p.family.findMany({ select: { id: true, name: true } });
  console.log(`\nFamilies: ${families.length}`);
  for (const f of families) console.log(`  ${f.name}`);

  await p.$disconnect();
  await pool.end();
  console.log('\nMigration complete.');
})();
