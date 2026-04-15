import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'admin@test.com';
    const password = 'admin';
    const passwordHash = await bcrypt.hash(password, 12);

    const existingAdmin = await prisma.user.findUnique({
        where: { email },
    });

    if (existingAdmin) {
        await prisma.user.update({
            where: { email },
            data: {
                role: UserRole.ADMIN,
                passwordHash,
                isEmailVerified: true,
            },
        });
        console.log(`\n✅ Le compte admin existant a été mis à jour.`);
    } else {
        await prisma.user.create({
            data: {
                email,
                passwordHash,
                firstName: 'Super',
                lastName: 'Admin',
                role: UserRole.ADMIN,
                isEmailVerified: true,
            },
        });
        console.log(`\n✅ Nouveau compte admin créé avec succès.`);
    }

    console.log(`\n======================================`);
    console.log(`🔑 IDENTIFIANTS ADMIN`);
    console.log(`Email    : ${email}`);
    console.log(`Password : ${password}`);
    console.log(`Role     : ADMIN`);
    console.log(`======================================\n`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
