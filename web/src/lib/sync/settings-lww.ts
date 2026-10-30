// Settings sync is last-write-wins. An older device must not clobber a newer edit.

export type SyncSettings = {
  focusMin: number;
  shortBreakMin: number;
  longBreakMin: number;
  longBreakEvery: number;
  autoStartFocus: boolean;
  autoStartShortBreak: boolean;
  autoStartLongBreak: boolean;
  themeId: string;
  soundId: string;
  ambientId: string | null;
  notificationsOn: boolean;
  /** Epoch milliseconds. Compared to the client's clock only against this field. */
  updatedAt: number;
};

export function mergeSettings(
  stored: SyncSettings,
  clientUpdatedAt: number,
  patch: Partial<Omit<SyncSettings, "updatedAt">>,
): SyncSettings {
  // Equal timestamps keep the stored row. "Newer" is strict so a retry cannot flap.
  if (!(clientUpdatedAt > stored.updatedAt)) return stored;
  const next: SyncSettings = { ...stored, updatedAt: clientUpdatedAt };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      (next as Record<string, unknown>)[key] = value;
    }
  }
  return next;
}
