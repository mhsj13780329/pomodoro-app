"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { APP_NAME } from "@/config/brand";
import {
  IconLogo,
  IconNavSettings,
  IconNavStats,
  IconNavTasks,
  IconNavTimer,
} from "@/components/icons";
import { Link, usePathname } from "@/i18n/navigation";
import { IconNavNotes } from "@/features/notes/icon";
import { SyncRoot } from "@/features/auth/components/sync-root";
import { useTasksStore } from "@/features/tasks/store";
import { TimerRuntime } from "@/features/timer/timer-runtime";

const links = [
  { href: "/", labelKey: "timer", icon: IconNavTimer },
  { href: "/tasks", labelKey: "tasks", icon: IconNavTasks },
  { href: "/notes", labelKey: "notes", icon: IconNavNotes },
  { href: "/stats", labelKey: "stats", icon: IconNavStats },
  { href: "/settings", labelKey: "settings", icon: IconNavSettings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <>
      <SyncRoot />
      <TimerRuntime>
        <div className="flex min-h-dvh flex-col bg-ground md:flex-row">
          <DesktopNav />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-1 flex-col px-4 pt-4 md:px-8 md:py-7">{children}</div>
            <PhoneNav />
          </div>
        </div>
      </TimerRuntime>
    </>
  );
}

function DesktopNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const tasks = useTranslations("tasks");
  const pricing = useTranslations("pricing");
  const pro = useTasksStore((st) => st.pro);
  return (
    <aside className="hidden w-60 shrink-0 flex-col gap-1.5 border-e border-line bg-surface px-4 py-5 md:flex">
      <div className="mb-3 flex min-h-12 items-center gap-2.5 px-2">
        <span className="flex size-9 items-center justify-center rounded-full bg-focus text-white">
          <IconLogo className="size-5" />
        </span>
        <span className="text-xl font-bold">{APP_NAME}</span>
      </div>
      <nav className="flex flex-col gap-1" aria-label={t("menu")}>
        {links.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-nav px-3.5 text-[15px] ${
                active ? "bg-focus-soft font-semibold text-focus-ink" : "text-muted"
              }`}
            >
              <Icon className="size-[22px]" />
              <span>{t(link.labelKey)}</span>
            </Link>
          );
        })}
      </nav>
      <div className="min-h-6 flex-1" />
      {!pro && (
        <Link href="/pricing" className="flex flex-col gap-1 rounded-sheet bg-pro-bg p-3.5 text-pro-ink">
          <span className="text-[15px] font-bold">{tasks("upgrade")}</span>
          <span className="text-[13px] leading-relaxed">{pricing("headline")}</span>
        </Link>
      )}
    </aside>
  );
}

function PhoneNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav className="border-t border-line bg-surface md:hidden" aria-label={t("menu")}>
      <div className="flex px-2">
        {links.map((link) => {
          const active = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs ${
                active ? "font-semibold text-focus" : "text-muted"
              }`}
            >
              <Icon className="size-6" />
              <span>{t(link.labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
