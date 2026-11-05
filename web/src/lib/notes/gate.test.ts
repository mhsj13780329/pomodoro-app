import { describe, expect, it } from "vitest";
import { decideNoteWrite, type GateNote } from "./gate";

const note = (patch: Partial<GateNote> = {}): GateNote => ({
  title: "t",
  body: "b",
  updatedAt: "2026-11-01T10:00:00.000Z",
  deletedAt: null,
  ...patch,
});
const later = { updatedAt: "2026-11-01T11:00:00.000Z" };

describe("decideNoteWrite", () => {
  it("lets Pro create and edit", () => {
    expect(decideNoteWrite(null, note(), { pro: true })).toBe("insert");
    expect(decideNoteWrite(note(), note({ ...later, body: "x" }), { pro: true })).toBe("update");
  });

  it("stops a free account creating or editing", () => {
    expect(decideNoteWrite(null, note(), { pro: false })).toBe("pro_required");
    expect(decideNoteWrite(note(), note({ ...later, body: "x" }), { pro: false })).toBe("pro_required");
  });

  it("always lets a note be deleted", () => {
    const del = note({ ...later, deletedAt: "2026-11-01T11:00:00.000Z" });
    expect(decideNoteWrite(note(), del, { pro: false })).toBe("delete");
    expect(decideNoteWrite(note(), del, { pro: true })).toBe("delete");
  });

  it("ignores an older or equal write", () => {
    expect(decideNoteWrite(note(), note({ updatedAt: "2026-11-01T09:00:00.000Z" }), { pro: true })).toBe("stale");
    expect(decideNoteWrite(note(), note(), { pro: true })).toBe("stale");
    expect(decideNoteWrite(note(), note({ deletedAt: "2026-11-01T10:00:00.000Z" }), { pro: false })).toBe("stale");
  });

  it("keeps a deleted note deleted", () => {
    const gone = note({ deletedAt: "2026-11-01T10:30:00.000Z" });
    expect(decideNoteWrite(gone, note({ updatedAt: "2026-11-02T10:00:00.000Z" }), { pro: true })).toBe("stale");
  });
});
