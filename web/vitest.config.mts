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
    // Component tests (*.test.tsx) opt into jsdom with a `@vitest-environment jsdom` comment.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["src/test/setup.ts"],
    // *.db.test.ts need Postgres. Run them with `npm run test:db`.
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
  },
});
