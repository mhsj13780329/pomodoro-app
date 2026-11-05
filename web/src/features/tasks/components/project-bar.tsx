"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { IconLock, IconPlus } from "@/components/icons";
import type { ProjectWire } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { NO_PROJECT, type ProjectStats } from "../use-tasks-view";

/** "" = every project, "none" = tasks without one, otherwise a project id. */
export type ProjectFilter = string;

type Props = {
  projects: ProjectWire[];
  stats: Record<string, ProjectStats>;
  /** Active tasks in total, for the "All" button. */
  total: number;
  selected: ProjectFilter;
  onSelect: (next: ProjectFilter) => void;
  pro: boolean;
  onManage: () => void;
  onNew: () => void;
  /** A free account with no projects gets a locked button that explains Pro. */
  onLocked: () => void;
};

// Phone: a row of pill buttons that scrolls sideways. Desktop: a list in a side card.
const item =
  "flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-pill border px-3.5 text-sm md:w-full md:rounded-nav md:border-transparent md:px-3 md:text-[15px]";
const on = "border-ink bg-ink font-semibold text-surface md:bg-ground md:font-bold md:text-ink";
const off = "border-line bg-surface font-medium text-ink md:bg-transparent";

export function ProjectBar({ projects, stats, total, selected, onSelect, pro, onManage, onNew, onLocked }: Props) {
  const t = useTranslations("tasks");
  const locked = !pro && projects.length === 0;

  const button = (id: ProjectFilter, label: string, count: number, dot: ReactNode) => (
    <button
      key={id || "all"}
      type="button"
      aria-pressed={selected === id}
      onClick={() => onSelect(id)}
      className={`${item} ${selected === id ? on : off}`}
    >
      {dot}
      <span className="md:flex-1 md:text-start">{label}</span>
      {/* Keeps "Thesis 2" apart in the accessible name; flex layout ignores it visually. */}{" "}
      <span className="text-xs opacity-80 md:text-[13px] md:text-muted md:opacity-100">{t("count", { count })}</span>
    </button>
  );

  return (
    <nav
      aria-label={t("projectsBarLabel")}
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:w-64 md:shrink-0 md:flex-col md:gap-1 md:self-start md:overflow-visible md:rounded-panel md:border md:border-line md:bg-surface md:p-3"
    >
      <div className="hidden min-h-11 items-center justify-between ps-2 md:flex">
        <h2 className="text-base font-bold">{t("projectsTitle")}</h2>
        {pro && (
          <button
            type="button"
            onClick={onNew}
            aria-label={t("projectNew")}
            className="flex size-10 cursor-pointer items-center justify-center rounded-nav border-0 bg-focus-soft text-focus-ink"
          >
            <IconPlus className="size-[18px]" />
          </button>
        )}
      </div>

      {button("", t("all"), total, <span aria-hidden="true" className="hidden size-3 rounded-[4px] bg-ink md:block" />)}

      {locked ? (
        <button type="button" onClick={onLocked} className={`${item} ${off} border-dashed border-line-strong`}>
          <IconLock className="size-3.5 text-pro-ink" />
          <span>{t("proProjects")}</span>
          <span className="rounded-lg bg-pro-bg px-1.5 text-[11px] font-bold text-pro-ink">{t("proBadge")}</span>
        </button>
      ) : (
        <>
          {button(
            NO_PROJECT,
            t("projectNone"),
            stats[NO_PROJECT]?.active ?? 0,
            <span aria-hidden="true" className="size-3 shrink-0 rounded-[4px] border-2 border-line-strong" />,
          )}
          {projects.map((project) =>
            button(
              project.id,
              project.archived ? t("projectArchivedName", { name: project.name }) : project.name,
              stats[project.id]?.active ?? 0,
              <span
                aria-hidden="true"
                className={`size-3 shrink-0 rounded-full md:rounded-[4px] ${PROJECT_DOT[project.color]}`}
              />,
            ),
          )}
          <span aria-hidden="true" className="mx-2 my-1 hidden h-px bg-line md:block" />
          <button
            type="button"
            onClick={onManage}
            className={`${item} border-dashed border-line-strong bg-transparent font-medium text-muted`}
          >
            <span>{t("manageProjects")}</span>
          </button>
        </>
      )}
    </nav>
  );
}
