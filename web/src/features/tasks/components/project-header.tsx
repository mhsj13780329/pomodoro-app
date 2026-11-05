"use client";

import { useTranslations } from "next-intl";
import { IconPencil, IconTrash } from "@/components/icons";
import type { ProjectWire } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { useTasksStore } from "../store";
import type { ProjectStats } from "../use-tasks-view";
import { secondaryButton } from "./styles";

type Props = {
  project: ProjectWire;
  stats: ProjectStats | undefined;
  /** Editing needs Pro. Without it the project still shows, read only. */
  pro: boolean;
  onEdit: () => void;
  onDelete: () => void;
};

/** Shown above the list while one project is selected: its numbers and what you can do with it. */
export function ProjectHeader({ project, stats, pro, onEdit, onDelete }: Props) {
  const t = useTranslations("tasks");
  return (
    <section
      aria-label={project.name}
      className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface px-3.5 py-3"
    >
      <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-nav bg-ground">
        <span className={`size-3.5 rounded-[4px] ${PROJECT_DOT[project.color]}`} />
      </span>
      <div className="flex min-w-40 flex-1 flex-col">
        <span className="text-base font-bold leading-relaxed">
          {project.archived ? t("projectArchivedName", { name: project.name }) : project.name}
        </span>
        <span className="text-xs text-muted">
          {t("projectMeta", {
            active: stats?.active ?? 0,
            sessions: stats?.sessions ?? 0,
          })}
        </span>
      </div>
      {pro && (
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onEdit}
            className={`${secondaryButton} flex items-center gap-1.5 rounded-pill`}
          >
            <IconPencil className="size-4" />
            <span>{t("projectEdit")}</span>
          </button>
          <button
            type="button"
            onClick={() => useTasksStore.getState().updateProject(project.id, { archived: !project.archived })}
            className={`${secondaryButton} rounded-pill`}
          >
            {project.archived ? t("projectUnarchive") : t("projectArchive")}
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("projectRemoveLabel", { name: project.name })}
            className={`${secondaryButton} flex w-11 items-center justify-center rounded-pill px-0 text-focus-ink`}
          >
            <IconTrash className="size-4" />
          </button>
        </div>
      )}
    </section>
  );
}
