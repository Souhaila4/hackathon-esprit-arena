import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
  const comps = await prisma.competition.findMany({
    where: { title: { contains: 'Test' } },
    include: { _count: { select: { checkpoints: true } } }
  });
  console.log(`Found ${comps.length} competitions matching "Test":`);
  comps.forEach(c => {
    console.log(`- ${c.title} (ID: ${c.id}): ${c._count.checkpoints} checkpoints`);
  });
}

check().catch(console.error).finally(() => prisma.$disconnect());
