import Link from "next/link";
import { strings } from "../strings.fa";

export function TaskList() {
  // TODO: Phase 5 replaces this sample list with the user's tasks.
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">{strings.tasksHeading}</h2>
        <Link href="/tasks" className="flex min-h-11 items-center text-sm font-semibold text-focus-ink">
          {strings.allTasks}
        </Link>
      </div>
      <ul className="flex flex-col gap-1.5">
        {strings.sampleTasks.map((task) => (
          <li
            key={task.title}
            className={`flex items-center gap-1 rounded-nav bg-ground pe-3 ps-1.5 ${
              task.active
                ? "min-h-14 border-2 border-[var(--phase)]"
                : "min-h-[52px] border border-line"
            }`}
          >
            <label className="flex size-11 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                disabled
                aria-label={`${strings.donePrefix}${task.title}`}
                className="size-[22px] accent-focus"
              />
            </label>
            <span className={`flex-1 text-[15px] ${task.active ? "font-semibold" : ""}`}>
              {task.title}
            </span>
            <span className="px-2 text-[13px] text-muted">{task.meta}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
