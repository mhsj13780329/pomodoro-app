"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { field, secondaryButton } from "@/features/tasks/components/styles";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX, type NoteWire } from "@/lib/notes/contract";
import { useNotesStore } from "../store";

const AUTOSAVE_MS = 700;

/** Render with key={note.id} so switching notes resets the draft. */
export function NoteEditor({ note, readOnly, onDelete }: { note: NoteWire; readOnly: boolean; onDelete: () => void }) {
  const t = useTranslations("notes");
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [saved, setSaved] = useState(false);
  const draft = useRef({ title, body });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = note.id;

  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const result = useNotesStore.getState().save(id, draft.current);
    if (result === "ok") setSaved(true);
  };

  const change = (next: { title: string; body: string }) => {
    draft.current = next;
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(commit, AUTOSAVE_MS);
  };

  // Leaving the note (or the page) writes what is typed.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        useNotesStore.getState().save(id, draft.current);
      }
    },
    [id],
  );

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2.5">
      <input
        className={`${field} font-semibold`}
        value={title}
        readOnly={readOnly}
        maxLength={NOTE_TITLE_MAX}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titlePlaceholder")}
        onChange={(event) => {
          setTitle(event.target.value);
          change({ title: event.target.value, body });
        }}
        onBlur={() => timer.current && commit()}
      />
      <textarea
        className={`${field} min-h-64 resize-y py-2.5 leading-relaxed`}
        value={body}
        readOnly={readOnly}
        maxLength={NOTE_BODY_MAX}
        placeholder={t("bodyPlaceholder")}
        aria-label={t("bodyPlaceholder")}
        onChange={(event) => {
          setBody(event.target.value);
          change({ title, body: event.target.value });
        }}
        onBlur={() => timer.current && commit()}
      />
      <div className="flex items-center justify-between gap-3">
        <span role="status" className="text-[13px] text-muted">
          {saved ? t("saved") : ""}
        </span>
        <button
          type="button"
          className={secondaryButton}
          onClick={() => {
            if (window.confirm(t("confirmDelete"))) {
              if (timer.current) clearTimeout(timer.current);
              timer.current = null;
              onDelete();
            }
          }}
        >
          {t("delete")}
        </button>
      </div>
    </div>
  );
}
