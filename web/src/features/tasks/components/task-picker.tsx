"use client";

import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import { Link } from "@/i18n/navigation";
import { useTimerStore } from "@/features/timer/store";
import { useTasksView } from "../use-tasks-view";

const option =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-nav px-2 text-[15px] has-[:checked]:bg-focus-soft has-[:checked]:font-semibold";

/**
 * Choose the task for the focus session. It only changes `taskId`: a running timer is never
 * touched, so this is safe to open at any moment.
 */
export function TaskPicker({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("tasks");
  const { active, current } = useTasksView();
  const selected = current?.id ?? "";

  const choose = (id: string | null, byPointer: boolean) => {
    useTimerStore.getState().setTask(id);
    // Arrow keys also "click" the radio they land on. Only a real tap or click should close the
    // dialog, so keyboard users can move through the list first.
    if (byPointer) onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("pickerTitle")}>
      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend className="sr-only">{t("pickerTitle")}</legend>
        <label className={option}>
          <input
            type="radio"
            name="focus-task"
            checked={selected === ""}
            onChange={() => {}}
            onClick={(event) => choose(null, event.detail > 0)}
            className="size-5 accent-focus"
          />
          <span className="text-muted">{t("none")}</span>
        </label>
        {active.map((task) => (
          <label key={task.id} className={option}>
            <input
              type="radio"
              name="focus-task"
              checked={selected === task.id}
              onChange={() => {}}
              onClick={(event) => choose(task.id, event.detail > 0)}
              className="size-5 accent-focus"
            />
            <span className="min-w-0 break-words">{task.title}</span>
          </label>
        ))}
      </fieldset>
      {active.length === 0 && (
        <p className="text-sm leading-relaxed text-muted">
          {t("pickerEmpty")}{" "}
          <Link href="/tasks" className="font-semibold text-focus-ink underline">
            {t("pickerManage")}
          </Link>
        </p>
      )}
      <button
        type="button"
        onClick={onClose}
        className="min-h-12 cursor-pointer rounded-control border border-line-strong bg-transparent px-4 text-[15px] font-semibold text-ink"
      >
        {t("close")}
      </button>
    </Dialog>
  );
}
