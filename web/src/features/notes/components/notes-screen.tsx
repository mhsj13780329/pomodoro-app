"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { IconCheck, IconLock, IconPlus, IconTrash } from "@/components/icons";
import { useTasksStore } from "@/features/tasks/store";
import { Link } from "@/i18n/navigation";
import type { NoteWire } from "@/lib/notes/contract";
import { noteDate } from "../format";
import { IconSearch, IconTaskLink } from "../icon";
import { useNotesStore } from "../store";
import { useNotesSync } from "../use-notes-sync";
import { NoteEditor } from "./note-editor";

const DESKTOP = "(min-width: 768px)";
function useDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia(DESKTOP);
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => false,
  );
}

function ProTag() {
  const t = useTranslations("notes");
  return (
    <span className="flex min-h-6 items-center rounded-tab bg-pro-bg px-2.5 text-[12px] font-semibold text-pro-ink md:min-h-[26px] md:px-3 md:text-[13px]">
      {t("proTag")}
    </span>
  );
}

const BENEFITS = ["benefitUnlimited", "benefitLink", "benefitSearch", "benefitSync"] as const;

/** What a free user (or a guest) sees: blurred placeholder cards and the pitch. */
function Locked() {
  const t = useTranslations("notes");
  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col md:mt-6">
      <div aria-hidden="true" className="mt-4 flex flex-col gap-2.5 opacity-50 blur-[1px]">
        {[
          ["55%", "90%", "70%"],
          ["40%", "85%"],
        ].map((lines, k) => (
          <div key={k} className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3.5">
            {lines.map((width, i) => (
              <span
                key={i}
                style={{ width }}
                className={i === 0 ? "h-3 rounded-md bg-line-strong" : "h-2.5 rounded-[5px] bg-line"}
              />
            ))}
          </div>
        ))}
      </div>
      <section className="mt-5 flex flex-col items-center gap-3 rounded-feature border border-line bg-surface px-5 py-6 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-pro-bg text-pro-ink">
          <IconLock className="size-[26px]" />
        </span>
        <h2 className="text-[19px] leading-[1.6] font-bold">{t("lockedTitle")}</h2>
        <p className="text-[14px] leading-[1.9] text-muted">{t("lockedBody")}</p>
        <ul className="mt-1 flex flex-col gap-2 self-stretch text-start text-[14px]">
          {BENEFITS.map((key) => (
            <li key={key} className="flex items-center gap-2.5">
              <IconCheck className="size-[18px] flex-none text-short" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <Link
          href="/pricing"
          className="mt-2 flex min-h-[52px] items-center justify-center self-stretch rounded-[26px] bg-focus text-base font-bold text-white"
        >
          {t("upgrade")}
        </Link>
      </section>
    </div>
  );
}

/** `userId` and `pro` come from the server (loadProStatus); after the first pull the store's Pro wins. */
export function NotesScreen({ userId, pro: serverPro }: { userId: string | null; pro: boolean }) {
  useNotesSync(userId, serverPro);
  return <NotesBody signedIn={userId !== null} serverPro={serverPro} />;
}

function matches(note: NoteWire, query: string) {
  if (!query) return true;
  return note.title.toLocaleLowerCase().includes(query) || note.body.toLocaleLowerCase().includes(query);
}

function NotesBody({ signedIn, serverPro }: { signedIn: boolean; serverPro: boolean }) {
  const t = useTranslations("notes");
  const desktop = useDesktop();
  const rows = useNotesStore((s) => s.notes);
  const storePro = useNotesStore((s) => s.pro);
  const loaded = useNotesStore((s) => s.loaded);
  const [openId, setOpenId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** Phone: a note the user deleted that can still be brought back. It is removed for real on leaving. */
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const pro = loaded ? storePro : serverPro;
  const all = useMemo(
    () =>
      Object.values(rows)
        .filter((note) => note.id !== pendingDelete)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [rows, pendingDelete],
  );
  const needle = query.trim().toLocaleLowerCase();
  const visible = useMemo(() => all.filter((note) => matches(note, needle)), [all, needle]);

  // An empty new note that the user leaves is thrown away.
  const previous = useRef<string | null>(openId);
  useEffect(() => {
    if (previous.current && previous.current !== openId) useNotesStore.getState().discardEmpty(previous.current);
    previous.current = openId;
  }, [openId]);

  // Leaving the page finishes a pending delete and drops empty drafts.
  const pendingRef = useRef(pendingDelete);
  useEffect(() => {
    pendingRef.current = pendingDelete;
  }, [pendingDelete]);
  useEffect(
    () => () => {
      if (pendingRef.current) useNotesStore.getState().remove(pendingRef.current);
      if (previous.current) useNotesStore.getState().discardEmpty(previous.current);
    },
    [],
  );

  const finishDelete = () => {
    if (pendingDelete) useNotesStore.getState().remove(pendingDelete);
    setPendingDelete(null);
    setOpenId(null);
  };

  const create = () => {
    const id = useNotesStore.getState().create();
    if (id === "pro_required") return;
    setQuery("");
    setOpenId(id);
  };

  const header = (
    <div className="flex min-h-11 flex-wrap items-center gap-2.5 md:gap-3">
      <h1 className="text-[22px] font-bold md:text-[26px]">{t("title")}</h1>
      <ProTag />
      <span className="flex-1" />
      {signedIn && loaded && pro && (
        <>
          <button
            type="button"
            onClick={create}
            aria-label={t("new")}
            className="flex size-11 cursor-pointer items-center justify-center rounded-full bg-focus text-white md:hidden"
          >
            <IconPlus className="size-[22px]" />
          </button>
          <button
            type="button"
            onClick={create}
            className="hidden min-h-[52px] cursor-pointer items-center gap-2 rounded-control bg-focus px-[22px] text-base font-semibold text-white md:flex"
          >
            <IconPlus className="size-5" />
            <span>{t("new")}</span>
          </button>
        </>
      )}
    </div>
  );

  if (!signedIn || (loaded && !pro && all.length === 0)) {
    return (
      <div className="flex flex-col pb-6">
        {header}
        <Locked />
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex flex-col">
        {header}
        <div aria-busy="true" className="mt-4 flex animate-pulse flex-col gap-2.5">
          {[0, 1, 2].map((k) => (
            <div key={k} className="h-24 rounded-card border border-line bg-surface" />
          ))}
        </div>
      </div>
    );
  }

  const readOnlyBanner = !pro && (
    <p role="status" className="mt-3 rounded-card border border-line bg-surface p-3.5 text-[14px]">
      {t("readOnly")}{" "}
      <Link href="/pricing" className="font-semibold text-focus-ink underline">
        {t("renew")}
      </Link>
    </p>
  );

  const search = (
    <div className="relative">
      <label htmlFor="note-search" className="sr-only">
        {t("searchLabel")}
      </label>
      <IconSearch className="pointer-events-none absolute start-3.5 top-3.5 size-5 text-muted" />
      <input
        id="note-search"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={desktop ? t("searchShort") : t("searchPlaceholder")}
        className="min-h-12 w-full rounded-nav border border-line-strong bg-surface ps-11 pe-3.5 text-[15px] text-ink placeholder:text-muted md:bg-ground"
      />
    </div>
  );

  const count = <div className="text-[13px] text-muted">{t("count", { count: all.length })}</div>;

  const emptyList = all.length === 0 ? t("empty") : visible.length === 0 ? (desktop ? t("noMatchShort") : t("noMatch")) : null;

  // Phone, after a delete: the undo state.
  if (!desktop && pendingDelete) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-muted">
          <IconTrash className="size-7" />
        </span>
        <h2 role="status" className="text-[18px] font-bold">
          {t("deleted")}
        </h2>
        <p className="text-[14px] leading-[1.8] text-muted">{t("undoHint")}</p>
        <div className="mt-2 flex gap-2.5">
          <button
            type="button"
            onClick={() => setPendingDelete(null)}
            className="min-h-12 cursor-pointer rounded-control border border-line-strong bg-surface px-5 text-[15px] font-semibold text-ink"
          >
            {t("undo")}
          </button>
          <button
            type="button"
            onClick={finishDelete}
            className="min-h-12 cursor-pointer rounded-control bg-focus px-5 text-[15px] font-semibold text-white"
          >
            {t("allNotes")}
          </button>
        </div>
      </div>
    );
  }

  // Phone, a note is open: the editor fills the screen.
  const open = openId ? rows[openId] : undefined;
  if (!desktop && open) {
    return (
      <div className="flex flex-1 flex-col pb-4">
        <NoteEditor
          key={open.id}
          note={open}
          readOnly={!pro}
          desktop={false}
          onBack={() => setOpenId(null)}
          onDeleted={() => setPendingDelete(open.id)}
        />
      </div>
    );
  }

  if (!desktop) {
    return (
      <div className="flex flex-col pb-4">
        {header}
        {count}
        {readOnlyBanner}
        <div className="mt-2.5">{search}</div>
        <ul className="mt-3 flex flex-col gap-2.5">
          {visible.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} onOpen={() => setOpenId(note.id)} />
            </li>
          ))}
        </ul>
        {emptyList && <p className="px-4 py-8 text-center text-[14px] text-muted">{emptyList}</p>}
      </div>
    );
  }

  // Desktop: list and editor side by side.
  const selected = (openId && rows[openId]) || visible[0] || null;
  return (
    <div className="flex flex-col gap-6">
      {header}
      {readOnlyBanner}
      <div className="flex flex-wrap items-stretch gap-6">
        <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-panel border border-line bg-surface p-4">
          {search}
          {count}
          <ul className="flex flex-col gap-2">
            {visible.map((note) => (
              <li key={note.id}>
                <NoteCard note={note} desktop selected={note.id === selected?.id} onOpen={() => setOpenId(note.id)} />
              </li>
            ))}
          </ul>
          {emptyList && <p className="px-2 py-6 text-center text-[14px] text-muted">{emptyList}</p>}
        </section>
        <section className="flex min-h-[600px] min-w-0 flex-[1.8_1_460px] flex-col rounded-feature border border-line bg-surface px-7 py-6">
          {selected ? (
            <NoteEditor
              key={selected.id}
              note={selected}
              readOnly={!pro}
              desktop
              onDeleted={() => {
                useNotesStore.getState().remove(selected.id);
                setOpenId(null);
              }}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <span className="flex size-16 items-center justify-center rounded-full bg-surface-2 text-muted">
                <IconNotePage />
              </span>
              <h2 className="text-[18px] font-bold">{t("noneSelected")}</h2>
              <p className="text-[14px] text-muted">{t("noneSelectedHint")}</p>
              {pro && (
                <button
                  type="button"
                  onClick={create}
                  className="min-h-12 cursor-pointer rounded-control border border-line-strong bg-ground px-5 text-[15px] font-semibold text-ink"
                >
                  {t("new")}
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function IconNotePage() {
  return (
    <svg className="size-7" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 3v6h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function NoteCard({
  note,
  desktop = false,
  selected = false,
  onOpen,
}: {
  note: NoteWire;
  desktop?: boolean;
  selected?: boolean;
  onOpen: () => void;
}) {
  const t = useTranslations("notes");
  const locale = useLocale();
  const task = useTasksStore((s) => (note.taskId ? s.tasks[note.taskId] : undefined));
  const live = task && task.deletedAt == null ? task : undefined;
  const date = noteDate(note.updatedAt, locale, { today: (time) => t("today", { time }), yesterday: t("yesterday") });

  const look = desktop
    ? `rounded-control gap-1 px-3.5 py-3 ${selected ? "border-2 border-focus bg-surface" : "border border-line bg-ground"}`
    : "rounded-card gap-1.5 border border-line bg-surface px-4 py-3.5";

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={desktop ? selected : undefined}
      className={`flex w-full cursor-pointer flex-col items-stretch text-start text-ink ${look}`}
    >
      <span dir="auto" className="truncate text-[15px] font-semibold">
        {note.title.trim() || t("untitled")}
      </span>
      <span dir="auto" className="line-clamp-2 text-[13px] leading-[1.8] text-muted">
        {note.body.trim() || t("emptyBody")}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-muted">{date}</span>
        {live && (
          <span className="inline-flex max-w-full items-center gap-1 rounded-lg bg-focus-soft px-2 text-[12px] font-medium text-focus-ink">
            {!desktop && <IconTaskLink className="size-3 shrink-0" />}
            <span dir="auto" className="truncate">
              {live.title}
            </span>
          </span>
        )}
      </span>
    </button>
  );
}
