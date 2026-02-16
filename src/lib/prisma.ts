import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Pool } from 'pg'

const connectionString = process.env.DATABASE_URL!

const globalForPrisma = global as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  if (process.env.VERCEL) {
    const adapter = new PrismaNeon({ connectionString })
    return new PrismaClient({ adapter })
  }
  const pool = new Pool({ connectionString })
  const adapter = new PrismaPg(pool)
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma || createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
