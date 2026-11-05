import { describe, expect, it } from "vitest";
import type { NoteWire } from "./contract";
import { adoptNotes, settleNotes } from "./settle";

const ID = "11111111-1111-4111-8111-111111111111";
const n = (patch: Partial<NoteWire> = {}): NoteWire => ({
  id: ID,
  title: "t",
  body: "b",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  deletedAt: null,
  ...patch,
});
const result = (status: "ok" | "stale" | "pro_required", rows: NoteWire[] = []) => ({
  serverNow: 1,
  results: [{ id: ID, status }],
  rows,
  pro: true,
});

describe("settleNotes", () => {
  it("clears an applied row from the queue", () => {
    const row = n();
    const out = settleNotes({ notes: { [ID]: row }, queue: { [ID]: row } }, { notes: [row] }, result("ok"));
    expect(out.queue).toEqual({});
    expect(out.notes[ID]).toEqual(row);
  });

  it("adopts the server version after stale or pro_required", () => {
    const mine = n({ body: "mine" });
    const theirs = n({ body: "theirs", updatedAt: "2026-11-01T11:00:00.000Z" });
    const out = settleNotes({ notes: { [ID]: mine }, queue: { [ID]: mine } }, { notes: [mine] }, result("stale", [theirs]));
    expect(out.notes[ID]).toEqual(theirs);
    expect(out.queue).toEqual({});
  });

  it("keeps an edit made while the request was in flight", () => {
    const sent = n();
    const newer = n({ body: "newer", updatedAt: "2026-11-01T10:05:00.000Z" });
    const out = settleNotes({ notes: { [ID]: newer }, queue: { [ID]: newer } }, { notes: [sent] }, result("ok"));
    expect(out.queue[ID]).toEqual(newer);
  });

  it("drops a note the server does not have", () => {
    const row = n();
    const out = settleNotes({ notes: { [ID]: row }, queue: { [ID]: row } }, { notes: [row] }, result("pro_required"));
    expect(out.notes).toEqual({});
  });
});

describe("adoptNotes", () => {
  it("keeps queued rows, removes deleted ones, and drops unlisted rows on a full pull", () => {
    const queued = n({ body: "local" });
    const other = n({ id: "22222222-2222-4222-8222-222222222222" });
    const local = { notes: { [ID]: queued, [other.id]: other }, queue: { [ID]: queued } };
    expect(adoptNotes(local, [n({ body: "server" })], false)[ID].body).toBe("local");
    expect(adoptNotes(local, [{ ...other, deletedAt: "2026-11-02T00:00:00.000Z" }], false)[other.id]).toBeUndefined();
    expect(Object.keys(adoptNotes(local, [], true))).toEqual([ID]);
  });
});
