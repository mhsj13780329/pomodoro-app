"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTasksView } from "../use-tasks-view";
import { ProjectsDialog } from "./projects-dialog";
import { ProUpsellAside, ProUpsellCard } from "./pro-upsell";
import { TaskAddForm } from "./task-add-form";
import { TaskDetails } from "./task-details";
import { TaskDoneList } from "./task-done-list";
import { NO_FILTER, TaskFilterBar, type TaskFilter } from "./task-filter-bar";
import { TaskNotice } from "./task-notice";
import { TaskRow } from "./task-row";

function Skeleton() {
  const t = useTranslations("tasks");
  return (
    <div aria-busy="true">
      <p role="status" className="sr-only">
        {t("loading")}
      </p>
      <div aria-hidden="true" className="flex animate-pulse flex-col gap-2">
        {[0, 1, 2].map((key) => (
          <div key={key} className="h-[52px] rounded-nav border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}

export function TasksScreen() {
  const t = useTranslations("tasks");
  const view = useTasksView();
  // Only one row's action bar is open at a time.
  const [openId, setOpenId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [filter, setFilter] = useState<TaskFilter>(NO_FILTER);

  const projectById = useMemo(() => new Map(view.projects.map((project) => [project.id, project])), [view.projects]);
  const tagById = useMemo(() => new Map(view.tags.map((tag) => [tag.id, tag])), [view.tags]);
  const filtering = filter.project !== "" || filter.tag !== "";
  const shown = useMemo(
    () =>
      view.active.filter((task) => {
        // A project that was deleted no longer exists, so its tasks count as having none.
        const project = task.projectId && projectById.has(task.projectId) ? task.projectId : "none";
        if (filter.project && project !== filter.project) return false;
        if (filter.tag && !task.tagIds.includes(filter.tag)) return false;
        return true;
      }),
    [view.active, filter, projectById],
  );
  // Pro users always get the bar. Someone whose Pro ended keeps it while they still have projects or tags.
  const showFilters = view.ready && (view.pro || view.projects.length > 0 || view.tags.length > 0);

  const header = view.pro
    ? t("activeCountPro", { count: view.active.length })
    : t("activeCountFree", { count: view.active.length, limit: view.limit });

  return (
    <div className="flex flex-col gap-3 md:gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-bold leading-relaxed md:text-[26px]">{t("title")}</h1>
        {view.ready && <span className="text-sm text-muted">{header}</span>}
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[1.6_1_440px] flex-col gap-3 md:gap-5">
          <div className="flex flex-col gap-2">
            <TaskAddForm disabled={view.atLimit} />
            {view.atLimit && (
              <p className="text-sm text-muted">
                {t("limitReached", { limit: view.limit })}{" "}
                <Link href="/pricing" className="font-semibold text-focus-ink underline">
                  {t("upgrade")}
                </Link>
              </p>
            )}
          </div>

          <TaskNotice />

          {showFilters && (
            <TaskFilterBar
              filter={filter}
              onChange={setFilter}
              projects={view.projects}
              tags={view.tags}
              onManageProjects={() => setProjectsOpen(true)}
            />
          )}

          {view.offline && (
            <p role="status" className="text-sm text-muted">
              {t("offline")}
            </p>
          )}

          {!view.ready ? (
            <Skeleton />
          ) : view.active.length === 0 && view.done.length === 0 ? (
            <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-[15px] leading-relaxed text-muted">
              {t("empty")}
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-2 md:gap-2.5">
                {shown.map((task, index) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    doneCount={view.counts[task.id] ?? 0}
                    current={view.current?.id === task.id}
                    first={index === 0}
                    last={index === shown.length - 1}
                    canMove={!filtering}
                    project={(task.projectId && projectById.get(task.projectId)) || null}
                    tags={task.tagIds.flatMap((id) => tagById.get(id) ?? [])}
                    subtasks={view.subtaskStats[task.id] ?? null}
                    expanded={openId === task.id}
                    onToggleExpanded={() => setOpenId((id) => (id === task.id ? null : task.id))}
                    onOpenDetails={() => {
                      setOpenId(null);
                      setDetailsId(task.id);
                    }}
                  />
                ))}
              </ul>
              {filtering && shown.length === 0 && <p className="text-sm text-muted">{t("filterEmpty")}</p>}
              <TaskDoneList tasks={view.done} />
            </>
          )}

          {view.ready && !view.pro && <ProUpsellCard />}
        </div>
        {view.ready && !view.pro && <ProUpsellAside />}
      </div>

      <TaskDetails taskId={detailsId} onClose={() => setDetailsId(null)} />
      <ProjectsDialog open={projectsOpen} onClose={() => setProjectsOpen(false)} />
    </div>
  );
}
