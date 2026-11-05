"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { IconChevron } from "@/components/icons";
import { useShallow } from "zustand/react/shallow";
import { useTimerStore, type SoundField } from "@/features/timer/store";
import { useTimerRuntime } from "@/features/timer/timer-runtime";
import { END_SOUNDS } from "@/lib/settings/catalog";
import { cardClass } from "../card";

const PHASE_FIELDS = [
  { field: "focusSoundId", label: "focus" },
  { field: "shortBreakSoundId", label: "shortBreak" },
  { field: "longBreakSoundId", label: "longBreak" },
] as const;

/** A native select with the browser arrow hidden and our own chevron inset from the edge. */
function SoundSelect(props: ComponentProps<"select">) {
  return (
    <span className="relative inline-flex shrink-0">
      <select
        {...props}
        className="min-h-11 cursor-pointer appearance-none rounded-pill border border-line-strong bg-surface ps-4 pe-10 text-[15px] font-semibold text-ink disabled:cursor-default disabled:opacity-60"
      />
      <IconChevron className="pointer-events-none absolute end-3.5 top-1/2 size-4 -translate-y-1/2 rotate-90 text-muted" />
    </span>
  );
}

export function SoundSettings({ pro = false }: { pro?: boolean }) {
  const t = useTranslations("settings.sounds");
  const { ready } = useTimerRuntime();
  const soundId = useTimerStore((s) => s.soundId);
  const phaseIds = useTimerStore(
    useShallow((s) => ({
      focusSoundId: s.focusSoundId,
      shortBreakSoundId: s.shortBreakSoundId,
      longBreakSoundId: s.longBreakSoundId,
    })),
  );

  const change = (field: SoundField, value: string) => {
    if (!ready) return;
    useTimerStore.getState().setSound(field, value === "" ? null : value);
  };

  return (
    <section className={cardClass}>
      <h2 className="mb-1.5 text-base font-bold md:text-lg">{t("title")}</h2>
      <label className="flex min-h-[52px] items-center justify-between gap-3 md:min-h-14">
        <span className="text-[15px] md:text-base">{t("endSound")}</span>
        <SoundSelect
          value={soundId}
          disabled={!ready}
          onChange={(e) => change("soundId", e.target.value)}
        >
          {END_SOUNDS.map((id) => (
            <option key={id} value={id}>
              {t(`names.${id}`)}
            </option>
          ))}
        </SoundSelect>
      </label>
      {/* Per-phase sounds are listed with the other Pro features for a free account. */}
      {pro ? (
        <>
          <h3 className="mt-1 border-t border-line pt-2 text-[13px] font-semibold text-muted">
            {t("perPhase")}
          </h3>
          {PHASE_FIELDS.map(({ field, label }) => (
            <label
              key={field}
              className="flex min-h-[52px] items-center justify-between gap-3"
            >
              <span className="text-[15px]">{t(label)}</span>
              <SoundSelect
                value={phaseIds[field] ?? ""}
                disabled={!ready}
                onChange={(e) => change(field, e.target.value)}
                    >
                <option value="">{t("sameAsEnd")}</option>
                {END_SOUNDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`names.${id}`)}
                  </option>
                ))}
              </SoundSelect>
            </label>
          ))}
        </>
      ) : null}
    </section>
  );
}
