import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js keeps secrets in .env.local. Prisma's default dotenv load only reads .env.
config({ path: ".env.local" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.mts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
