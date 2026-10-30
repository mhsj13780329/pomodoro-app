import { z } from "zod";
import { decideImport } from "@/features/auth/import-merge";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";

const settingsSchema = z.object({
  focusMin: z.number().int().min(1).max(24 * 60),
  shortBreakMin: z.number().int().min(1).max(24 * 60),
  longBreakMin: z.number().int().min(1).max(24 * 60),
  longBreakEvery: z.number().int().min(1).max(20),
  autoStartFocus: z.boolean(),
  autoStartShortBreak: z.boolean(),
  autoStartLongBreak: z.boolean(),
  themeId: z.enum(["warm", "night", "forest"]),
});

const sessionSchema = z.object({
  id: z.uuid(),
  phase: z.enum(["FOCUS", "SHORT_BREAK", "LONG_BREAK"]),
  startedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  endedAt: z.string().refine((value) => !Number.isNaN(Date.parse(value))),
  durationSec: z.number().int().positive().max(24 * 60 * 60),
  completed: z.boolean(),
});

const bodySchema = z.object({
  settings: settingsSchema,
  sessions: z.array(sessionSchema).max(200),
});

export async function POST(request: Request) {
  // The cookie session is the only proof of who is uploading.
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return Response.json({ error: "invalid" }, { status: 400 });

  const known = await prisma.focusSession.findMany({
    where: { userId: user.id, id: { in: parsed.data.sessions.map((session) => session.id) } },
    select: { id: true },
  });
  const existingSettings = await prisma.settings.findUnique({
    where: { userId: user.id },
    select: { userId: true },
  });
  const decision = decideImport(
    {
      hasSettings: existingSettings != null,
      sessionIds: new Set(known.map((session) => session.id)),
    },
    parsed.data,
  );

  await prisma.$transaction(async (tx) => {
    if (decision.settings) {
      // Check again inside the transaction so a retry does not overwrite
      // settings another request just created.
      const row = await tx.settings.findUnique({
        where: { userId: user.id },
        select: { userId: true },
      });
      if (!row) {
        await tx.settings.create({
          data: {
            userId: user.id,
            ...decision.settings,
          },
        });
      }
    }
    if (decision.sessions.length > 0) {
      await tx.focusSession.createMany({
        data: decision.sessions.map((session) => ({
          id: session.id,
          userId: user.id,
          phase: session.phase,
          startedAt: new Date(session.startedAt),
          endedAt: new Date(session.endedAt),
          durationSec: session.durationSec,
          completed: session.completed,
        })),
        skipDuplicates: true,
      });
    }
  });

  return Response.json({
    ok: true,
    importedSettings: decision.settings != null,
    importedSessions: decision.sessions.length,
  });
}
