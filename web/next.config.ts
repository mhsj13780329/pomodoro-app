import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // The Playwright server sets this so it can run beside `npm run dev`.
  // Next allows only one dev server per build folder.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  cacheComponents: true,
  // Prisma's generated client loads a query-compiler wasm that should not be bundled.
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  partialPrefetching: true,
  // The service worker is built by app/serwist/[path]/route.ts; the browser asks for /sw.js.
  async rewrites() {
    return [{ source: "/sw.js", destination: "/serwist/sw.js" }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withSerwist(withNextIntl(nextConfig));
