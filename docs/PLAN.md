# Pomodoro App — Build Plan (Farsi-first)

> Living document. Reference it in Cursor with `@docs/PLAN.md`. Update the checkboxes as you go.

## 1. Product summary

A Farsi-first Pomodoro web app (installable on phones as a PWA) with accounts, cross-device sync, stats, streaks and a paid "Pro" tier. Most paying users are in Iran.

- **Languages:** fa (default, RTL), en, es, fr, de, ja, ko
- **Platforms:** Web + installable PWA (iOS/Android/desktop). Native store apps are a later option (an `mobile/` Expo app could sit next to `web/`).
- **Business model:** Free tier + Pro (1-month, 12-month, lifetime), paid in Toman.

## 2. Key decisions (and why)

| Area          | Choice                                                                                                                                                         | Why                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | **Next.js (App Router) + TypeScript**                                                                                                                          | You know React; frontend and backend live in one project.                                                                                      |
| Styling       | **Tailwind CSS** using _logical_ properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`)                                                                     | RTL and LTR work from the same code without mirroring CSS.                                                                                     |
| UI components | **shadcn/ui** (Radix-based)                                                                                                                                    | Accessible, copy-into-project components you fully own.                                                                                        |
| i18n          | **next-intl**, URL-prefixed locales (`/fa`, `/en` …), `fa` default                                                                                             | Mature, App Router–native, handles plurals & numbers.                                                                                          |
| Font          | **Vazirmatn**, self-hosted via `next/font/local`                                                                                                               | Don't depend on Google Fonts from Iran.                                                                                                        |
| Numbers/dates | Built-in `Intl` — `fa-IR` digits, `fa-IR-u-ca-persian` for the Jalali calendar                                                                                 | No extra library needed for display; week starts Saturday for fa.                                                                              |
| Database      | **PostgreSQL** + **Prisma ORM**                                                                                                                                | Relational data (users, sessions, tasks, payments); Prisma is the friendliest ORM for backend beginners.                                       |
| Auth          | **Better Auth** (self-hosted, in our own DB) with **phone-number OTP** (Iranian SMS provider, e.g. Kavenegar / sms.ir) + **email OTP** for international users | No dependence on US auth services; phone login is what Iranian users expect.                                                                   |
| Payments      | **Zarinpal** (REST API v4)                                                                                                                                     | Largest Iranian payment facilitator. **Requires an Enamad (اینماد)** → start that early.                                                       |
| Billing model | **Prepaid plans**, not auto-renew: 1 month / 12 months / lifetime. User gets `proUntil` date or `lifetime = true`.                                             | Iranian gateways don't do card-on-file auto-renewal; prepaid + renewal reminders is the norm.                                                  |
| Hosting       | **Iranian PaaS** (compare Liara, ArvanCloud, Hamravesh) with managed PostgreSQL. App built as a Docker / Next.js `standalone` output so it's portable.         | Reachable from inside Iran (including during international-internet disruptions); US hosts like Vercel may block Iranian visitors (sanctions). |
| Sync          | Server is the source of truth; offline queue on the client                                                                                                     | See §5.                                                                                                                                        |

## 3. Free vs Pro (proposal — adjust anytime)

| Feature                                           | Free                                       | Pro                                                                 |
| ------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------- |
| Focus / short break / long break timer            | ✅ presets (25/5/15, 50/10/20)             | ✅ any durations, long-break interval, per-phase sounds             |
| Auto-start per phase (focus / break / long break) | ✅                                         | ✅                                                                  |
| Cross-device sync                                 | ✅                                         | ✅                                                                  |
| Daily streak                                      | ✅                                         | ✅ + streak freeze (later idea)                                     |
| Themes                                            | 3                                          | Unlimited                                                           |
| Tasks                                             | Simple list, up to 10 active               | Full suite: projects, tags, subtasks, pomodoro estimates, unlimited |
| Stats                                             | Today + last 7 days, current-month heatmap | Full history, full-year heatmap, per-task/project breakdown, export |
| Notepad                                           | ❌                                         | ✅                                                                  |
| Ambient sounds                                    | 1                                          | Full library + mixing                                               |

Streaks and sync stay free: they drive retention, and retention drives upgrades.
**Gating rule:** every Pro check happens on the server (`requirePro()`, from `proUntil` / `proLifetime`), never only by hiding UI.
**Tasks limit:** "active" means a top-level task that is not done and not deleted. Subtasks and finished tasks do not count. The limit is enforced on the server inside a per-user row lock (`SELECT … FROM "user" … FOR UPDATE`), and the same rule applies when a guest's tasks are imported, so an import cannot bypass it. A free user who is already over 10 can still view, rename, finish, reorder and delete; they just cannot add. When Pro ends, every project, tag, subtask, note and estimate stays readable. Only creating or changing Pro-only items is blocked, and clearing a Pro field back to empty stays allowed. Nothing is deleted on downgrade.

## 4. Data model (first draft)

```
User            id, name, email?, phoneNumber?, locale, timezone (default "Asia/Tehran"),
                proUntil?, proLifetime (bool), createdAt
(Better Auth adds: Session, Account, Verification)

Settings        userId (1:1), focusMin, shortBreakMin, longBreakMin, longBreakEvery,
                autoStartFocus, autoStartShortBreak, autoStartLongBreak,
                themeId, soundId, ambientId?, notificationsOn, updatedAt

ActiveTimer     userId (1:1), phase (FOCUS|SHORT_BREAK|LONG_BREAK),
                status (IDLE|RUNNING|PAUSED),
                startedAt, plannedSec, pausedAt?, pausedTotalSec, cycleIndex,
                runId (UUID of the current phase; placeholder while idle),
                version (integer, starts at 0; every change sends expectedVersion),
                taskId?, updatedAt

FocusSession    id (equals the runId of the phase that finished → idempotent sync),
                userId, taskId?, phase, startedAt, endedAt, durationSec,
                completed (bool), createdAt

Project         id, userId, name, color, archived, createdAt,
                updatedAt, deletedAt?, serverUpdatedAt       (Pro to write)
Tag             id, userId, name, createdAt,
                updatedAt, deletedAt?, serverUpdatedAt       (Pro to write)
TaskTag         taskId, tagId
Task            id, userId, projectId?, parentId?, title, notes?, estimatePomodoros?,
                done, doneAt?, order, createdAt,
                updatedAt, deletedAt?, serverUpdatedAt

Note            id, userId, title, body, updatedAt           (Pro)

Payment         id, userId, plan (MONTH|YEAR|LIFETIME), amountToman, authority? (unique),
                refId?, cardPan?, errorCode?, locale, status (PENDING|PAID|FAILED|EXPIRED),
                createdAt, verifiedAt?, updatedAt
ProReminder     userId, proUntil, kind (EXPIRING|EXPIRED), channel (SMS|EMAIL), sentAt
                unique (userId, proUntil, kind)
```

**Sync columns (Phase 5).** `Task`, `Project` and `Tag` carry three times. `updatedAt` is the client's edit time (`@default(now())`, not Prisma `@updatedAt`): last write wins on it. `deletedAt` is a soft delete and it sticks — a later edit cannot bring a deleted row back, and the row stays so other devices learn about the delete. `serverUpdatedAt` is `@updatedAt` and is only the pull cursor. `Project` also gained `createdAt`. `Task.recurrence` was removed: recurring tasks are out of scope. `Tag` has no unique `(userId, name)`, only `@@index([userId, serverUpdatedAt])`, because two devices can create the same tag offline; the client merges duplicates by name.

**Stats & streaks are derived from** `FocusSession` — no separate counters to get out of sync. Pomodoro counts on a task are derived the same way: completed focus sessions with that `taskId`, versus `estimatePomodoros`. No counter columns.

- A day counts for the streak when it has at least one completed focus session. The local day is the date of `endedAt` in `User.timezone`: the whole session counts on that day, even if it started before midnight. The current streak stays alive through today — if yesterday counted and today is still empty, the streak is the run that ended yesterday. It breaks only after a full local day with no session.
- The best streak is the longest run in the whole history. It is one number and stays free, even though browsing that history is Pro.
- Heatmap = SUM(durationSec) of completed focus sessions grouped by that same local date. `FocusSession` is indexed on `(userId, endedAt)` for this lookup.

## 5. How sync works

The server is the source of truth for a signed-in user. The local store is a cache plus a queue. Guests stay on this device only and make no sync calls.

1. **Timer state** lives in `ActiveTimer` as timestamps, not a ticking number. Any device computes `remaining = plannedSec − (now − startedAt − pausedTotalSec)`. While paused, `now` is `pausedAt`. Start on the laptop → the phone shows the same countdown.
2. **Clocks can be wrong.** Every sync response includes `serverNow`. The client keeps `clockOffset = serverNow − Date.now()` (a smoothed median, ignoring a response whose round trip was over a second) and uses `Date.now() + clockOffset` in the formula above.
3. **No silent overwrites.** Every timer change sends `expectedVersion`. The server applies it only when that matches `ActiveTimer.version`, then adds 1. A mismatch returns 409 with the current row, and the client adopts it. No error toast. **Exception:** `setTask`**.** Choosing the task for the current focus is a timer command with no `expectedVersion` and no `version` bump, so picking a task never makes another device's pause or complete conflict. When that task is finished or deleted (including through a deleted parent), the server clears `ActiveTimer.taskId` in the same transaction, again without a version bump. The timer keeps running and the client shows "no task". No error toast.
4. **One completion, one row.** A phase start stores a new `runId`. The `FocusSession` for that focus uses `id = runId`. A second device, or a retry, inserts nothing.
5. Devices refresh on app start, tab focus, becoming visible, coming back online, and every 15s while the tab is visible. Polling stops while the tab is hidden. A later `GET /api/sync/stream` (Server-Sent Events) can replace that poll; the pull function stays the one place that adopts server state.
6. **Completed sessions** are written to IndexedDB first, then flushed when online. The `runId` makes retries safe. A signed-in device that was closed through several phases does not invent the missing sessions: one `complete` advances one phase, and auto-start begins the next phase at `serverNow`. Guests still reconstruct locally, because they have no server.
7. Settings: last-write-wins using `updatedAt`. Notes will use the same rule when they exist.
8. **Tasks** sync through the same queue, pull and refresh triggers (focus, visible, online, 15s poll). Writes flush to `POST /api/tasks` (last-write-wins on `updatedAt`, soft delete via `deletedAt`, client UUIDs). `GET /api/sync/state?tasksSince=<ms>` returns a `tasks` block; `0` means the full set, and the saved cursor is `serverNow − 5s` so a row written during the round trip is not missed. Guests keep tasks on this device only and upload them through the existing import path on sign-up.
9. **Stats are not part of the sync pull.** `GET /api/stats` reads `FocusSession` for a local-date range. The client merges the IndexedDB session queue by id, so a focus that has not uploaded yet still counts today. Guests compute the same numbers from the sessions on this device and do not call the API.

### Payments

Pro is still only `proUntil` and `proLifetime`. `requirePro()` is unchanged. A payment writes those two columns and nothing else.

1. The pricing page sends a plan id. The server copies the toman amount from `lib/payments/plans.ts` onto a `PENDING` row, then asks Zarinpal with `currency: "IRT"`. The callback URL is `{APP_URL}/api/payments/callback` and is not under `/fa` or `/en`. The row stores the page locale for the redirect.
2. Zarinpal sends the buyer's browser back with `Authority` and `Status`. `Status=NOK` is a cancellation. Anything else is verified with the amount on our row. The query string is not trusted for the amount or the outcome.
3. Verify code `100` or `101` means the payment succeeded. One transaction locks the Payment row (`SELECT … FOR UPDATE`). If it is not already `PAID`, we store the reference and extend Pro: lifetime sets `proLifetime`; a month adds 30 days and a year adds 365, starting from `max(now, proUntil)`, so paying early stacks. A refresh or a second callback sees `PAID` and does not add the days again.
4. `scripts/reconcile-payments.ts` re-verifies `PENDING` rows older than 15 minutes through that same path. A definitive failure becomes `EXPIRED`. A network error or `-52` leaves the row `PENDING`, so the script is safe to run again.
5. `scripts/send-expiry-reminders.ts` messages people whose Pro ends in 3 local days, and people whose Pro ended yesterday. A `ProReminder` row keyed by `(userId, proUntil, kind)` stops the same reminder going out twice. A renewal changes `proUntil`, so the new date can be reminded.

Timer accuracy: never count `setInterval` ticks — browsers throttle background tabs. The interval only re-renders. The end sound and the browser notification can only play while the page is actually running. Firing them at the exact end time while the phone is locked needs the Phase 9 service worker.

## 6. Phases

Each phase ends with something that works. Commit to git at the end of every step.

- [x] **Phase 0 — Setup:** tools installed, Next.js app scaffolded in `web/`, git initialized, Cursor rules in place.
- [x] **Phase 1 — Timer core (no backend):** focus → break → long break cycle, auto-start toggles per phase, pause/resume/skip/reset, end sound, browser notification, tab-title countdown. State in a single store (Zustand) + localStorage.
- [x] **Phase 2 — i18n, RTL, design:** next-intl with all 7 locales, `dir="rtl"` for fa, Vazirmatn, Persian digits, language switcher, 3 free themes, light/dark. _No hard-coded UI strings from here on._
- [x] **Phase 3 — Database + auth:** local PostgreSQL, Prisma schema (§4), Better Auth with phone OTP + email OTP (log OTPs to the console in dev; real SMS later). Guest mode: app works without an account; on sign-up, local data is uploaded.
- [x] **Phase 4 — Sync:** settings, ActiveTimer and FocusSession sync per §5.
- [x] **Phase 5 — Tasks:** free simple list (add, rename, check, delete, reorder, max 10 active); Pro projects, tags, subtasks, estimates and notes, gated by `requirePro()`. The picked task is stored in `ActiveTimer.taskId` and copied to `FocusSession.taskId` when the focus completes. `/pricing` is a placeholder until Phase 7. Dev helper: `npx tsx scripts/grant-pro.ts <email> [days|lifetime|off]`.
- [x] **Phase 6 — Stats, heatmap, streaks:** dashboard with Jalali dates for fa, GitHub-style year heatmap (Pro), current and best streak, last 7 days, per-task and per-project breakdown and CSV export (Pro). Derived from `FocusSession`, gated with `requirePro()`.
- [x] **Phase 7 — Pro & payments:** pricing page (replacing the Phase 5 placeholder), Zarinpal sandbox → request → redirect → callback → verify → grant `proUntil`/lifetime; payment history; expiry reminders. `requirePro()` already exists (Phase 5); payments plug into the same two columns.
- [ ] **Phase 8 — Pro features:** unlimited themes, fully custom timer, notepad, ambient sounds (self-hosted audio files).
- [ ] **Phase 9 — PWA:** manifest, icons, service worker (Serwist), offline shell, "Add to Home Screen" guide (esp. iOS). The service worker also plays the phase-end sound and shows the browser notification while the page is frozen (locked phone or sleeping computer). Until then, those fire when the page runs again; the timer schedule itself does not wait.
- [ ] **Phase 10 — Production:** domain, Iranian hosting + managed Postgres, real SMS provider, Enamad, Zarinpal production merchant, backups, error logging, privacy policy & terms (fa + en), self-hosted analytics.
- [ ] **Phase 11 — Launch & marketing:** landing page (fa first), content, social, Iranian app directories, feedback loop.

**Start in parallel with development (they take weeks):** buy the domain → apply for Enamad → open Zarinpal merchant account → sign up with an SMS provider (needs approved message templates).

## 7. Cursor workflow

- Open the **project root** in Cursor. Rules live in `.cursor/rules/`; they're applied automatically.
- **One feature per chat.** Start a new chat when a phase/feature is done or the chat gets long.
- For anything bigger than a small fix, ask the agent to **plan first** (Plan mode, or "propose a plan, don't write code yet"), read the plan, then let it implement.
- Reference context explicitly: `@docs/PLAN.md`, specific files, and official docs.
- **Review every diff.** If you don't understand backend code, ask "explain this like I'm new to backends" before accepting. You're learning the backend as you go; that's the point.
- Run the app and test after each step. When something breaks, paste the **exact error** into the chat.
- **Tests:** from `web/`, `npm test` runs the unit tests. With Postgres running, `npm run test:e2e` runs the Playwright sync tests (two signed-in browsers on one account, about 4 minutes because two tests wait out a real one-minute focus). The first run needs `npx playwright install chromium`. The suite starts its own dev server on port 3100 (folder `.next/e2e`, so `npm run dev` can keep running) with `E2E_OTP=1`, which lets the tests read login codes from `GET /api/test/otp`. That route answers 404 in every other mode. Test accounts are `e2e-…@example.com` and are deleted after each test.
- `git commit` after each working step, so any bad AI change is one `git restore` away.
- Never paste real secrets into chat; keep them in `web/.env.local` (git-ignored).
