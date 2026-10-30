"use client";

import { useTranslations } from "next-intl";
import { TaskCount } from "@/features/tasks/components/task-count";
import { useTasksStore } from "@/features/tasks/store";
import { useTasksView } from "@/features/tasks/use-tasks-view";
import { Link } from "@/i18n/navigation";
import { useTimerStore } from "../store";

/** How many tasks the desktop side panel shows. The Tasks page has the rest. */
const SHOWN = 5;

/** Desktop side panel: the first active tasks, with the current one marked. */
export function TaskList() {
  const t = useTranslations("tasks");
  const { ready, active, counts, current } = useTasksView();
  const shown = active.slice(0, SHOWN);

  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        <Link href="/tasks" className="flex min-h-11 items-center text-sm font-semibold text-focus-ink">
          {t("all")}
        </Link>
      </div>
      {ready && shown.length === 0 ? (
        <p className="py-2 text-[15px] text-muted">{t("listEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {shown.map((task) => {
            const isCurrent = current?.id === task.id;
            return (
              <li
                key={task.id}
                className={`flex items-center gap-1 rounded-nav bg-ground pe-3 ps-1.5 ${
                  isCurrent ? "min-h-14 border-2 border-[var(--phase)]" : "min-h-[52px] border border-line"
                }`}
              >
                <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => useTasksStore.getState().setDone(task.id, true)}
                    aria-label={t("done", { title: task.title })}
                    className="size-[22px] cursor-pointer accent-focus"
                  />
                </label>
                <button
                  type="button"
                  aria-pressed={isCurrent}
                  aria-label={t("pick", { title: task.title })}
                  onClick={() => useTimerStore.getState().setTask(isCurrent ? null : task.id)}
                  className={`min-h-11 min-w-0 flex-1 cursor-pointer break-words border-0 bg-transparent px-1 text-start text-[15px] text-ink ${
                    isCurrent ? "font-semibold" : ""
                  }`}
                >
                  {task.title}
                </button>
                <TaskCount done={counts[task.id] ?? 0} planned={task.estimatePomodoros} dots={false} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
