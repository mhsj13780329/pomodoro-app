"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { IconChevron } from "@/components/icons";
import { useTasksView } from "@/features/tasks/use-tasks-view";
import { TaskPicker } from "@/features/tasks/components/task-picker";

/** Phone: the chip under the ring. It shows which task this session is for and opens the picker. */
export function TaskChip() {
  const t = useTranslations("tasks");
  const { current } = useTasksView();
  const [open, setOpen] = useState(false);
  const label = current?.title ?? t("none");

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-label={t("chipLabel", { title: label })}
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 rounded-control border border-line bg-surface px-4 text-start"
      >
        <span className="size-2.5 shrink-0 rounded-full bg-[var(--phase)]" />
        <span className={`min-w-0 flex-1 break-words text-[15px] font-medium ${current ? "" : "text-muted"}`}>
          {label}
        </span>
        <IconChevron className="size-5 text-muted rtl:-scale-x-100" />
      </button>
      <TaskPicker open={open} onClose={() => setOpen(false)} />
    </>
  );
}
