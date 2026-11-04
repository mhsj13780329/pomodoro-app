import type { FocusSessionDraft } from "@/lib/timer/transitions";

/**
 * A focus the guest finished on this device. The id is created at catch-up so a later
 * upload can retry. Same shape as the draft the transitions build for a signed-in user.
 */
export type GuestFocusSession = FocusSessionDraft;
