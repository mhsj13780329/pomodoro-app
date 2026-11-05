"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconChevron, IconTrash } from "@/components/icons";
import { useTasksStore } from "@/features/tasks/store";
import { NOTE_BODY_MAX, NOTE_TITLE_MAX, type NoteWire } from "@/lib/notes/contract";
import { noteDate, wordCount } from "../format";
import { IconTaskLink } from "../icon";
import { useNotesStore } from "../store";

const AUTOSAVE_MS = 1000;

type Draft = { title: string; body: string; taskId: string | null };

const outlined =
  "min-h-11 cursor-pointer rounded-nav border border-line-strong bg-surface px-[18px] text-sm font-semibold text-ink";
const destructive = "min-h-11 cursor-pointer rounded-nav border-0 bg-focus-ink px-[18px] text-sm font-semibold text-white";

/**
 * Title, meta row, body and footer of one note. Edits autosave after a second.
 * Render with key={note.id} so switching notes resets the draft.
 * `desktop` picks the inline delete bar; the phone gets a bottom sheet.
 * `onBack` (phone only) shows the back chevron.
 */
export function NoteEditor({
  note,
  readOnly,
  desktop,
  onBack,
  onDeleted,
}: {
  note: NoteWire;
  readOnly: boolean;
  desktop: boolean;
  onBack?: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("notes");
  const locale = useLocale();
  const [draft, setDraft] = useState<Draft>({ title: note.title, body: note.body, taskId: note.taskId ?? null });
  const [dirty, setDirty] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const latest = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const id = note.id;

  const tasks = useTasksStore((s) => s.tasks);
  const linked = draft.taskId ? tasks[draft.taskId] : undefined;

  const commit = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const result = useNotesStore.getState().save(id, latest.current);
    if (result === "ok") setDirty(false);
  };

  const change = (next: Draft, now = false) => {
    latest.current = next;
    setDraft(next);
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    if (now) commit();
    else timer.current = setTimeout(commit, AUTOSAVE_MS);
  };

  // Leaving the note (or the page) writes what is typed.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        useNotesStore.getState().save(id, latest.current);
      }
    },
    [id],
  );

  // The body grows with its text instead of scrolling inside a box.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft.body]);

  const confirmDelete = () => {
    // Save first, so an undo on the phone brings back what was typed.
    if (timer.current) commit();
    setConfirming(false);
    onDeleted();
  };

  const date = noteDate(note.updatedAt, locale, { today: (time) => t("today", { time }), yesterday: t("yesterday") });
  const title = draft.title.trim() || t("untitled");
  const words = wordCount(draft.body);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-11 items-center gap-1 md:gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={t("back")}
            className="-ms-2 flex size-11 cursor-pointer items-center justify-center rounded-full text-ink"
          >
            <IconChevron className="size-6 ltr:-scale-x-100" />
          </button>
        )}
        <span aria-live="polite" className="flex items-center gap-1 text-[12px] text-muted md:text-[13px]">
          {!readOnly && !dirty && (
            <>
              <IconCheck className="size-3.5 text-short" />
              <span>{t("saved")}</span>
            </>
          )}
        </span>
        <span className="flex-1" />
        {desktop ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex min-h-11 cursor-pointer items-center gap-1.5 rounded-nav border border-line bg-transparent px-3.5 text-sm font-semibold text-focus-ink"
          >
            <IconTrash className="size-[18px]" />
            <span>{t("deleteShort")}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            aria-label={t("delete")}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-focus-ink"
          >
            <IconTrash className="size-5" />
          </button>
        )}
      </div>

      {desktop && confirming && (
        <div
          role="alertdialog"
          aria-labelledby="note-del-title"
          aria-describedby="note-del-body"
          className="mt-3 flex flex-wrap items-center gap-3 rounded-sheet bg-focus-soft px-4 py-3.5"
        >
          <div className="min-w-0 flex-[1_1_220px]">
            <div id="note-del-title" className="text-[15px] font-bold text-focus-ink">
              {t("confirmDelete")}
            </div>
            <div id="note-del-body" className="text-[13px] text-ink">
              {t("deleteEverywhere")}
            </div>
          </div>
          <button type="button" className={destructive} onClick={confirmDelete} autoFocus>
            {t("delete")}
          </button>
          <button type="button" className={outlined} onClick={() => setConfirming(false)}>
            {t("cancel")}
          </button>
        </div>
      )}

      <input
        className="mt-2 min-h-[52px] w-full border-0 bg-transparent p-0 text-[22px] font-bold text-ink outline-offset-4 placeholder:text-muted md:mt-3 md:min-h-14 md:text-[26px]"
        dir="auto"
        value={draft.title}
        readOnly={readOnly}
        maxLength={NOTE_TITLE_MAX}
        placeholder={t("titlePlaceholder")}
        aria-label={t("titleLabel")}
        onChange={(event) => change({ ...latest.current, title: event.target.value })}
        onBlur={() => timer.current && commit()}
      />

      <div className="relative flex flex-wrap items-center gap-2 border-b border-line pb-2 md:gap-2.5 md:pb-3">
        <span className="text-[12px] text-muted md:text-[13px]">{date}</span>
        {linked ? (
          <button
            type="button"
            disabled={readOnly}
            aria-haspopup="dialog"
            aria-expanded={picking}
            aria-label={t("linkedTask", { title: linked.title })}
            onClick={() => setPicking((open) => !open)}
            className="flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 disabled:cursor-default"
          >
            <span className="inline-flex min-h-7 items-center gap-1.5 rounded-[14px] bg-focus-soft px-2.5 text-[12px] font-medium text-focus-ink md:text-[13px]">
              <IconTaskLink className="size-3" />
              <span dir="auto" className="max-w-56 truncate">
                {linked.title}
              </span>
            </span>
          </button>
        ) : (
          !readOnly && (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={picking}
              onClick={() => setPicking((open) => !open)}
              className="min-h-11 cursor-pointer rounded-[14px] border border-dashed border-line-strong bg-transparent px-2.5 text-[12px] text-muted md:text-[13px]"
            >
              {t("linkTask")}
            </button>
          )
        )}
        {picking && (
          <TaskPicker
            current={draft.taskId}
            onClose={() => setPicking(false)}
            onPick={(taskId) => {
              setPicking(false);
              change({ ...latest.current, taskId }, true);
            }}
          />
        )}
      </div>

      <textarea
        ref={bodyRef}
        className="mt-2 min-h-64 w-full flex-1 resize-none overflow-hidden border-0 bg-transparent p-0 text-[15px] leading-[2] text-ink outline-offset-4 placeholder:text-muted md:mt-3 md:min-h-[360px] md:text-base"
        dir="auto"
        value={draft.body}
        readOnly={readOnly}
        maxLength={NOTE_BODY_MAX}
        placeholder={t("bodyPlaceholder")}
        aria-label={t("bodyLabel")}
        onChange={(event) => change({ ...latest.current, body: event.target.value })}
        onBlur={() => timer.current && commit()}
      />

      <div className="flex min-h-12 items-center justify-between border-t border-line text-[12px] text-muted md:min-h-11 md:text-[13px]">
        <span>{t("words", { count: words })}</span>
        <span>{t("synced")}</span>
      </div>

      {!desktop && confirming && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ink/45" onClick={() => setConfirming(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="note-sheet-title"
            className="flex flex-col gap-2.5 rounded-t-[28px] bg-surface px-4 pt-3 pb-6"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.key === "Escape" && setConfirming(false)}
          >
            <span aria-hidden="true" className="h-1 w-10 self-center rounded-sm bg-line-strong" />
            <h2 id="note-sheet-title" className="mt-2 text-[18px] font-bold">
              {t("confirmDelete")}
            </h2>
            <p className="mb-1.5 text-[14px] leading-[1.8] text-muted">{t("deleteNamed", { title })}</p>
            <button
              type="button"
              autoFocus
              onClick={confirmDelete}
              className="min-h-[52px] cursor-pointer rounded-control border-0 bg-focus-ink text-base font-semibold text-white"
            >
              {t("delete")}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="min-h-[52px] cursor-pointer rounded-control border border-line-strong bg-transparent text-base font-semibold text-ink"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Picks the one task a note is linked to, or clears the link. The design has no picker yet; this is a plain list. */
function TaskPicker({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (taskId: string | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations("notes");
  const rows = useTasksStore((s) => s.tasks);
  const tasks = useMemo(
    () =>
      Object.values(rows)
        .filter((task) => task.deletedAt == null)
        .sort((a, b) => Number(a.done) - Number(b.done) || a.order - b.order),
    [rows],
  );

  return (
    <div
      role="dialog"
      aria-label={t("pickTask")}
      onKeyDown={(event) => event.key === "Escape" && onClose()}
      className="absolute inset-x-0 top-full z-20 mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto rounded-sheet border border-line bg-surface p-2 shadow-lg md:inset-x-auto md:start-0 md:w-80"
    >
      {tasks.length === 0 && <p className="px-2 py-3 text-[13px] text-muted">{t("noTasks")}</p>}
      {tasks.map((task) => (
        <button
          key={task.id}
          type="button"
          aria-pressed={task.id === current}
          onClick={() => onPick(task.id)}
          className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-nav px-3 text-start text-[14px] ${
            task.id === current ? "bg-focus-soft font-semibold text-focus-ink" : "text-ink"
          } ${task.done ? "text-muted line-through" : ""}`}
        >
          <IconTaskLink className="size-3.5 shrink-0" />
          <span dir="auto" className="truncate">
            {task.title}
          </span>
        </button>
      ))}
      <div className="mt-1 flex gap-2 border-t border-line pt-2">
        {current && (
          <button type="button" onClick={() => onPick(null)} className={`${outlined} flex-1`}>
            {t("unlink")}
          </button>
        )}
        <button type="button" onClick={onClose} className={`${outlined} flex-1`}>
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
