"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { TaskWire } from "@/lib/tasks/contract";
import { useTasksStore } from "../store";
import { field, sectionLabel } from "./styles";

/** The notes box. It saves when you leave it and when the dialog closes, not on every key. */
export function DetailsNotes({ task, locked }: { task: TaskWire; locked: boolean }) {
  const t = useTranslations("tasks");
  const id = useId();
  const [draft, setDraft] = useState(task.notes ?? "");
  // The latest text and task id, readable from the unmount cleanup below.
  const latest = useRef({ id: task.id, draft, saved: task.notes ?? "" });
  useEffect(() => {
    latest.current.id = task.id;
    latest.current.draft = draft;
  });

  const save = () => {
    const { id: taskId, draft: text, saved } = latest.current;
    if (text === saved) return;
    latest.current.saved = text;
    useTasksStore.getState().updateTask(taskId, { notes: text.trim() === "" ? null : text });
  };

  // Escape closes the dialog without a blur, so flush any unsaved text on unmount too.
  useEffect(() => save, []);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className={sectionLabel}>
        {t("notesLabel")}
      </label>
      <textarea
        id={id}
        value={draft}
        rows={4}
        maxLength={5000}
        disabled={locked}
        placeholder={t("notesPlaceholder")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        className={`${field} py-2.5 leading-relaxed`}
      />
    </div>
  );
}
