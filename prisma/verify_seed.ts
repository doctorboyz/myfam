import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const userCount = await prisma.user.count()
  const accountCount = await prisma.account.count()
  const categoryGroupCount = await prisma.categoryGroup.count()
  const categoryCount = await prisma.category.count()
  const transactionCount = await prisma.transaction.count()

  console.log('--- Verification Results ---')
  console.log(`Users: ${userCount}`)
  console.log(`Accounts: ${accountCount}`)
  console.log(`Category Groups: ${categoryGroupCount}`)
  console.log(`Categories: ${categoryCount}`)
  console.log(`Transactions: ${transactionCount}`)
  
  // Check specific user transaction counts
  const boyz = await prisma.user.findFirst({ where: { name: { contains: 'Boyz' } }, include: { _count: { select: { transactions: true } } } })
  console.log(`Boyz Transactions: ${boyz?._count.transactions}`)

  const lisha = await prisma.user.findFirst({ where: { name: 'Lisha' }, include: { _count: { select: { transactions: true } } } })
  console.log(`Lisha Transactions: ${lisha?._count.transactions}`)
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect()
  })
