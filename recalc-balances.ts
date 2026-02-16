import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL

const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function recalcBalances() {
  console.log('Recalculating account balances...')

  const allAccounts = await prisma.account.findMany({
    include: { owner: { select: { name: true } } },
  })

  for (const account of allAccounts) {
    const outgoing = await prisma.transaction.findMany({
      where: { accountId: account.id, status: 'completed' },
    })

    const incoming = await prisma.transaction.findMany({
      where: { toAccountId: account.id, status: 'completed' },
    })

    let balance = 0

    for (const tx of outgoing) {
      const amount = Number(tx.amount)
      const fee = tx.fee ? Number(tx.fee) : 0

      if (tx.type === 'income') {
        balance += amount - fee
      } else {
        balance -= amount + fee
      }
    }

    for (const tx of incoming) {
      balance += Number(tx.amount)
    }

    await prisma.account.update({
      where: { id: account.id },
      data: { balance },
    })

    const txCount = outgoing.length + incoming.length
    console.log(`  [${account.owner.name}] ${account.name}: ${balance.toFixed(2)} (${txCount} txns)`)
  }

  console.log('Done.')
  process.exit(0)
}

recalcBalances().catch((e) => {
  console.error(e)
  process.exit(1)
})
