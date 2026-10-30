"use client";

import { useTranslations } from "next-intl";
import { IconTrash } from "@/components/icons";
import type { TaskWire } from "@/lib/tasks/contract";
import { useTasksStore } from "../store";

/** Finished tasks. They never count toward the free limit and can be unchecked or deleted. */
export function TaskDoneList({ tasks }: { tasks: TaskWire[] }) {
  const t = useTranslations("tasks");
  if (tasks.length === 0) return null;
  return (
    <section>
      <h2 className="mb-1.5 text-[15px] font-semibold text-muted">{t("doneHeading", { count: tasks.length })}</h2>
      <ul className="flex flex-col gap-0.5">
        {tasks.map((task) => (
          <li key={task.id} className="flex min-h-12 items-center gap-1.5 pe-1 ps-1.5 md:ps-2">
            <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
              <input
                type="checkbox"
                checked
                onChange={() => useTasksStore.getState().setDone(task.id, false)}
                aria-label={t("done", { title: task.title })}
                className="size-[22px] cursor-pointer accent-short"
              />
            </label>
            <span className="min-w-0 flex-1 break-words text-[15px] text-muted line-through">{task.title}</span>
            <button
              type="button"
              aria-label={t("removeLabel", { title: task.title })}
              onClick={() => useTasksStore.getState().removeTask(task.id)}
              className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-nav border-0 bg-transparent text-muted"
            >
              <IconTrash className="size-5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
