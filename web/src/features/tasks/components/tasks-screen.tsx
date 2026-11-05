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
import type { ProjectWire } from "@/lib/tasks/contract";
import { NO_PROJECT } from "../use-tasks-view";
import { ProjectBar, type ProjectFilter } from "./project-bar";
import { ProjectDelete } from "./project-delete";
import { ProjectEditor } from "./project-editor";
import { ProjectHeader } from "./project-header";
import { ProjectsUpsell } from "./projects-upsell";
import { TaskFilterBar } from "./task-filter-bar";
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
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>("");
  const [tagFilter, setTagFilter] = useState("");
  // The project editor: closed, a new project, or an existing one.
  const [editing, setEditing] = useState<{ project: ProjectWire | null } | null>(null);
  const [deleting, setDeleting] = useState<ProjectWire | null>(null);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const projectById = useMemo(() => new Map(view.projects.map((project) => [project.id, project])), [view.projects]);
  const tagById = useMemo(() => new Map(view.tags.map((tag) => [tag.id, tag])), [view.tags]);
  // A selected project that is gone (deleted here or on another device) falls back to "All".
  const filter = {
    project: projectFilter && projectFilter !== NO_PROJECT && !projectById.has(projectFilter) ? "" : projectFilter,
    tag: tagFilter,
  };
  const selectedProject = (filter.project && projectById.get(filter.project)) || null;
  const filtering = filter.project !== "" || filter.tag !== "";
  const shown = useMemo(
    () =>
      view.active.filter((task) => {
        // A project that was deleted no longer exists, so its tasks count as having none.
        const project = task.projectId && projectById.has(task.projectId) ? task.projectId : NO_PROJECT;
        if (filter.project && project !== filter.project) return false;
        if (filter.tag && !task.tagIds.includes(filter.tag)) return false;
        return true;
      }),
    [view.active, filter.project, filter.tag, projectById],
  );
  // Archived projects stay out of the bar unless one is the current selection.
  const barProjects = useMemo(
    () => view.projects.filter((project) => !project.archived || project.id === filter.project),
    [view.projects, filter.project],
  );
  // Shown while there are tags, so someone whose Pro ended can still filter by the ones they have.
  const showTagFilter = view.ready && view.tags.length > 0;

  const header = view.pro
    ? t("activeCountPro", { count: view.active.length })
    : t("activeCountFree", { count: view.active.length, limit: view.limit });

  return (
    <div className="flex flex-col gap-3 md:gap-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-bold leading-relaxed md:text-[26px]">{t("title")}</h1>
        {view.ready && <span className="text-sm text-muted">{header}</span>}
      </div>

      {/* Phone: the project buttons sit above everything. Desktop: they become a side column. */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:gap-6">
        {view.ready && (
          <ProjectBar
            projects={barProjects}
            stats={view.projectStats}
            total={view.active.length}
            selected={filter.project}
            onSelect={(next) => {
              setProjectFilter(next);
              setOpenId(null);
            }}
            pro={view.pro}
            onManage={() => setProjectsOpen(true)}
            onNew={() => setEditing({ project: null })}
            onLocked={() => setUpsellOpen(true)}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[1.6_1_440px] flex-col gap-3 md:gap-5">
            {selectedProject && (
              <ProjectHeader
                project={selectedProject}
                stats={view.projectStats[selectedProject.id]}
                pro={view.pro}
                onEdit={() => setEditing({ project: selectedProject })}
                onDelete={() => setDeleting(selectedProject)}
              />
            )}
            <div className="flex flex-col gap-2">
              <TaskAddForm disabled={view.atLimit} project={view.pro ? selectedProject : null} />
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

            {showTagFilter && <TaskFilterBar tag={filter.tag} onChange={setTagFilter} tags={view.tags} />}

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
                {filtering && shown.length === 0 && (
                  <p className="rounded-card border border-dashed border-line-strong px-4 py-6 text-center text-sm leading-relaxed text-muted">
                    {selectedProject && !filter.tag && view.pro ? t("projectEmptyHere") : t("filterEmpty")}
                  </p>
                )}
                <TaskDoneList tasks={view.done} />
              </>
            )}

            {view.ready && !view.pro && <ProUpsellCard />}
          </div>
          {view.ready && !view.pro && <ProUpsellAside />}
        </div>
      </div>

      <TaskDetails taskId={detailsId} onClose={() => setDetailsId(null)} />
      <ProjectsDialog
        open={projectsOpen}
        onClose={() => setProjectsOpen(false)}
        stats={view.projectStats}
        onOpenProject={setProjectFilter}
        onNew={() => setEditing({ project: null })}
        onEdit={(project) => setEditing({ project })}
        onDelete={setDeleting}
      />
      <ProjectEditor
        open={editing !== null}
        project={editing?.project ?? null}
        onClose={() => setEditing(null)}
        // A new project opens straight away, ready for its first task.
        onSaved={(id) => {
          if (!editing?.project) setProjectFilter(id);
        }}
      />
      <ProjectDelete
        project={deleting}
        stats={deleting ? view.projectStats[deleting.id] : undefined}
        onClose={() => setDeleting(null)}
        onDeleted={() => {
          if (deleting && filter.project === deleting.id) setProjectFilter("");
        }}
      />
      <ProjectsUpsell open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </div>
  );
}
