"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import type { ProjectWire } from "@/lib/tasks/contract";
import { useTasksStore } from "../store";
import type { ProjectStats } from "../use-tasks-view";
import { secondaryButton } from "./styles";

type Props = {
  project: ProjectWire | null;
  stats: ProjectStats | undefined;
  onClose: () => void;
  /** Called after the project is gone. */
  onDeleted?: () => void;
};

const option =
  "flex cursor-pointer items-start gap-3 rounded-card border px-3.5 py-3 has-[:checked]:border-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus";

function Body({ project, stats, onClose, onDeleted }: Props & { project: ProjectWire }) {
  const t = useTranslations("tasks");
  const [deleteTasks, setDeleteTasks] = useState(false);
  const active = stats?.active ?? 0;
  const done = stats?.done ?? 0;
  const hasTasks = active + done > 0;

  const confirm = () => {
    if (useTasksStore.getState().removeProject(project.id, { deleteTasks }) !== "ok") return;
    onDeleted?.();
    onClose();
  };

  const archive = () => {
    if (useTasksStore.getState().updateProject(project.id, { archived: true }) !== "ok") return;
    onDeleted?.();
    onClose();
  };

  return (
    <div className="flex flex-col gap-4">
      {hasTasks && (
        <>
          <p className="text-sm leading-loose text-muted">{t("projectDeleteBody", { active, done })}</p>
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="sr-only">{t("projectDeleteChoice")}</legend>
            <label className={`${option} border-line has-[:checked]:border-focus has-[:checked]:bg-focus-soft`}>
              <input
                type="radio"
                name="project-delete"
                checked={!deleteTasks}
                onChange={() => setDeleteTasks(false)}
                className="mt-1 size-5 shrink-0 accent-focus"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{t("projectDeleteKeep")}</span>
                <span className="text-[13px] leading-relaxed text-muted">{t("projectDeleteKeepHint")}</span>
              </span>
            </label>
            <label className={`${option} border-line has-[:checked]:border-focus-ink has-[:checked]:bg-focus-soft`}>
              <input
                type="radio"
                name="project-delete"
                checked={deleteTasks}
                onChange={() => setDeleteTasks(true)}
                className="mt-1 size-5 shrink-0 accent-focus-ink"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold">{t("projectDeleteAlso")}</span>
                <span className="text-[13px] leading-relaxed text-muted">
                  {t("projectDeleteAlsoHint", { count: active + done })}
                </span>
              </span>
            </label>
          </fieldset>
        </>
      )}

      <p className="text-[13px] leading-relaxed text-muted">{t("projectDeleteStats")}</p>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={confirm}
          className="min-h-12 cursor-pointer rounded-pill border-0 bg-focus text-[15px] font-bold text-white"
        >
          {deleteTasks ? t("projectDeleteConfirmAll") : t("projectDeleteConfirm")}
        </button>
        <button type="button" onClick={onClose} className={`${secondaryButton} min-h-12 rounded-pill`}>
          {t("cancel")}
        </button>
        {!project.archived && (
          <button
            type="button"
            onClick={archive}
            className="min-h-11 cursor-pointer border-0 bg-transparent text-[13px] font-semibold text-focus-ink underline"
          >
            {t("projectDeleteArchiveInstead")}
          </button>
        )}
      </div>
    </div>
  );
}

/** Confirms deleting a project and asks what happens to its tasks. `project` null = closed. */
export function ProjectDelete({ project, stats, onClose, onDeleted }: Props) {
  const t = useTranslations("tasks");
  return (
    <Dialog open={Boolean(project)} onClose={onClose} title={t("projectDeleteTitle", { name: project?.name ?? "" })}>
      {project && <Body key={project.id} project={project} stats={stats} onClose={onClose} onDeleted={onDeleted} />}
    </Dialog>
  );
}
