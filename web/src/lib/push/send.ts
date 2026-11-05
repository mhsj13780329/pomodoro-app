import webpush from "web-push";
import { prisma } from "@/lib/prisma";
import { env } from "@/lib/env";
import type { PushPayload } from "./payload";

let configured = false;

export function pushEnabled(): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT);
}

function configure(): void {
  if (configured) return;
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  configured = true;
}

/** Sends to every subscription of the user. 404/410 means the browser dropped it: delete the row. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!pushEnabled()) return;
  configure();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
          { TTL: 60, urgency: "high" },
        );
        await prisma.pushSubscription.update({ where: { id: sub.id }, data: { lastSuccessAt: new Date() } });
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.deleteMany({ where: { id: sub.id } });
        } else {
          console.error("push send failed", status ?? error);
        }
      }
    }),
  );
}
