import "server-only";
import { headers } from "next/headers";
import { auth } from "./auth";

/** The signed-in user, or null when the browser is still a guest. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return session?.user ?? null;
}
