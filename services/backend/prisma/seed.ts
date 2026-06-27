import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const tenantId = 'ten_local';
  await prisma.tenant.upsert({
    where: { id: tenantId },
    create: { id: tenantId, name: 'Local Factory Engine', slug: 'local' },
    update: {},
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
