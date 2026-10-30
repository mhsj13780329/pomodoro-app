import { describe, expect, it } from "vitest";
import { classifySessionBatch, type SessionBatch } from "./sessions";
import type { SessionInput } from "./contract";

const now = Date.parse("2026-10-30T06:00:00.000Z");

function session(partial: Partial<SessionInput> & { id: string }): SessionInput {
  return {
    phase: "focus",
    startedAt: "2026-10-30T05:00:00.000Z",
    endedAt: "2026-10-30T05:25:00.000Z",
    durationSec: 25 * 60,
    plannedSec: 25 * 60,
    completed: true,
    taskId: null,
    ...partial,
  };
}

function ids(batch: SessionBatch) {
  return {
    accepted: batch.accepted,
    existing: batch.existing,
    rejected: batch.rejected,
  };
}

describe("session batch", () => {
  it("accepts a new focus and treats a known id as already stored", () => {
    const batch = classifySessionBatch(
      [session({ id: "11111111-1111-4111-8111-111111111111" }), session({ id: "22222222-2222-4222-8222-222222222222" })],
      new Set(["22222222-2222-4222-8222-222222222222"]),
      new Set(),
      now,
    );
    expect(ids(batch)).toEqual({
      accepted: ["11111111-1111-4111-8111-111111111111"],
      existing: ["22222222-2222-4222-8222-222222222222"],
      rejected: [],
    });
    expect(batch.insert).toHaveLength(1);
  });

  it("rejects a future start, a duration past the slack, and someone else's id", () => {
    const batch = classifySessionBatch(
      [
        session({
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          startedAt: "2026-10-30T06:02:00.000Z",
        }),
        session({
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          durationSec: 25 * 60 + 61,
        }),
        session({ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
      ],
      new Set(),
      new Set(["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]),
      now,
    );
    expect(ids(batch)).toEqual({
      accepted: [],
      existing: [],
      rejected: [
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ],
    });
  });

  it("counts a repeated id in one batch as already stored", () => {
    const id = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const batch = classifySessionBatch([session({ id }), session({ id })], new Set(), new Set(), now);
    expect(ids(batch)).toEqual({ accepted: [id], existing: [id], rejected: [] });
  });

  it("allows a start up to a minute ahead and a duration up to a minute over planned", () => {
    const batch = classifySessionBatch(
      [
        session({
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          startedAt: new Date(now + 60_000).toISOString(),
          endedAt: new Date(now + 120_000).toISOString(),
          durationSec: 25 * 60 + 60,
        }),
      ],
      new Set(),
      new Set(),
      now,
    );
    expect(batch.accepted).toEqual(["eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"]);
  });
});
