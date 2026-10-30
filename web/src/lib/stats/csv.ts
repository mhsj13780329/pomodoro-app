// CSV of focus sessions for Excel. A leading BOM makes Excel read the file as
// UTF-8, which is what keeps Persian letters intact. Minutes stay plain digits
// so a spreadsheet can add them up; the ISO columns are for machines.

import { dateLocale, formatDate } from "@/lib/format";

export type CsvLabels = {
  date: string;
  start: string;
  end: string;
  minutes: string;
  task: string;
  project: string;
  noTask: string;
  noProject: string;
  deleted: string;
};

export type CsvSession = {
  startedAt: Date;
  endedAt: Date;
  durationSec: number;
  taskTitle: string | null;
  taskDeleted: boolean;
  projectName: string | null;
  projectDeleted: boolean;
};

function wallTime(date: Date, locale: string, timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
}

/** Quote anything Excel or a comma would misread, including a formula like =CMD. */
export function csvField(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  if (/[",\n\r]/.test(guarded)) return `"${guarded.replaceAll('"', '""')}"`;
  return guarded;
}

function named(title: string | null, deleted: boolean, empty: string, deletedWord: string): string {
  if (!title) return empty;
  return deleted ? `${title} (${deletedWord})` : title;
}

export function sessionsToCsv(
  sessions: readonly CsvSession[],
  labels: CsvLabels,
  locale: string,
  timeZone: string,
): string {
  const header = [
    labels.date,
    labels.start,
    labels.end,
    labels.minutes,
    labels.task,
    labels.project,
    "startedAt",
    "endedAt",
  ].map(csvField);
  const lines = [header.join(",")];
  const ordered = [...sessions].sort((a, b) => a.endedAt.getTime() - b.endedAt.getTime());
  for (const session of ordered) {
    lines.push(
      [
        csvField(formatDate(session.endedAt, locale, timeZone)),
        csvField(wallTime(session.startedAt, locale, timeZone)),
        csvField(wallTime(session.endedAt, locale, timeZone)),
        String(Math.round(session.durationSec / 60)),
        csvField(named(session.taskTitle, session.taskDeleted, labels.noTask, labels.deleted)),
        csvField(named(session.projectName, session.projectDeleted, labels.noProject, labels.deleted)),
        session.startedAt.toISOString(),
        session.endedAt.toISOString(),
      ].join(","),
    );
  }
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
