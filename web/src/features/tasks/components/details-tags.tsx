"use client";

import { useTranslations } from "next-intl";
import type { TaskWire } from "@/lib/tasks/contract";
import { useTasksStore } from "../store";
import { InlineAdd } from "./inline-add";
import { sectionLabel } from "./styles";

export function DetailsTags({ task, locked }: { task: TaskWire; locked: boolean }) {
  const t = useTranslations("tasks");
  const tags = useTasksStore((state) => state.tags);
  const list = Object.values(tags).sort((a, b) => a.name.localeCompare(b.name));

  const toggle = (tagId: string, on: boolean) => {
    const current = useTasksStore.getState().tasks[task.id];
    if (!current) return;
    const ids = on ? [...current.tagIds, tagId] : current.tagIds.filter((id) => id !== tagId);
    useTasksStore.getState().updateTask(task.id, { tagIds: ids });
  };

  const add = (name: string) => {
    const { result, id } = useTasksStore.getState().addTag(name);
    if (result !== "ok" || !id) return result;
    toggle(id, true);
    return "ok" as const;
  };

  return (
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className={`${sectionLabel} mb-1`}>{t("tagsLabel")}</legend>
      {list.length === 0 ? (
        <p className="text-sm text-muted">{t("tagsEmpty")}</p>
      ) : (
        <ul className="flex flex-wrap gap-x-4">
          {list.map((tag) => (
            <li key={tag.id}>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
                <input
                  type="checkbox"
                  checked={task.tagIds.includes(tag.id)}
                  disabled={locked}
                  onChange={(event) => toggle(tag.id, event.target.checked)}
                  className="size-5 accent-focus"
                />
                {tag.name}
              </label>
            </li>
          ))}
        </ul>
      )}
      <InlineAdd
        label={t("tagAddLabel")}
        placeholder={t("tagAddPlaceholder")}
        button={t("tagAdd")}
        disabled={locked}
        maxLength={40}
        onAdd={add}
      />
    </fieldset>
  );
}
