import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { guardSync, readJson } from "@/lib/sync/http";

const subscribeSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: z.string().min(1).max(256), auth: z.string().min(1).max(256) }),
});

const unsubscribeSchema = z.object({ endpoint: z.url().max(2048) });

export async function POST(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;
  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = subscribeSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const { endpoint, keys } = parsed.data;
  const userAgent = request.headers.get("user-agent")?.slice(0, 255) ?? null;
  // The same browser may switch accounts: the endpoint moves to whoever is signed in now.
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: guard.userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: guard.userId, p256dh: keys.p256dh, auth: keys.auth, userAgent },
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const guard = await guardSync();
  if (guard instanceof Response) return guard;
  const json = await readJson(request);
  if (json instanceof Response) return json;
  const parsed = unsubscribeSchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: guard.userId },
  });
  return Response.json({ ok: true });
}
