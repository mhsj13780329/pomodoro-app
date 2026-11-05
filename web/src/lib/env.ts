import { z } from "zod";

// One place reads process.env so a missing secret fails at startup
// instead of halfway through a login request.
// This file is not marked `server-only`: the Better Auth CLI loads it in
// plain Node when it generates the schema. Do not import it from client components.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
  // Web Push. All three are optional: without them push is simply off.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  VAPID_SUBJECT: z.string().min(1).optional(),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || undefined,
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
  VAPID_SUBJECT: process.env.VAPID_SUBJECT || undefined,
});
