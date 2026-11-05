"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link } from "@/i18n/navigation";
import { FREE_AMBIENT, AMBIENT_TRACKS, MAX_MIX_TRACKS, type AmbientMixEntry } from "@/lib/settings/catalog";
import { DEFAULT_VOLUME, isMixFull, isSelectable, playlistOf, setMixVolume, toggleInMix } from "./mix";
import { useAmbientStore } from "./store";
import { AMBIENT_URLS } from "./tracks";

/**
 * Ambient sound player and mixer. `pro` says whether this account may change the library and the mix.
 * Playback starts only from a click, and the playing state stays on this device.
 */
export function AmbientPlayer({ pro = false }: { pro?: boolean }) {
  const t = useTranslations("ambient");
  const { ambientId, ambientMix, singleVolume, playing, setSelection, setSingleVolume, setPlaying } = useAmbientStore();
  const [hydrated, setHydrated] = useState(false);
  const audios = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    void Promise.resolve(useAmbientStore.persist.rehydrate()).then(() => setHydrated(true));
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
    const base: AmbientMixEntry[] = ambientMix?.length ? ambientMix : ambientId ? [{ id: ambientId, volume: singleVolume }] : [];
    const { mix, changed } = toggleInMix(base, id, MAX_MIX_TRACKS, DEFAULT_VOLUME);
    if (!changed) return;
    setSelection({ ambientId: mix[0]?.id ?? null, ambientMix: mix.length ? mix : null });
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
    <section aria-label={t("title")} className="flex w-full flex-col gap-3 rounded-feature border border-line bg-surface p-4 md:max-w-[460px]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold">{t("title")}</h2>
        <button
          type="button"
          onClick={onPlayPause}
          aria-pressed={playing}
          className="min-h-11 cursor-pointer rounded-full border border-line px-4 text-sm font-semibold"
        >
          {playing ? t("pause") : t("play")}
        </button>
      </div>

      {pro && <p className="text-sm text-muted">{t("max", { count: MAX_MIX_TRACKS })}</p>}

      <ul className="flex flex-wrap gap-2">
        {AMBIENT_TRACKS.map((id) => {
          const allowed = isSelectable(id, pro);
          const selected = inList.has(id);
          const blocked = !allowed || (pro && !selected && full);
          return (
            <li key={id}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={blocked}
                onClick={() => choose(id)}
                className={`min-h-11 cursor-pointer rounded-full border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
                  selected ? "border-ink font-semibold" : "border-line"
                }`}
              >
                {trackName(id)}
              </button>
            </li>
          );
        })}
      </ul>

      {list.length > 0 && (
        <ul className="flex flex-col gap-2">
          {list.map((entry) => {
            const name = trackName(entry.id);
            return (
              <li key={entry.id} className="flex items-center gap-3">
                <span className="w-24 shrink-0 truncate text-sm">{name}</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={entry.volume}
                  disabled={!!ambientMix?.length && mixLocked}
                  aria-label={t("volume", { name })}
                  onChange={(e) => changeVolume(entry.id, Number(e.target.value))}
                  className="min-w-0 flex-1"
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
        <p className="text-sm text-muted">
          <Link href="/pricing" className="underline">
            {t("proOnly")}
          </Link>
        </p>
      )}
    </section>
  );
}
