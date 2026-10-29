import { IconChevron } from "@/components/icons";
import { strings } from "../strings.fa";

export function TaskChip() {
  // TODO: Phase 5 links this to the active task.
  return (
    <button
      type="button"
      aria-disabled="true"
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface px-4 text-start"
    >
      <span className="size-2.5 shrink-0 rounded-full bg-[var(--phase)]" />
      <span className="flex-1 text-[15px] font-medium">{strings.taskTitle}</span>
      <IconChevron className="size-5 text-muted rtl:-scale-x-100" />
    </button>
  );
}
