import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SAMPLE_TASKS } from "../sample";

export function TaskList() {
  const t = useTranslations("tasks");
  // TODO: Phase 5 replaces this sample list with the user's tasks.
  return (
    <section className="rounded-panel border border-line bg-surface p-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("heading")}</h2>
        <Link href="/tasks" className="flex min-h-11 items-center text-sm font-semibold text-focus-ink">
          {t("all")}
        </Link>
      </div>
      <ul className="flex flex-col gap-1.5">
        {SAMPLE_TASKS.map((task) => {
          const title = t(`samples.${task.id}`);
          return (
            <li
              key={task.id}
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
                  aria-label={t("done", { title })}
                  className="size-[22px] accent-focus"
                />
              </label>
              <span className={`flex-1 text-[15px] ${task.active ? "font-semibold" : ""}`}>{title}</span>
              <span className="px-2 text-[13px] text-muted">
                {t("progress", { done: task.done, planned: task.planned })}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
