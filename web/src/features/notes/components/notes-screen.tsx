"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useNotesStore } from "../store";
import { useNotesSync } from "../use-notes-sync";
import { NoteEditor } from "./note-editor";

const card = "rounded-card border border-line bg-surface p-3.5";
const cta = "mt-3 flex min-h-12 items-center justify-center rounded-pill bg-focus px-5 text-[15px] font-bold text-white";

function Locked({ signedIn }: { signedIn: boolean }) {
  const t = useTranslations("notes");
  const tasks = useTranslations("tasks");
  const auth = useTranslations("auth");
  return (
    <section className={card}>
      <p className="text-[15px]">{t("proRequired")}</p>
      {signedIn ? (
        <Link href="/pricing" className={cta}>
          {tasks("upgrade")}
        </Link>
      ) : (
        <Link href="/login" className={cta}>
          {auth("loginSync")}
        </Link>
      )}
    </section>
  );
}

/** `userId` and `pro` come from the server (loadProStatus); after the first pull the store's Pro wins. */
export function NotesScreen({ userId, pro: serverPro }: { userId: string | null; pro: boolean }) {
  useNotesSync(userId, serverPro);
  return <NotesBody signedIn={userId !== null} serverPro={serverPro} />;
}

function NotesBody({ signedIn, serverPro }: { signedIn: boolean; serverPro: boolean }) {
  const t = useTranslations("notes");
  const rows = useNotesStore((s) => s.notes);
  const storePro = useNotesStore((s) => s.pro);
  const loaded = useNotesStore((s) => s.loaded);
  const [picked, setPicked] = useState<string | null>(null);

  const list = useMemo(
    () => Object.values(rows).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [rows],
  );
  const pro = loaded ? storePro : serverPro;
  const selected = (picked && rows[picked]) || list[0] || null;

  let content;
  if (!signedIn) content = <Locked signedIn={false} />;
  else if (!loaded) {
    content = (
      <div aria-busy="true" className="flex animate-pulse flex-col gap-2">
        {[0, 1, 2].map((k) => (
          <div key={k} className="h-[52px] rounded-nav border border-line bg-surface" />
        ))}
      </div>
    );
  } else if (!pro && list.length === 0) content = <Locked signedIn />;
  else {
    content = (
      <>
        {!pro && (
          <p role="status" className={`${card} mb-3 text-[14px]`}>
            {t("readOnly")}
          </p>
        )}
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="flex w-full shrink-0 flex-col gap-2 md:w-64">
            {pro && (
              <button
                type="button"
                className="min-h-11 cursor-pointer rounded-nav bg-focus px-4 text-sm font-bold text-white"
                onClick={() => {
                  const id = useNotesStore.getState().create();
                  if (id !== "pro_required") setPicked(id);
                }}
              >
                {t("new")}
              </button>
            )}
            {list.length === 0 && <p className="text-[14px] text-muted">{t("empty")}</p>}
            <ul className="flex flex-col gap-1.5">
              {list.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    aria-current={selected?.id === note.id ? "true" : undefined}
                    onClick={() => setPicked(note.id)}
                    className={`flex min-h-11 w-full cursor-pointer items-center rounded-nav border px-3 text-start text-[15px] ${
                      selected?.id === note.id ? "border-focus bg-focus-soft font-semibold" : "border-line bg-surface"
                    }`}
                  >
                    <span className="truncate">{note.title || t("untitled")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {selected && (
            <NoteEditor
              key={selected.id}
              note={selected}
              readOnly={!pro}
              onDelete={() => {
                useNotesStore.getState().remove(selected.id);
                setPicked(null);
              }}
            />
          )}
        </div>
      </>
    );
  }

  return (
    <div className="flex flex-col">
      <h1 className="flex min-h-11 items-center text-[22px] font-bold">{t("title")}</h1>
      {content}
    </div>
  );
}
