import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const ADMIN_EMAIL = 'admin@admin.com';
const ADMIN_PASSWORD = 'admin';
const SALT_ROUNDS = 12;

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);
  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: {
      role: UserRole.ADMIN,
      isEmailVerified: true,
      passwordHash,
    },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'Admin',
      lastName: 'Arena',
      role: UserRole.ADMIN,
      isEmailVerified: true,
      skillTags: [],
    },
  });
  console.log('Admin user ready:', admin.email, '| role:', admin.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
