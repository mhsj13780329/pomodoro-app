"use client";

import { useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { IconArrowDown, IconArrowUp, IconMore, IconPencil, IconTrash } from "@/components/icons";
import { PROJECT_DOT } from "../palette";
import { useTimerStore } from "@/features/timer/store";
import type { ProjectWire, TagWire, TaskWire } from "@/lib/tasks/contract";
import { TITLE_MAX, useTasksStore } from "../store";
import { TaskCount } from "./task-count";

type Props = {
  task: TaskWire;
  doneCount: number;
  /** This is the task the focus session is for. */
  current: boolean;
  first: boolean;
  last: boolean;
  /** Moving is off while a filter hides some rows, since "up" would not visibly move. */
  canMove: boolean;
  /** The project this task belongs to, if it still exists. */
  project: ProjectWire | null;
  tags: TagWire[];
  subtasks: { done: number; total: number } | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenDetails: () => void;
};

const iconButton =
  "flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-nav border-0 bg-transparent px-2 text-sm font-medium text-ink disabled:cursor-not-allowed disabled:opacity-40";

/** One active task: checkbox, title (picks it for the timer), count, and a "more" bar. */
export function TaskRow({
  task,
  doneCount,
  current,
  first,
  last,
  canMove,
  project,
  tags,
  subtasks,
  expanded,
  onToggleExpanded,
  onOpenDetails,
}: Props) {
  const t = useTranslations("tasks");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  // Escape and blur both end editing; this makes sure only the first one counts.
  const finished = useRef(false);

  const pick = () => {
    // Picking never touches a running timer: it only changes which task the session is for.
    useTimerStore.getState().setTask(current ? null : task.id);
  };

  const startRename = () => {
    finished.current = false;
    setDraft(task.title);
    setEditing(true);
  };

  const finishRename = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const title = draft.trim();
    if (save && title && title !== task.title) useTasksStore.getState().renameTask(task.id, title);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    finishRename(true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      finishRename(false);
    }
  };

  return (
    <li
      className={`rounded-nav bg-surface md:rounded-[18px] ${
        current ? "border-2 border-focus" : "border border-line"
      }`}
    >
      <div className={`flex items-center gap-1 pe-1 ps-1.5 md:ps-2 ${current ? "min-h-[54px]" : "min-h-[52px]"}`}>
        <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={false}
            onChange={() => useTasksStore.getState().setDone(task.id, true)}
            aria-label={t("done", { title: task.title })}
            className="size-[22px] cursor-pointer accent-focus"
          />
        </label>

        {editing ? (
          <form onSubmit={submit} className="min-w-0 flex-1">
            <label htmlFor={`rename-${task.id}`} className="sr-only">
              {t("renameLabel")}
            </label>
            <input
              id={`rename-${task.id}`}
              type="text"
              autoFocus
              value={draft}
              maxLength={TITLE_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => finishRename(true)}
              className="min-h-11 w-full rounded-nav border border-line-strong bg-ground px-3 text-[15px] text-ink"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={pick}
            aria-pressed={current}
            aria-label={t("pick", { title: task.title })}
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-x-2.5 gap-y-0.5 border-0 bg-transparent px-1 py-1 text-start text-ink"
          >
            <span className={`break-words text-[15px] md:text-base ${current ? "font-semibold" : "font-medium"}`}>
              {task.title}
            </span>
            {current && (
              <span className="rounded-lg bg-focus-soft px-2 text-xs font-medium text-focus-ink">
                {t("focusing")}
              </span>
            )}
          </button>
        )}

        {!editing && <TaskCount done={doneCount} planned={task.estimatePomodoros} />}

        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          aria-label={t("more", { title: task.title })}
          className={`${iconButton} shrink-0 text-muted`}
        >
          <IconMore className="size-5" />
        </button>
      </div>

      {(project || tags.length > 0 || subtasks) && (
        <div className="flex flex-wrap items-center gap-1.5 pe-3 ps-14 pb-2.5 text-xs text-muted">
          {project && (
            <span className="flex min-h-6 items-center gap-1.5 rounded-lg bg-ground px-2">
              <span aria-hidden="true" className={`size-2 rounded-full ${PROJECT_DOT[project.color]}`} />
              {project.name}
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag.id} className="flex min-h-6 items-center rounded-lg bg-ground px-2">
              {tag.name}
            </span>
          ))}
          {subtasks && <span>{t("subtasksProgress", subtasks)}</span>}
        </div>
      )}

      {expanded && (
        <div role="group" aria-label={t("more", { title: task.title })} className="flex flex-wrap gap-1 border-t border-line px-2 py-1">
          <button
            type="button"
            className={iconButton}
            onClick={() => {
              onToggleExpanded();
              startRename();
            }}
          >
            <IconPencil className="size-[18px]" />
            <span>{t("rename")}</span>
          </button>
          <button type="button" className={iconButton} onClick={onOpenDetails}>
            <span>{t("details")}</span>
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={first || !canMove}
            onClick={() => useTasksStore.getState().moveTask(task.id, "up")}
          >
            <IconArrowUp className="size-[18px]" />
            <span>{t("moveUp")}</span>
          </button>
          <button
            type="button"
            className={iconButton}
            disabled={last || !canMove}
            onClick={() => useTasksStore.getState().moveTask(task.id, "down")}
          >
            <IconArrowDown className="size-[18px]" />
            <span>{t("moveDown")}</span>
          </button>
          <button
            type="button"
            className={`${iconButton} text-focus-ink`}
            aria-label={t("removeLabel", { title: task.title })}
            onClick={() => useTasksStore.getState().removeTask(task.id)}
          >
            <IconTrash className="size-[18px]" />
            <span>{t("remove")}</span>
          </button>
        </div>
      )}
    </li>
  );
}
