"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import type { TaskWire } from "@/lib/tasks/contract";
import { useTasksStore } from "../store";
import { DetailsNotes } from "./details-notes";
import { DetailsSubtasks } from "./details-subtasks";
import { DetailsTags } from "./details-tags";
import { ProLock } from "./pro-lock";
import { field, secondaryButton, sectionLabel } from "./styles";

const MAX_ESTIMATE = 50;

function Body({ task, onClose }: { task: TaskWire; onClose: () => void }) {
  const t = useTranslations("tasks");
  const pro = useTasksStore((state) => state.pro);
  const projects = useTasksStore((state) => state.projects);
  const projectId = useId();
  // Not Pro (never was, or it ended): everything shows, nothing can be added or changed.
  // The server refuses those writes too; this only keeps the UI honest.
  const locked = !pro;
  const estimate = task.estimatePomodoros;

  const setEstimate = (value: number | null) => useTasksStore.getState().updateTask(task.id, { estimatePomodoros: value });

  const choices = Object.values(projects)
    .filter((project) => !project.archived || project.id === task.projectId)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      {locked && (
        <div className="flex flex-col items-start gap-2 rounded-nav bg-pro-bg px-3.5 py-2.5 text-sm leading-relaxed text-pro-ink">
          <p>{t("proOnly")}</p>
          <ProLock label={t("upgrade")} />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span id={`${projectId}-estimate`} className={sectionLabel}>
          {t("estimateLabel")}
        </span>
        <div role="group" aria-labelledby={`${projectId}-estimate`} className="flex items-center gap-2">
          <button
            type="button"
            aria-label={t("estimateLess")}
            disabled={locked || estimate == null}
            onClick={() => setEstimate(estimate == null || estimate <= 1 ? null : estimate - 1)}
            className={`${secondaryButton} w-11 px-0 text-lg`}
          >
            −
          </button>
          <span role="status" className="min-w-24 text-center text-[15px]">
            {estimate == null ? t("estimateNone") : t("sessionsCount", { count: estimate })}
          </span>
          <button
            type="button"
            aria-label={t("estimateMore")}
            disabled={locked || (estimate ?? 0) >= MAX_ESTIMATE}
            onClick={() => setEstimate((estimate ?? 0) + 1)}
            className={`${secondaryButton} w-11 px-0 text-lg`}
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={projectId} className={sectionLabel}>
          {t("projectLabel")}
        </label>
        <select
          id={projectId}
          value={task.projectId && projects[task.projectId] ? task.projectId : ""}
          disabled={locked}
          onChange={(event) => useTasksStore.getState().updateTask(task.id, { projectId: event.target.value || null })}
          className={field}
        >
          <option value="">{t("projectNone")}</option>
          {choices.map((project) => (
            <option key={project.id} value={project.id}>
              {project.archived ? t("projectArchivedName", { name: project.name }) : project.name}
            </option>
          ))}
        </select>
      </div>

      <DetailsTags task={task} locked={locked} />
      <DetailsNotes task={task} locked={locked} />
      {task.parentId == null && <DetailsSubtasks task={task} locked={locked} />}

      <button type="button" onClick={onClose} className={`${secondaryButton} w-full`}>
        {t("close")}
      </button>
    </div>
  );
}

/** Pro details for one task: estimate, project, tags, notes and subtasks. `taskId` null = closed. */
export function TaskDetails({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const t = useTranslations("tasks");
  const task = useTasksStore((state) => (taskId ? state.tasks[taskId] : undefined));
  return (
    <Dialog open={Boolean(task)} onClose={onClose} title={t("detailsTitle", { title: task?.title ?? "" })}>
      {task && <Body task={task} onClose={onClose} />}
    </Dialog>
  );
}
