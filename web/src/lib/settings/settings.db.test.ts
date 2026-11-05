// Runs against the real test database (npm run test:db).
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Prisma = typeof import("@/lib/prisma").prisma;
type WriteSettings = typeof import("@/lib/sync/rows").writeSettings;

let prisma: Prisma;
let writeSettings: WriteSettings;

beforeAll(async () => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-1234");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  ({ prisma } = await import("@/lib/prisma"));
  ({ writeSettings } = await import("@/lib/sync/rows"));
});

const userIds: string[] = [];

afterEach(async () => {
  await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
});

afterAll(async () => {
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});

// The row is created with the real clock, so client edit times must be later than that.
const NOW = Date.now();
const DAY = 86_400_000;
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

async function makeUser(data: { proLifetime?: boolean; proUntil?: Date } = {}) {
  const id = `settings-test-${randomUUID()}`;
  userIds.push(id);
  return prisma.user.create({ data: { id, name: "Tester", email: `${id}@example.com`, ...data } });
}

describe("writeSettings Pro gate", () => {
  it("saves the allowed fields of a free user and reports the refused one", async () => {
    const user = await makeUser();
    const state = await writeSettings(user.id, { clientUpdatedAt: at(1000), themeId: "ocean", soundId: "bell" }, NOW);
    expect(state.rejected).toEqual(["themeId"]);
    expect(state.settings.themeId).toBe("warm");
    expect(state.settings.soundId).toBe("bell");
  });

  it("lets a Pro user save everything and round-trips the mix", async () => {
    const user = await makeUser({ proLifetime: true });
    const mix = [{ id: "rain", volume: 0.4 }, { id: "fire", volume: 0.8 }];
    const state = await writeSettings(
      user.id,
      { clientUpdatedAt: at(1000), themeId: "ocean", focusMin: 33, focusSoundId: "bell", ambientMix: mix },
      NOW,
    );
    expect(state.rejected).toBeUndefined();
    expect(state.settings.themeId).toBe("ocean");
    expect(state.settings.focusMin).toBe(33);
    expect(state.settings.focusSoundId).toBe("bell");
    expect(state.settings.ambientMix).toEqual(mix);
  });

  it("keeps stored Pro values after Pro expires and lets the user clear them", async () => {
    const user = await makeUser({ proUntil: new Date(NOW + DAY) });
    const mix = [{ id: "rain", volume: 0.4 }];
    await writeSettings(user.id, { clientUpdatedAt: at(1000), themeId: "dusk", focusSoundId: "bell", ambientMix: mix }, NOW);

    const later = NOW + 10 * DAY;
    const kept = await writeSettings(user.id, { clientUpdatedAt: at(2000), soundId: "soft" }, later);
    expect(kept.rejected).toBeUndefined();
    expect(kept.settings.themeId).toBe("dusk");
    expect(kept.settings.ambientMix).toEqual(mix);

    const refused = await writeSettings(user.id, { clientUpdatedAt: at(3000), themeId: "rose", focusSoundId: "digital" }, later);
    expect([...(refused.rejected ?? [])].sort()).toEqual(["focusSoundId", "themeId"]);
    expect(refused.settings.themeId).toBe("dusk");
    expect(refused.settings.focusSoundId).toBe("bell");

    const cleared = await writeSettings(user.id, { clientUpdatedAt: at(4000), focusSoundId: null, ambientMix: null, themeId: "warm" }, later);
    expect(cleared.rejected).toBeUndefined();
    expect(cleared.settings.focusSoundId).toBeNull();
    expect(cleared.settings.ambientMix).toBeNull();
    expect(cleared.settings.themeId).toBe("warm");
  });
});
