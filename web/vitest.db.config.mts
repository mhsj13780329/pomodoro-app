import path from "node:path";
import { defineConfig } from "vitest/config";

// Tests that run against a real Postgres: the pomodoro_test database on the docker-compose
// server (port 5433). Create it once with `CREATE DATABASE pomodoro_test`, then
// `DATABASE_URL=… npx prisma migrate deploy`. Files run one at a time because they share it.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgresql://pomodoro:pomodoro@localhost:5433/pomodoro_test",
    },
  },
});
