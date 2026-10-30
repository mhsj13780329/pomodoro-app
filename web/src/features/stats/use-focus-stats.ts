"use client";

import { useLocale } from "next-intl";
import { useEffect, useSyncExternalStore } from "react";
import { useTimerStore } from "@/features/timer/store";
import { useTasksStore } from "@/features/tasks/store";
import { authClient } from "@/lib/auth-client";
import { validTimeZone } from "@/lib/stats/calendar";
import { getNow, getServerStats, getStatsState, notePending, retainStats, subscribeStats } from "./client";
import { presentFocus, type FocusView } from "./present";
import { browserTimeZone, toStatSession } from "./sessions";

const LOADING: FocusView = {
  status: "loading",
  offline: false,
  pro: false,
  timeZone: "Asia/Tehran",
  today: "",
  from: "",
  to: "",
  todayFocusSec: 0,
  todaySessions: 0,
  currentStreak: 0,
  bestStreak: 0,
  byDay: new Map(),
  sessions: [],
};

/** Today's focus, the streak, and the free window. The same numbers on the timer and on Stats. */
export function useFocusStats(): FocusView {
  const remote = useSyncExternalStore(subscribeStats, getStatsState, getServerStats);
  const auth = authClient.useSession();
  const locale = useLocale();
  const pending = useTasksStore((state) => state.pendingSessions);
  const guest = useTimerStore((state) => state.completedSessions);
  const signedIn = Boolean(auth.data?.user);
  const user = auth.data?.user;
  const userId = user?.id;
  const userZone = user?.timezone;

  useEffect(() => {
    notePending(pending.map(toStatSession));
  }, [pending, remote.snapshot]);

  useEffect(() => {
    if (auth.isPending || !signedIn || !userId) return;
    return retainStats({
      timeZone: validTimeZone(userZone),
      locale,
      userId,
    });
  }, [auth.isPending, signedIn, userId, userZone, locale]);

  // Hydration must match the server, which has no session history yet.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  if (!mounted || auth.isPending) return LOADING;

  return presentFocus({
    signedIn,
    sessionPending: false,
    timeZone: signedIn ? validTimeZone(user?.timezone) : browserTimeZone(),
    now: getNow(),
    snapshot: remote.snapshot,
    offline: remote.offline,
    pending: pending.map(toStatSession),
    handedOff: remote.handedOff,
    guestSessions: guest.map(toStatSession),
  });
}
