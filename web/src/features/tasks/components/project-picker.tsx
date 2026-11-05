"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { IconPlus } from "@/components/icons";
import { PROJECT_COLORS } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { PROJECT_NAME_MAX, useTasksStore } from "../store";
import { field } from "./styles";

type Props = {
  /** The chosen project id, or null for "no project". */
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

const row =
  "flex min-h-[52px] cursor-pointer items-center gap-2.5 border-b border-line px-3.5 last:border-b-0 has-[:checked]:bg-ground has-[:checked]:font-bold has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus";

/**
 * Pick a task's project from a short list. Typing filters it; a name that matches nothing
 * can be created on the spot (Pro), and is picked straight away.
 */
export function ProjectPicker({ value, onChange, disabled = false }: Props) {
  const t = useTranslations("tasks");
  const rows = useTasksStore((state) => state.projects);
  const [query, setQuery] = useState("");
  const name = useId();
  const searchId = useId();

  const projects = useMemo(
    () =>
      Object.values(rows)
        // Archived projects are hidden, except the one this task is already in.
        .filter((project) => !project.archived || project.id === value)
        .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [rows, value],
  );
  const q = query.trim().toLocaleLowerCase();
  const shown = q ? projects.filter((project) => project.name.toLocaleLowerCase().includes(q)) : projects;
  const exact = projects.some((project) => project.name.trim().toLocaleLowerCase() === q);
  const current = value && rows[value] ? value : null;

  const create = () => {
    // Each new project takes the next color, so a few made in a row look different.
    const color = PROJECT_COLORS[Object.keys(rows).length % PROJECT_COLORS.length]!;
    const { result, id } = useTasksStore.getState().addProject(query, color);
    if (result === "ok" && id) {
      onChange(id);
      setQuery("");
    }
  };

  return (
    <fieldset disabled={disabled} className="m-0 flex flex-col gap-2 border-0 p-0 disabled:opacity-60">
      <legend className="sr-only">{t("projectLabel")}</legend>
      <label htmlFor={searchId} className="sr-only">
        {t("projectPickerSearchLabel")}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        maxLength={PROJECT_NAME_MAX}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("projectPickerSearch")}
        className={field}
      />
      <div className="flex flex-col overflow-hidden rounded-card border border-line">
        {!q && (
          <label className={row}>
            <span aria-hidden="true" className="size-3 shrink-0 rounded-[4px] border-2 border-line-strong" />
            <span className="flex-1 text-[15px]">{t("projectNone")}</span>
            <input
              type="radio"
              name={name}
              checked={current === null}
              onChange={() => onChange(null)}
              className="size-5 accent-focus"
            />
          </label>
        )}
        {shown.map((project) => (
          <label key={project.id} className={row}>
            <span aria-hidden="true" className={`size-3 shrink-0 rounded-[4px] ${PROJECT_DOT[project.color]}`} />
            <span className="flex-1 text-[15px]">
              {project.archived ? t("projectArchivedName", { name: project.name }) : project.name}
            </span>
            <input
              type="radio"
              name={name}
              checked={current === project.id}
              onChange={() => onChange(project.id)}
              className="size-5 accent-focus"
            />
          </label>
        ))}
        {q && !exact && (
          <button
            type="button"
            onClick={create}
            className="flex min-h-[52px] cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3.5 text-start text-[15px] font-semibold text-focus-ink"
          >
            <IconPlus className="size-[18px]" />
            <span>{t("projectPickerCreate", { name: query.trim() })}</span>
          </button>
        )}
      </div>
    </fieldset>
  );
}
