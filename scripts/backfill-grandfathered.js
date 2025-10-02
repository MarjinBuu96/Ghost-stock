// scripts/backfill-grandfathered.js
require("dotenv/config"); // loads .env so DATABASE_URL is available
const { prisma } = require("../src/lib/prisma"); // adjust if your prisma client path differs

const LIMIT = Number(process.env.STARTER_GRANDFATHER_LIMIT || 20);

async function main() {
  const candidates = await prisma.store.findMany({
    where: { accessToken: { not: null } },
    orderBy: { createdAt: "asc" },
    take: LIMIT,
    select: { id: true, shop: true, grandfathered: true },
  });

  if (!candidates.length) {
    console.log("No installed stores found to grandfather.");
    return;
  }

  const updates = candidates
    .filter((s) => !s.grandfathered)
    .map((s) =>
      prisma.store.update({
        where: { id: s.id },
        data: { grandfathered: true },
      })
    );

  if (updates.length === 0) {
    console.log("All earliest stores already grandfathered. Nothing to do.");
    return;
  }

  await prisma.$transaction(updates);
  console.log(`Grandfathered ${updates.length}/${candidates.length} earliest installed stores.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
