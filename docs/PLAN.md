# Pomodoro App — Build Plan (Farsi-first)

> Living document. Reference it in Cursor with `@docs/PLAN.md`. Update the checkboxes as you go.

## 1. Product summary

A Farsi-first Pomodoro web app (installable on phones as a PWA) with accounts, cross-device sync, stats, streaks and a paid "Pro" tier. Most paying users are in Iran.

- **Languages:** fa (default, RTL), en, es, fr, de, ja, ko
- **Platforms:** Web + installable PWA (iOS/Android/desktop). Native store apps are a later option (an `mobile/` Expo app could sit next to `web/`).
- **Business model:** Free tier + Pro (1-month, 12-month, lifetime), paid in Toman.

## 2. Key decisions (and why)

| Area | Choice | Why |
|---|---|---|
| Framework | **Next.js (App Router) + TypeScript** | You know React; frontend and backend live in one project. |
| Styling | **Tailwind CSS** using *logical* properties (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`) | RTL and LTR work from the same code without mirroring CSS. |
| UI components | **shadcn/ui** (Radix-based) | Accessible, copy-into-project components you fully own. |
| i18n | **next-intl**, URL-prefixed locales (`/fa`, `/en` …), `fa` default | Mature, App Router–native, handles plurals & numbers. |
| Font | **Vazirmatn**, self-hosted via `next/font/local` | Don't depend on Google Fonts from Iran. |
| Numbers/dates | Built-in `Intl` — `fa-IR` digits, `fa-IR-u-ca-persian` for the Jalali calendar | No extra library needed for display; week starts Saturday for fa. |
| Database | **PostgreSQL** + **Prisma ORM** | Relational data (users, sessions, tasks, payments); Prisma is the friendliest ORM for backend beginners. |
| Auth | **Better Auth** (self-hosted, in our own DB) with **phone-number OTP** (Iranian SMS provider, e.g. Kavenegar / sms.ir) + **email OTP** for international users | No dependence on US auth services; phone login is what Iranian users expect. |
| Payments | **Zarinpal** (REST API v4) | Largest Iranian payment facilitator. **Requires an Enamad (اینماد)** → start that early. |
| Billing model | **Prepaid plans**, not auto-renew: 1 month / 12 months / lifetime. User gets `proUntil` date or `lifetime = true`. | Iranian gateways don't do card-on-file auto-renewal; prepaid + renewal reminders is the norm. |
| Hosting | **Iranian PaaS** (compare Liara, ArvanCloud, Hamravesh) with managed PostgreSQL. App built as a Docker / Next.js `standalone` output so it's portable. | Reachable from inside Iran (including during international-internet disruptions); US hosts like Vercel may block Iranian visitors (sanctions). |
| Sync | Server is the source of truth; offline queue on the client | See §5. |

## 3. Free vs Pro (proposal — adjust anytime)

| Feature | Free | Pro |
|---|---|---|
| Focus / short break / long break timer | ✅ presets (25/5/15, 50/10/20) | ✅ any durations, long-break interval, per-phase sounds |
| Auto-start per phase (focus / break / long break) | ✅ | ✅ |
| Cross-device sync | ✅ | ✅ |
| Daily streak | ✅ | ✅ + streak freeze (later idea) |
| Themes | 3 | Unlimited |
| Tasks | Simple list, up to 10 active | Full suite: projects, tags, subtasks, pomodoro estimates, recurring, unlimited |
| Stats | Today + last 7 days, current-month heatmap | Full history, full-year heatmap, per-task/project breakdown, export |
| Notepad | ❌ | ✅ |
| Ambient sounds | 1 | Full library + mixing |

Streaks and sync stay free: they drive retention, and retention drives upgrades.
**Gating rule:** every Pro check happens on the server (`requirePro()`), never only by hiding UI.

## 4. Data model (first draft)

```
User            id, name, email?, phoneNumber?, locale, timezone (default "Asia/Tehran"),
                proUntil?, proLifetime (bool), createdAt
(Better Auth adds: Session, Account, Verification)

Settings        userId (1:1), focusMin, shortBreakMin, longBreakMin, longBreakEvery,
                autoStartFocus, autoStartShortBreak, autoStartLongBreak,
                themeId, soundId, ambientId?, notificationsOn, updatedAt

ActiveTimer     userId (1:1), phase (FOCUS|SHORT_BREAK|LONG_BREAK), status (RUNNING|PAUSED),
                startedAt, plannedSec, pausedAt?, pausedTotalSec, cycleIndex, taskId?, updatedAt

FocusSession    id (client-generated UUID → idempotent sync), userId, taskId?, phase,
                startedAt, endedAt, durationSec, completed (bool), createdAt

Project         id, userId, name, color, archived            (Pro)
Tag / TaskTag   …                                            (Pro)
Task            id, userId, projectId?, parentId?, title, notes?, estimatePomodoros?,
                done, doneAt?, order, recurrence?, createdAt

Note            id, userId, title, body, updatedAt           (Pro)

Payment         id, userId, plan (MONTH|YEAR|LIFETIME), amountToman, authority, refId?,
                status (PENDING|PAID|FAILED), createdAt, verifiedAt?
```

**Stats & streaks are derived from `FocusSession`** — no separate counters to get out of sync.
- A day "counts" for the streak if it has ≥ 1 completed focus session, using the **user's timezone**.
- Heatmap = SUM(durationSec) of completed focus sessions grouped by local date.

## 5. How sync works

1. **Timer state** lives in `ActiveTimer` as timestamps, not a ticking number. Any device computes `remaining = plannedSec − (now − startedAt − pausedTotalSec)`. Start on the laptop → the phone shows the same countdown.
2. Devices refresh timer state on app focus/visibility change + light polling while open (upgrade to Server-Sent Events later if needed).
3. **Completed sessions** are written to IndexedDB first, then flushed to the server when online. The client-generated UUID makes retries safe (no duplicates). Important given unreliable connections.
4. Settings/tasks/notes: last-write-wins using `updatedAt`.

Timer accuracy: never count `setInterval` ticks — browsers throttle background tabs. Always compute from timestamps.

## 6. Phases

Each phase ends with something that works. Commit to git at the end of every step.

- [ ] **Phase 0 — Setup:** tools installed, Next.js app scaffolded in `web/`, git initialized, Cursor rules in place.
- [ ] **Phase 1 — Timer core (no backend):** focus → break → long break cycle, auto-start toggles per phase, pause/resume/skip/reset, end sound, browser notification, tab-title countdown. State in a single store (Zustand) + localStorage.
- [ ] **Phase 2 — i18n, RTL, design:** next-intl with all 7 locales, `dir="rtl"` for fa, Vazirmatn, Persian digits, language switcher, 3 free themes, light/dark. *No hard-coded UI strings from here on.*
- [ ] **Phase 3 — Database + auth:** local PostgreSQL, Prisma schema (§4), Better Auth with phone OTP + email OTP (log OTPs to the console in dev; real SMS later). Guest mode: app works without an account; on sign-up, local data is uploaded.
- [ ] **Phase 4 — Sync:** settings, ActiveTimer and FocusSession sync per §5.
- [ ] **Phase 5 — Tasks:** free simple list; Pro projects/tags/subtasks/estimates. Pick a task for the current focus session.
- [ ] **Phase 6 — Stats, heatmap, streaks:** dashboard with Jalali dates for fa, GitHub-style heatmap, current & best streak, per-task breakdown (Pro).
- [ ] **Phase 7 — Pro & payments:** pricing page, Zarinpal sandbox → request → redirect → callback → verify → grant `proUntil`/lifetime; payment history; expiry reminders; server-side `requirePro()`.
- [ ] **Phase 8 — Pro features:** unlimited themes, fully custom timer, notepad, ambient sounds (self-hosted audio files).
- [ ] **Phase 9 — PWA:** manifest, icons, service worker (Serwist), offline shell, "Add to Home Screen" guide (esp. iOS).
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
- `git commit` after each working step, so any bad AI change is one `git restore` away.
- Never paste real secrets into chat; keep them in `web/.env.local` (git-ignored).
