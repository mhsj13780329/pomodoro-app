"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { IconTrash } from "@/components/icons";
import type { TaskWire } from "@/lib/tasks/contract";
import { subtasksOf } from "@/lib/tasks/select";
import { useTasksStore } from "../store";
import { InlineAdd } from "./inline-add";
import { sectionLabel } from "./styles";

/**
 * Adding a subtask is Pro. Finishing or deleting one that already exists is always allowed,
 * so a user whose Pro ended can still work through what they made.
 */
export function DetailsSubtasks({ task, locked }: { task: TaskWire; locked: boolean }) {
  const t = useTranslations("tasks");
  const tasks = useTasksStore((state) => state.tasks);
  const subtasks = useMemo(() => subtasksOf(tasks, task.id), [tasks, task.id]);

  return (
    <section className="flex flex-col gap-1">
      <h3 className={`${sectionLabel} mb-1`}>{t("subtasksLabel")}</h3>
      {subtasks.length > 0 && (
        <ul className="flex flex-col">
          {subtasks.map((sub) => (
            <li key={sub.id} className="flex min-h-11 items-center gap-1.5">
              <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                <input
                  type="checkbox"
                  checked={sub.done}
                  onChange={(event) => useTasksStore.getState().setDone(sub.id, event.target.checked)}
                  aria-label={t("done", { title: sub.title })}
                  className="size-5 cursor-pointer accent-short"
                />
              </label>
              <span className={`min-w-0 flex-1 break-words text-[15px] ${sub.done ? "text-muted line-through" : ""}`}>
                {sub.title}
              </span>
              <button
                type="button"
                aria-label={t("removeLabel", { title: sub.title })}
                onClick={() => useTasksStore.getState().removeTask(sub.id)}
                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-nav border-0 bg-transparent text-muted"
              >
                <IconTrash className="size-[18px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <InlineAdd
        label={t("subtaskAddLabel")}
        placeholder={t("subtaskAddPlaceholder")}
        button={t("add")}
        disabled={locked}
        maxLength={200}
        onAdd={(title) => useTasksStore.getState().addSubtask(task.id, title)}
      />
    </section>
  );
}
