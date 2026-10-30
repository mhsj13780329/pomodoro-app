"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { IconPlus } from "@/components/icons";
import { TITLE_MAX, useTasksStore } from "../store";

/** The add box. Disabled at the free limit; the server enforces the same limit. */
export function TaskAddForm({ disabled }: { disabled: boolean }) {
  const t = useTranslations("tasks");
  const [title, setTitle] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled) return;
    const result = useTasksStore.getState().addTask(title);
    // Keep the text if the add was refused, so nothing the user typed is lost.
    if (result === "ok") setTitle("");
  };

  return (
    <form onSubmit={submit} className="mt-2 flex gap-2 md:mt-0">
      <label htmlFor="new-task" className="sr-only">
        {t("addLabel")}
      </label>
      <input
        id="new-task"
        type="text"
        value={title}
        maxLength={TITLE_MAX}
        disabled={disabled}
        onChange={(event) => setTitle(event.target.value)}
        placeholder={t("addPlaceholder")}
        className="min-h-12 min-w-0 flex-1 rounded-nav border border-line-strong bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted disabled:opacity-60 md:min-h-[52px] md:rounded-control md:px-4 md:text-base"
      />
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
