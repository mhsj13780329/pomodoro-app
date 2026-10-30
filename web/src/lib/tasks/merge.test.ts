import { describe, expect, it } from "vitest";
import { adoptRows, decideLww, type Stamped } from "./merge";

function row(id: string, updatedAt: string, deletedAt: string | null = null): Stamped & { title: string } {
  return { id, updatedAt, deletedAt, title: `${id}@${updatedAt}` };
}

const T10 = "2026-10-30T10:00:00.000Z";
const T11 = "2026-10-30T11:00:00.000Z";
const T12 = "2026-10-30T12:00:00.000Z";

describe("decideLww", () => {
  it("inserts an id the server has not seen", () => {
    expect(decideLww(null, row("a", T10))).toBe("insert");
  });

  it("updates when the incoming edit is newer", () => {
    expect(decideLww(row("a", T10), row("a", T11))).toBe("update");
  });

  it("ignores an older edit, so a slow save cannot win", () => {
    expect(decideLww(row("a", T11), row("a", T10))).toBe("stale");
  });

  it("treats the same stamp as a retry, not a new write", () => {
    expect(decideLww(row("a", T10), row("a", T10))).toBe("stale");
  });

  it("keeps a delete: a later edit cannot bring the row back", () => {
    expect(decideLww(row("a", T10, T10), row("a", T12))).toBe("stale");
  });

  it("applies a delete that is newer than the stored edit", () => {
    expect(decideLww(row("a", T10), row("a", T11, T11))).toBe("update");
  });
});

describe("adoptRows", () => {
  const none = new Set<string>();

  it("adds and replaces rows from the server", () => {
    const next = adoptRows({ a: row("a", T10) }, [row("a", T11), row("b", T11)], none, false);
    expect(next.a?.updatedAt).toBe(T11);
    expect(next.b?.updatedAt).toBe(T11);
  });

  it("removes a row the server says is deleted", () => {
    const next = adoptRows({ a: row("a", T10) }, [row("a", T11, T11)], none, false);
    expect(next).toEqual({});
  });

  it("keeps a local row that still has a write waiting", () => {
    const local = { a: row("a", T12) };
    const next = adoptRows(local, [row("a", T10)], new Set(["a"]), false);
    expect(next.a?.updatedAt).toBe(T12);
  });

  it("keeps a waiting local delete from being undone by an older server row", () => {
    const next = adoptRows({}, [row("a", T10)], new Set(["a"]), false);
    expect(next).toEqual({});
  });

  it("drops local rows missing from a full set, except waiting ones", () => {
    const local = { a: row("a", T10), b: row("b", T10), c: row("c", T10) };
    const next = adoptRows(local, [row("a", T10)], new Set(["c"]), true);
    expect(Object.keys(next).sort()).toEqual(["a", "c"]);
  });

  it("leaves local rows alone on a partial set", () => {
    const next = adoptRows({ a: row("a", T10), b: row("b", T10) }, [], none, false);
    expect(Object.keys(next).sort()).toEqual(["a", "b"]);
  });

  it("does not change the input", () => {
    const local = { a: row("a", T10) };
    adoptRows(local, [row("a", T11, T11)], none, true);
    expect(Object.keys(local)).toEqual(["a"]);
  });
});
