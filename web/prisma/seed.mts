import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

config({ path: ".env.local" });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

async function main() {
  // A row to look at in Prisma Studio. It has no Settings row on purpose:
  // the first real OTP sign-up should still count as "no server data yet."
  await prisma.user.upsert({
    where: { email: "dev@example.com" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: "Dev",
      email: "dev@example.com",
      emailVerified: true,
      locale: "fa",
      timezone: "Asia/Tehran",
      proLifetime: false,
    },
  });
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
