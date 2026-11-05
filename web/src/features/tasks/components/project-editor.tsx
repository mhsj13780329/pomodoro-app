"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import { IconCheck } from "@/components/icons";
import { PROJECT_COLORS, type ProjectColor, type ProjectWire } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { PROJECT_NAME_MAX, useTasksStore } from "../store";
import { field, secondaryButton, sectionLabel } from "./styles";

type Props = {
  open: boolean;
  /** null = a new project. */
  project: ProjectWire | null;
  /** Prefills the name of a new project (e.g. what was typed in the picker's search). */
  initialName?: string;
  onClose: () => void;
  /** Called with the project's id after a successful save. */
  onSaved?: (id: string) => void;
};

function Body({ project, initialName = "", onClose, onSaved }: Omit<Props, "open">) {
  const t = useTranslations("tasks");
  const projects = useTasksStore((state) => state.projects);
  const [name, setName] = useState(project?.name ?? initialName);
  const [color, setColor] = useState<ProjectColor>(project?.color ?? "focus");
  const nameId = useId();
  const hintId = useId();

  const clean = name.trim();
  const taken = Object.values(projects).some(
    (other) => other.id !== project?.id && other.name.trim().toLocaleLowerCase() === clean.toLocaleLowerCase(),
  );
  const invalid = !clean || taken;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (invalid) return;
    const store = useTasksStore.getState();
    if (project) {
      if (store.updateProject(project.id, { name: clean, color }) !== "ok") return;
      onSaved?.(project.id);
    } else {
      const { result, id } = store.addProject(clean, color);
      if (result !== "ok" || !id) return;
      onSaved?.(id);
    }
    onClose();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={nameId} className={sectionLabel}>
          {t("projectNameLabel")}
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          maxLength={PROJECT_NAME_MAX}
          autoFocus
          aria-invalid={taken}
          aria-describedby={hintId}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("projectNamePlaceholder")}
          className={`${field} min-h-12 text-base`}
        />
        <span id={hintId} className={`text-xs ${taken ? "font-semibold text-focus-ink" : "text-muted"}`}>
          {taken ? t("projectNameTaken") : t("projectNameHint", { max: PROJECT_NAME_MAX })}
        </span>
      </div>

      <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
        <legend className={`${sectionLabel} mb-1`}>{t("projectColorLabel")}</legend>
        <div className="flex flex-wrap gap-1">
          {PROJECT_COLORS.map((id, index) => (
            <label key={id} className="flex size-11 cursor-pointer items-center justify-center">
              <input
                type="radio"
                name="project-color"
                value={id}
                checked={color === id}
                onChange={() => setColor(id)}
                aria-label={t("colorOption", { n: index + 1 })}
                className="peer sr-only"
              />
              <span
                className={`flex size-8 items-center justify-center rounded-full text-white ${PROJECT_DOT[id]} ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-ink peer-focus-visible:outline-2 peer-focus-visible:outline-focus`}
              >
                {color === id && <IconCheck className="size-4" />}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2 rounded-card bg-ground p-3.5" aria-hidden="true">
        <span className="text-xs text-muted">{t("projectPreview")}</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex min-h-9 items-center gap-1.5 rounded-pill bg-ink px-3 text-[13px] font-semibold text-surface">
            <span className={`size-2.5 rounded-full ${PROJECT_DOT[color]}`} />
            {clean || t("projectNameLabel")}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className={`size-2 rounded-full ${PROJECT_DOT[color]}`} />
            {clean || t("projectNameLabel")}
          </span>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={invalid}
          className="min-h-12 flex-1 cursor-pointer rounded-pill border-0 bg-focus text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {project ? t("projectSave") : t("projectCreate")}
        </button>
        <button type="button" onClick={onClose} className={`${secondaryButton} min-h-12 rounded-pill px-5`}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/** Create or edit a project: name, color and a live preview of how it will look. Pro only. */
export function ProjectEditor({ open, project, initialName, onClose, onSaved }: Props) {
  const t = useTranslations("tasks");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={project ? t("projectEditTitle", { name: project.name }) : t("projectNew")}
    >
      {/* Keyed so reopening for another project starts from that project's values. */}
      <Body
        key={project?.id ?? `new:${initialName ?? ""}`}
        project={project}
        initialName={initialName}
        onClose={onClose}
        onSaved={onSaved}
      />
    </Dialog>
  );
}
