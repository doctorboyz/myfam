import { prisma } from './src/lib/prisma';
import bcrypt from 'bcryptjs';

async function setPasswords() {
  const hash = await bcrypt.hash('4444', 10);
  const result = await prisma.user.updateMany({ 
    where: { password: null },
    data: { password: hash } 
  });
  console.log(`Updated ${result.count} users with default password '4444'`);
  process.exit(0);
}

setPasswords();
