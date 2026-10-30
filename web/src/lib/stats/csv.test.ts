import { describe, expect, it } from "vitest";
import { csvField, sessionsToCsv, type CsvLabels } from "./csv";

const labels: CsvLabels = {
  date: "Date",
  start: "Start",
  end: "End",
  minutes: "Minutes",
  task: "Task",
  project: "Project",
  noTask: "No task",
  noProject: "No project",
  deleted: "deleted",
};

describe("sessionsToCsv", () => {
  it("starts with a UTF-8 BOM and keeps Persian in a quoted field", () => {
    const csv = sessionsToCsv(
      [
        {
          startedAt: new Date("2026-10-30T08:00:00.000Z"),
          endedAt: new Date("2026-10-30T08:25:00.000Z"),
          durationSec: 25 * 60,
          taskTitle: "خواندن",
          taskDeleted: true,
          projectName: null,
          projectDeleted: false,
        },
      ],
      labels,
      "en",
      "Asia/Tehran",
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Date,Start,End,Minutes,Task,Project,startedAt,endedAt");
    expect(csv).toContain("خواندن (deleted)");
    expect(csv).toContain("No project");
    expect(csv).toContain(",25,");
    expect(csv).toContain("2026-10-30T08:00:00.000Z");
    expect(csv).toContain("2026-10-30T08:25:00.000Z");
  });

  it("quotes a date that contains a comma and neutralises a formula", () => {
    expect(csvField("October 30, 2026")).toBe('"October 30, 2026"');
    expect(csvField("=2+2")).toBe("'=2+2");
  });
});
