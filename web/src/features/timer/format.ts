import type { Phase } from "./logic";
import { strings } from "./strings.fa";

const padded = new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2 });
const plain = new Intl.NumberFormat("fa-IR");

/** Clock digits in Persian numerals. The caller renders this inside dir="ltr". */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${padded.format(minutes)}:${padded.format(seconds)}`;
}

export function formatSession(current: number, total: number): string {
  return `${strings.session} ${plain.format(current)} ${strings.of} ${plain.format(total)}`;
}

export function phaseLabel(phase: Phase): string {
  return strings.phases[phase];
}
