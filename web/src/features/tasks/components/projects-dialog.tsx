"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog } from "@/components/dialog";
import { IconChevron, IconPencil, IconPlus, IconTrash } from "@/components/icons";
import type { ProjectWire } from "@/lib/tasks/contract";
import { PROJECT_DOT } from "../palette";
import { useTasksStore } from "../store";
import type { ProjectStats } from "../use-tasks-view";
import { ProLock } from "./pro-lock";
import { secondaryButton } from "./styles";

type Props = {
  open: boolean;
  onClose: () => void;
  stats: Record<string, ProjectStats>;
  /** Show this project's tasks. */
  onOpenProject: (id: string) => void;
  onNew: () => void;
  onEdit: (project: ProjectWire) => void;
  onDelete: (project: ProjectWire) => void;
};

const iconButton =
  "flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-nav border-0 bg-transparent text-muted disabled:cursor-not-allowed disabled:opacity-40";

function Row({
  project,
  stats,
  locked,
  onOpen,
  onEdit,
  onDelete,
}: {
  project: ProjectWire;
  stats: ProjectStats | undefined;
  locked: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("tasks");
  const active = stats?.active ?? 0;
  const done = stats?.done ?? 0;
  const share = active + done === 0 ? 0 : Math.round((done / (active + done)) * 100);
  return (
    <li className="flex items-center gap-1 rounded-card border border-line bg-surface pe-1">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[68px] min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 bg-transparent ps-3 text-start text-ink"
      >
        <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-nav bg-ground">
          <span className={`size-3.5 rounded-[4px] ${PROJECT_DOT[project.color]}`} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] font-bold">{project.name}</span>
          <span className="text-xs text-muted">
            {t("projectListMeta", {
              active,
              done,
              sessions: stats?.sessions ?? 0,
            })}
          </span>
          <span aria-hidden="true" className="flex h-1 overflow-hidden rounded-full bg-ground">
            <span className={PROJECT_DOT[project.color]} style={{ width: `${share}%` }} />
          </span>
        </span>
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={onEdit}
        aria-label={t("projectEditTitle", { name: project.name })}
        className={iconButton}
      >
        <IconPencil className="size-[18px]" />
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={onDelete}
        aria-label={t("projectRemoveLabel", { name: project.name })}
        className={iconButton}
      >
        <IconTrash className="size-[18px]" />
      </button>
    </li>
  );
}

function Body({ onClose, stats, onOpenProject, onNew, onEdit, onDelete }: Omit<Props, "open">) {
  const t = useTranslations("tasks");
  const pro = useTasksStore((state) => state.pro);
  const rows = useTasksStore((state) => state.projects);
  const [showArchived, setShowArchived] = useState(false);
  const sorted = useMemo(
    () => Object.values(rows).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [rows],
  );
  const live = sorted.filter((project) => !project.archived);
  const archived = sorted.filter((project) => project.archived);
  const locked = !pro;

  const open = (id: string) => {
    onOpenProject(id);
    onClose();
  };

  return (
    <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
      {locked && (
        <div className="flex flex-col items-start gap-2 rounded-nav bg-pro-bg px-3.5 py-2.5 text-sm leading-relaxed text-pro-ink">
          <p>{t("proOnly")}</p>
          <ProLock label={t("upgrade")} />
        </div>
      )}

      {pro && (
        <button
          type="button"
          onClick={onNew}
          className="flex min-h-11 cursor-pointer items-center justify-center gap-1.5 self-start rounded-pill border-0 bg-focus px-4 text-sm font-bold text-white"
        >
          <IconPlus className="size-4" />
          <span>{t("projectNew")}</span>
        </button>
      )}

      {live.length === 0 ? (
        <p className="text-sm text-muted">{t("projectsEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {live.map((project) => (
            <Row
              key={project.id}
              project={project}
              stats={stats[project.id]}
              locked={locked}
              onOpen={() => open(project.id)}
              onEdit={() => onEdit(project)}
              onDelete={() => onDelete(project)}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-expanded={showArchived}
            onClick={() => setShowArchived((value) => !value)}
            className="flex min-h-11 cursor-pointer items-center gap-2 self-start border-0 bg-transparent px-1 text-sm font-semibold text-muted"
          >
            <IconChevron className={`size-4 transition-transform ${showArchived ? "rotate-90" : "rtl:rotate-180"}`} />
            <span>{t("projectArchivedHeading", { count: archived.length })}</span>
          </button>
          {showArchived && (
            <ul className="flex flex-col gap-2">
              {archived.map((project) => (
                <li key={project.id} className="flex items-center gap-3 rounded-card bg-ground px-3.5 py-2">
                  <span
                    aria-hidden="true"
                    className={`size-3.5 shrink-0 rounded-[4px] opacity-60 ${PROJECT_DOT[project.color]}`}
                  />
                  <button
                    type="button"
                    onClick={() => open(project.id)}
                    className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center border-0 bg-transparent text-start text-ink"
                  >
                    <span className="truncate text-[15px] font-semibold">{project.name}</span>
                    <span className="text-xs text-muted">
                      {t("projectListMeta", {
                        active: stats[project.id]?.active ?? 0,
                        done: stats[project.id]?.done ?? 0,
                        sessions: stats[project.id]?.sessions ?? 0,
                      })}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => useTasksStore.getState().updateProject(project.id, { archived: false })}
                    className={`${secondaryButton} rounded-pill bg-surface`}
                  >
                    {t("projectUnarchive")}
                  </button>
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => onDelete(project)}
                    aria-label={t("projectRemoveLabel", { name: project.name })}
                    className={iconButton}
                  >
                    <IconTrash className="size-[18px]" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="button" onClick={onClose} className={`${secondaryButton} w-full`}>
        {t("close")}
      </button>
    </div>
  );
}

/** Every project with its numbers: open one, edit, delete, and archived ones folded away. */
export function ProjectsDialog({ open, onClose, ...rest }: Props) {
  const t = useTranslations("tasks");
  return (
    <Dialog open={open} onClose={onClose} title={t("projectsTitle")}>
      <Body onClose={onClose} {...rest} />
    </Dialog>
  );
}
