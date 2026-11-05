"use client";

import { useTranslations } from "next-intl";
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

const selectClass =
  "min-h-11 rounded-card border border-line-strong bg-surface px-2.5 text-[15px] text-ink disabled:opacity-60";

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
        <select
          value={soundId}
          disabled={!ready}
          onChange={(e) => change("soundId", e.target.value)}
          className={selectClass}
        >
          {END_SOUNDS.map((id) => (
            <option key={id} value={id}>
              {t(`names.${id}`)}
            </option>
          ))}
        </select>
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
              <select
                value={phaseIds[field] ?? ""}
                disabled={!ready}
                onChange={(e) => change(field, e.target.value)}
                className={selectClass}
              >
                <option value="">{t("sameAsEnd")}</option>
                {END_SOUNDS.map((id) => (
                  <option key={id} value={id}>
                    {t(`names.${id}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </>
      ) : null}
    </section>
  );
}
