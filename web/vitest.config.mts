import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // *.db.test.ts need Postgres. Run them with `npm run test:db`.
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
  },
});
