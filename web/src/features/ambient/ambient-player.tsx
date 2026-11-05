"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { IconChevron, IconLock, IconPause, IconPlay } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import {
  FREE_AMBIENT,
  AMBIENT_TRACKS,
  MAX_MIX_TRACKS,
  type AmbientMixEntry,
} from "@/lib/settings/catalog";
import {
  DEFAULT_VOLUME,
  isMixFull,
  isSelectable,
  playlistOf,
  setMixVolume,
  toggleInMix,
} from "./mix";
import { useAmbientStore } from "./store";
import { AMBIENT_URLS } from "./tracks";

/**
 * Ambient sound player and mixer. `pro` says whether this account may change the library and the mix.
 * Playback starts only from a click, and the playing state stays on this device.
 */
export function AmbientPlayer({ pro = false }: { pro?: boolean }) {
  const t = useTranslations("ambient");
  const {
    ambientId,
    ambientMix,
    singleVolume,
    playing,
    setSelection,
    setSingleVolume,
    setPlaying,
  } = useAmbientStore();
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const audios = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    void Promise.resolve(useAmbientStore.persist.rehydrate()).then(() =>
      setHydrated(true),
    );
    const map = audios.current;
    return () => {
      for (const audio of map.values()) audio.pause();
      map.clear();
      useAmbientStore.getState().setPlaying(false);
    };
  }, []);

  const list = hydrated ? playlistOf(ambientId, ambientMix, singleVolume) : [];
  const listKey = JSON.stringify(list);

  // Keep the audio elements in step with the list. play() is only reached after the user pressed Play.
  useEffect(() => {
    const map = audios.current;
    const wanted = new Set(list.map((e) => e.id));
    for (const [id, audio] of map) {
      if (!wanted.has(id)) {
        audio.pause();
        map.delete(id);
      }
    }
    for (const entry of list) {
      let audio = map.get(entry.id);
      if (!audio) {
        audio = new Audio(AMBIENT_URLS[entry.id as keyof typeof AMBIENT_URLS]);
        audio.loop = true;
        audio.preload = "auto";
        map.set(entry.id, audio);
      }
      audio.volume = entry.volume;
      if (playing && audio.paused) audio.play().catch(() => {});
      if (!playing && !audio.paused) audio.pause();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, playing]);

  const trackName = (id: string) => t(`tracks.${id}`);

  const choose = (id: string) => {
    if (!isSelectable(id, pro)) return;
    if (!pro) {
      const off = ambientId === id && !ambientMix?.length;
      setSelection({ ambientId: off ? null : id, ambientMix: ambientMix });
      return;
    }
    const base: AmbientMixEntry[] = ambientMix?.length
      ? ambientMix
      : ambientId
        ? [{ id: ambientId, volume: singleVolume }]
        : [];
    const { mix, changed } = toggleInMix(
      base,
      id,
      MAX_MIX_TRACKS,
      DEFAULT_VOLUME,
    );
    if (!changed) return;
    setSelection({
      ambientId: mix[0]?.id ?? null,
      ambientMix: mix.length ? mix : null,
    });
  };

  const changeVolume = (id: string, v: number) => {
    if (ambientMix?.length) {
      if (!pro) return;
      setSelection({ ambientId, ambientMix: setMixVolume(ambientMix, id, v) });
    } else {
      setSingleVolume(v);
    }
  };

  const onPlayPause = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (list.length === 0) {
      if (!isSelectable(FREE_AMBIENT, pro)) return;
      setSelection({ ambientId: FREE_AMBIENT, ambientMix });
    }
    setPlaying(true);
  };

  const inList = new Set(list.map((e) => e.id));
  const mixLocked = !pro;
  const full = isMixFull(ambientMix ?? []);

  return (
    <div className="flex flex-col items-center">
      <section
        aria-label={t("title")}
        className="flex w-full flex-col gap-3 rounded-panel border border-line bg-surface p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="min-w-0 flex-1 text-base font-semibold">
              <button
                type="button"
                aria-expanded={open}
                aria-controls="ambient-tracks"
                onClick={() => setOpen((v) => !v)}
                className="flex min-h-11 w-full cursor-pointer items-center text-start"
              >
                {t("title")}
              </button>
            </h2>
            <p className="truncate text-xs text-muted">
              {playing && list.length > 0
                ? t("nowPlaying", {
                    name: list.map((e) => trackName(e.id)).join("، "),
                  })
                : t("stopped")}
            </p>
          </div>
          <button
            type="button"
            onClick={onPlayPause}
            aria-pressed={playing}
            aria-label={playing ? t("pause") : t("play")}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border border-line bg-ground"
          >
            {playing ? (
              <IconPause className="size-[18px] text-ink" />
            ) : (
              <IconPlay className="size-[18px] text-ink" />
            )}
          </button>
        </div>

        <div id="ambient-tracks" hidden={!open} className="flex flex-col gap-3">
          {pro && (
            <p className="text-xs text-muted">
              {t("max", { count: MAX_MIX_TRACKS })}
            </p>
          )}

          <ul className="grid grid-cols-3 gap-2.5">
            {AMBIENT_TRACKS.map((id) => {
              const allowed = isSelectable(id, pro);
              const selected = inList.has(id);
              const blocked = !allowed || (pro && !selected && full);
              const Icon = TRACK_ICONS[id];
              return (
                <li key={id} className="flex">
                  <button
                    type="button"
                    aria-pressed={selected}
                    disabled={blocked}
                    onClick={() => choose(id)}
                    className={`relative flex min-h-[88px] w-full cursor-pointer flex-col items-center justify-center gap-1.5 rounded-sheet px-1 py-2.5 text-center text-xs disabled:cursor-not-allowed ${
                      selected
                        ? "border-2 border-focus bg-focus-soft font-semibold text-focus-ink"
                        : "border border-line bg-ground font-medium"
                    } ${!allowed ? "" : "disabled:opacity-50"}`}
                  >
                    {!allowed && (
                      <span className="absolute start-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-pro-bg text-pro-ink">
                        <IconLock className="size-[11px]" />
                      </span>
                    )}
                    <Icon
                      className={`size-[26px] ${selected ? "text-focus-ink" : "text-muted"}`}
                    />
                    <span>{trackName(id)}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {list.length > 0 && (
            <ul className="flex flex-col gap-1">
              {list.map((entry) => {
                const name = trackName(entry.id);
                return (
                  <li key={entry.id} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 truncate text-[13px] text-muted">
                      {name}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={entry.volume}
                      disabled={!!ambientMix?.length && mixLocked}
                      aria-label={t("volume", { name })}
                      onChange={(e) =>
                        changeVolume(entry.id, Number(e.target.value))
                      }
                      className="h-11 min-w-0 flex-1 accent-focus"
                    />
                    {pro && (
                      <button
                        type="button"
                        aria-label={t("remove", { name })}
                        onClick={() => choose(entry.id)}
                        className="size-11 cursor-pointer rounded-full border border-line text-sm"
                      >
                        ×
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {!pro && (
            <Link
              href="/pricing"
              className="flex min-h-11 items-center gap-2 text-[13px] font-semibold text-pro-ink"
            >
              <IconLock className="size-4 shrink-0" />
              <span>{t("proOnly")}</span>
            </Link>
          )}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls="ambient-tracks"
          aria-label={t("title")}
          onClick={() => setOpen((v) => !v)}
          className="flex size-11 cursor-pointer items-center justify-center self-center text-muted"
        >
          <IconChevron
            className={`size-6 ${open ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      </section>
    </div>
  );
}

function trackIcon(paths: string[]) {
  return function TrackIcon({ className }: { className?: string }) {
    return (
      <svg
        className={className}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  };
}

const TRACK_ICONS: Record<
  (typeof AMBIENT_TRACKS)[number],
  ReturnType<typeof trackIcon>
> = {
  "brown-noise": trackIcon([
    "M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2",
  ]),
  rain: trackIcon([
    "M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242",
    "M16 14v6",
    "M8 14v6",
    "M12 16v6",
  ]),
  forest: trackIcon([
    "m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17Z",
    "M12 22v-3",
  ]),
  fire: trackIcon([
    "M12 2.5c.8 2.4 3.6 3.8 3.6 7a3.6 3.6 0 0 1-7.2 0c0-1.3.5-2.2 1.3-3 .2 1 .8 1.5 1.5 1.5C11 6.2 10.7 4.5 12 2.5z",
    "M4.5 21l15-4",
    "M4.5 17l15 4",
  ]),
  "white-noise": trackIcon([
    "M4 8v8",
    "M8 4v16",
    "M12 7v10",
    "M16 3v18",
    "M20 9v6",
  ]),
  "pink-noise": trackIcon([
    "M4 4v16",
    "M8 7v10",
    "M12 9v6",
    "M16 10.5v3",
    "M20 11.2v1.6",
  ]),
  ocean: trackIcon([
    "M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
    "M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
    "M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1",
  ]),
  river: trackIcon([
    "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z",
    "M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
  ]),
  wind: trackIcon([
    "M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2",
    "M9.6 4.6A2 2 0 1 1 11 8H2",
    "M12.6 19.4A2 2 0 1 0 14 16H2",
  ]),
};
