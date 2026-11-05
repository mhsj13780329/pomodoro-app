import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";
import { locales } from "@/i18n/routing";

const revision = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() || crypto.randomUUID();

// Serves the service worker at /serwist/sw.js (next.config.ts rewrites /sw.js to it).
// The segment config exports (dynamic, revalidate...) are left out on purpose: they are
// not allowed with cacheComponents, and the route is static anyway.
const route = createSerwistRoute({
  additionalPrecacheEntries: locales.map((locale) => ({ url: `/${locale}/offline`, revision })),
  swSrc: "src/app/sw.ts",
  // Ambient audio (2+ MB) is cached on first play by the runtime rules instead.
  globIgnores: ["**/audio/**"],
  useNativeEsbuild: true,
});

export const { generateStaticParams, GET } = route;
