"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { IconPlus } from "@/components/icons";
import type { ProjectWire } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { TITLE_MAX, useTasksStore } from "../store";

/**
 * The add box. Disabled at the free limit; the server enforces the same limit.
 * While a project is selected, a new task goes straight into it, and the box says so.
 */
export function TaskAddForm({ disabled, project = null }: { disabled: boolean; project?: ProjectWire | null }) {
  const t = useTranslations("tasks");
  const [title, setTitle] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const result = useTasksStore.getState().addTask(title, project?.id ?? null);
    // Keep the text if the add was refused, so nothing the user typed is lost.
    if (result === "ok") setTitle("");
  };

  return (
    <form onSubmit={submit} className="mt-2 flex gap-2 md:mt-0">
      <label htmlFor="new-task" className="sr-only">
        {t("addLabel")}
      </label>
      <div className="flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-nav border border-line-strong bg-surface pe-1.5 ps-3.5 focus-within:outline-2 focus-within:outline-focus md:min-h-[52px] md:rounded-control md:ps-4">
        <input
          id="new-task"
          type="text"
          value={title}
          maxLength={TITLE_MAX}
          disabled={disabled}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={project ? t("addPlaceholderIn", { name: project.name }) : t("addPlaceholder")}
          aria-describedby={project ? "new-task-target" : undefined}
          className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-muted disabled:opacity-60 md:text-base"
        />
        {project && (
          <span
            id="new-task-target"
            className="flex min-h-9 max-w-[45%] shrink-0 items-center gap-1.5 rounded-[12px] bg-ground px-2.5 text-xs font-semibold text-muted"
          >
            <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${PROJECT_DOT[project.color]}`} />
            <span className="sr-only">{t("addTargetLabel")}</span>{" "}
            <span className="truncate">{project.name}</span>
          </span>
        )}
      </div>
      <button
        type="submit"
        disabled={disabled}
        className="flex size-12 shrink-0 cursor-pointer items-center justify-center rounded-nav bg-focus p-0 text-white disabled:cursor-not-allowed disabled:opacity-60 md:h-[52px] md:w-auto md:rounded-control md:px-6 md:text-base md:font-semibold"
      >
        <IconPlus className="size-[22px] md:hidden" />
        <span className="sr-only md:not-sr-only">{t("add")}</span>
      </button>
    </form>
  );
}
