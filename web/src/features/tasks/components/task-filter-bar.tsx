"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { ProjectWire, TagWire } from "@/lib/tasks/contract";
import { field, secondaryButton } from "./styles";

export type TaskFilter = {
  /** "" = every project, "none" = tasks without a project, otherwise a project id. */
  project: string;
  /** "" = every tag, otherwise a tag id. */
  tag: string;
};

export const NO_FILTER: TaskFilter = { project: "", tag: "" };

type Props = {
  filter: TaskFilter;
  onChange: (next: TaskFilter) => void;
  projects: ProjectWire[];
  tags: TagWire[];
  onManageProjects: () => void;
};

/** Pro: narrow the list by project or tag, and open the project manager. */
export function TaskFilterBar({ filter, onChange, projects, tags, onManageProjects }: Props) {
  const t = useTranslations("tasks");
  const projectId = useId();
  const tagId = useId();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-muted">
        <label htmlFor={projectId}>{t("filterProject")}</label>
        <select
          id={projectId}
          value={filter.project}
          onChange={(event) => onChange({ ...filter, project: event.target.value })}
          className={`${field} text-ink`}
        >
          <option value="">{t("filterAll")}</option>
          <option value="none">{t("projectNone")}</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.archived ? t("projectArchivedName", { name: project.name }) : project.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex min-w-32 flex-1 flex-col gap-1 text-xs text-muted">
        <label htmlFor={tagId}>{t("filterTag")}</label>
        <select
          id={tagId}
          value={filter.tag}
          onChange={(event) => onChange({ ...filter, tag: event.target.value })}
          className={`${field} text-ink`}
        >
          <option value="">{t("filterAll")}</option>
          {tags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>
      <button type="button" onClick={onManageProjects} className={secondaryButton}>
        {t("manageProjects")}
      </button>
    </div>
  );
}
