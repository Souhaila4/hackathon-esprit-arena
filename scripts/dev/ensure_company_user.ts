import { PrismaClient, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
    const email = 'negzaouioussama15@gmail.com';
    const password = '12345678';
    const passwordHash = await bcrypt.hash(password, 12);

    const existingUser = await prisma.user.findUnique({
        where: { email },
    });

    if (existingUser) {
        await prisma.user.update({
            where: { email },
            data: {
                role: UserRole.COMPANY,
                passwordHash,
                isEmailVerified: true,
            },
        });
        console.log(`\n✅ Le compte COMPANY existant a été mis à jour.`);
    } else {
        await prisma.user.create({
            data: {
                email,
                passwordHash,
                firstName: 'Negzaoui',
                lastName: 'Oussama',
                role: UserRole.COMPANY,
                isEmailVerified: true,
            },
        });
        console.log(`\n✅ Nouveau compte COMPANY créé avec succès.`);
    }

    console.log(`\n======================================`);
    console.log(`📧 COMPTE COMPANY`);
    console.log(`Email    : ${email}`);
    console.log(`Password : ${password}`);
    console.log(`Role     : COMPANY`);
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
