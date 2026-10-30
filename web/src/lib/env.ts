import { z } from "zod";

// One place reads process.env so a missing secret fails at startup
// instead of halfway through a login request.
// This file is not marked `server-only`: the Better Auth CLI loads it in
// plain Node when it generates the schema. Do not import it from client components.
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url(),
});

export const env = schema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
});
