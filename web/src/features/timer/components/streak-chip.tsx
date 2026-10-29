import Link from "next/link";
import { IconFlame } from "@/components/icons";
import { strings } from "../strings.fa";

export function StreakChip() {
  // TODO: Phase 6 fills this with the real streak.
  return (
    <Link
      href="/stats"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-focus-soft px-3.5 text-sm font-semibold text-focus-ink"
    >
      <IconFlame className="size-[18px]" />
      <span>{strings.streak}</span>
    </Link>
  );
}
