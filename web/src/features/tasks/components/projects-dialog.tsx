"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import { IconTrash } from "@/components/icons";
import { PROJECT_COLORS, type ProjectColor, type ProjectWire } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { useTasksStore } from "../store";
import { InlineAdd } from "./inline-add";
import { ProLock } from "./pro-lock";
import { field, secondaryButton, sectionLabel } from "./styles";

function ProjectRow({ project, locked }: { project: ProjectWire; locked: boolean }) {
  const t = useTranslations("tasks");
  const [draft, setDraft] = useState(project.name);

  const rename = () => {
    const name = draft.trim();
    if (!name || name === project.name) {
      setDraft(project.name);
      return;
    }
    useTasksStore.getState().updateProject(project.id, { name });
  };

  return (
    <li className="flex flex-wrap items-center gap-1.5">
      <span aria-hidden="true" className={`size-3 shrink-0 rounded-full ${PROJECT_DOT[project.color]}`} />
      <div className="min-w-32 flex-1">
        <input
          type="text"
          aria-label={t("projectNameLabel")}
          value={draft}
          maxLength={60}
          disabled={locked}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className={`${field} ${project.archived ? "text-muted" : ""}`}
        />
      </div>
      <div>
        <select
          aria-label={t("projectColorLabel")}
          value={project.color}
          disabled={locked}
          onChange={(event) =>
            useTasksStore.getState().updateProject(project.id, { color: event.target.value as ProjectColor })
          }
          className={`${field} w-auto`}
        >
          {PROJECT_COLORS.map((color, index) => (
            <option key={color} value={color}>
              {t("colorOption", { n: index + 1 })}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => useTasksStore.getState().updateProject(project.id, { archived: !project.archived })}
        className={secondaryButton}
      >
        {project.archived ? t("projectUnarchive") : t("projectArchive")}
      </button>
      <button
        type="button"
        disabled={locked}
        aria-label={t("projectRemoveLabel", { name: project.name })}
        onClick={() => useTasksStore.getState().removeProject(project.id)}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-nav border-0 bg-transparent text-muted disabled:cursor-not-allowed disabled:opacity-60"
      >
        <IconTrash className="size-[18px]" />
      </button>
    </li>
  );
}

function Body({ onClose }: { onClose: () => void }) {
  const t = useTranslations("tasks");
  const pro = useTasksStore((state) => state.pro);
  const rows = useTasksStore((state) => state.projects);
  const projects = useMemo(() => Object.values(rows).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)), [rows]);
  const [color, setColor] = useState<ProjectColor>("focus");
  const groupId = useId();
  const locked = !pro;

  return (
    <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
      {locked && (
        <div className="flex flex-col items-start gap-2 rounded-nav bg-pro-bg px-3.5 py-2.5 text-sm leading-relaxed text-pro-ink">
          <p>{t("proOnly")}</p>
          <ProLock label={t("upgrade")} />
        </div>
      )}

      {projects.length === 0 ? (
        <p className="text-sm text-muted">{t("projectsEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((project) => (
            // Keyed by id and updatedAt, so an edit from another device refreshes the name box.
            <ProjectRow key={`${project.id}:${project.updatedAt}`} project={project} locked={locked} />
          ))}
        </ul>
      )}

      <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
        <legend id={groupId} className={`${sectionLabel} mb-1`}>
          {t("projectColorLabel")}
        </legend>
        <div className="flex flex-wrap gap-1">
          {PROJECT_COLORS.map((id, index) => (
            <label key={id} className="flex size-11 cursor-pointer items-center justify-center">
              <input
                type="radio"
                name="new-project-color"
                value={id}
                checked={color === id}
                disabled={locked}
                onChange={() => setColor(id)}
                aria-label={t("colorOption", { n: index + 1 })}
                className="peer sr-only"
              />
              <span
                className={`size-7 rounded-full ${PROJECT_DOT[id]} ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-focus`}
              />
            </label>
          ))}
        </div>
        <InlineAdd
          label={t("projectNameLabel")}
          placeholder={t("projectAddPlaceholder")}
          button={t("projectAdd")}
          disabled={locked}
          maxLength={60}
          onAdd={(name) => useTasksStore.getState().addProject(name, color)}
        />
      </fieldset>

      <button type="button" onClick={onClose} className={`${secondaryButton} w-full`}>
        {t("close")}
      </button>
    </div>
  );
}

export function ProjectsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations("tasks");
  return (
    <Dialog open={open} onClose={onClose} title={t("projectsTitle")}>
      <Body onClose={onClose} />
    </Dialog>
  );
}
