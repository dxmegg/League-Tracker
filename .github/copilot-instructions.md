# .github/copilot-instructions.md

# Copilot Instructions — League Tracker

This file is the standing contract for every Copilot session in this repository. Read it fully before answering. If a user request conflicts with anything below, follow this file and say which rule blocks the request.

---

## 1. What this project is

Electron + React + TypeScript desktop app that records League of Legends match history locally. Fork of Mayhem Tracker (originally by Yhprum). The database is SQLite (`better-sqlite3`), the UI is React with HashRouter, and the Riot API is reached exclusively through a Cloudflare Worker proxy that holds the API key server-side.

**The API key never enters this codebase.** Not in `.env`, not in `safeStorage`, not in source, not in a comment, not in an example. Do not suggest moving it back into the app. The proxy at `https://league-tracker-proxy.dxmegg.workers.dev` is the only path to Riot, and it is called as `GET {PROXY}/proxy{path}?platform={region}`.

Stack as configured:
- Electron 40 + electron-vite 5
- React 19 + React Router 7 (HashRouter) + Tailwind 4
- better-sqlite3 with WAL mode
- Data Dragon (`ddragon.leagueoflegends.com`) and CommunityDragon (`raw.communitydragon.org`) for static data and icons
- `league-connect` for the LCU socket

---

## 2. The three process boundaries — never blur them
src/main/ Electron main process. Owns the database, LCU socket,
Riot proxy calls, filesystem, backups, updater, autostart,
security policy. Everything OS-touching lives here.

src/preload/ The only bridge. Exposes one window.api object through
contextBridge. Sandboxed, contextIsolation: true,
nodeIntegration: false. Do not weaken these.

src/renderer/ React UI. Talks to the main process ONLY through window.api.
Never imports from src/main/. May import from src/shared/.

`src/shared/` is the only directory both sides import: types, queue/region constants, `opScore.ts`, `proxy.ts`.

---

## 3. Non-negotiable rules

1. **Never expose Node APIs to the renderer.** No `require`, `fs`, `path`, `child_process`, `process`, or raw `ipcRenderer` inside `src/renderer/`. The only channel out is `window.api`.
2. **Never call `shell.openExternal` directly.** Use `openExternalUrl()` from `src/main/security.ts` — it enforces the http/https allowlist.
3. **Renderer settings are whitelisted.** `settings:get` / `settings:set` in `src/main/ipc-handlers.ts` refuse any key not in the `RENDERER_SETTINGS` set. A new user-facing setting requires adding it to that set and to the Settings page.
4. **Never hardcode queue id arrays.** `[1700, 1740, 1750]` is `ARENA_QUEUE_IDS`, `[2400, 2450]` is `MAYHEM_QUEUE_IDS`. Both live in `src/shared/queues.ts`. Arena is treated as one group in every aggregate ("most played mode", queue filters, etc.).
5. **Riot IDs are case-insensitive in the API, but the display name must come from the API response** (the canonical form), never from user input. When you call `accountByRiotId`, use what the response says, not what the user typed.
6. **A 404 is not how Riot signals a missing account.** The account lookup returns `200` with an empty body `{}` for some cases. Any validation that gates on a lookup result must inspect the body, not just `res.status === 404`.
7. **Never invent a new IPC namespace.** Existing prefixes: `db:`, `riot:`, `lcu:`, `dragon:`, `settings:`, `window:`, `app:`, `data:`, `backup:`, `autostart:`, `update:`.
8. **Do not rewrite files wholesale.** A fix is a targeted diff, not a rewrite of half the file. If a task seems to require rewriting more than ~30% of a component, stop and ask.

---

## 4. Adding an IPC channel — the four-place rule

Copilot regularly forgets steps. Every new channel requires all four, in this order:

1. **Logic** in the appropriate `src/main/*.ts` module (query, handler, helper).
2. **Handler** registered inside `registerIpcHandlers()` in `src/main/ipc-handlers.ts` with `ipcMain.handle("namespace:action", ...)`.
3. **Preload method** added to the `api` object in `src/preload/index.ts`. The object is annotated `const api: ElectronAPI` — keep that annotation, never use `as any` to silence type errors.
4. **Contract** added to the `ElectronAPI` interface in `src/shared/api.ts`, with argument and return types defined there or imported from an existing shared type.

Steps 3 and 4 must match exactly. If the preload method calls `ipcRenderer.invoke("db:foo", a, b)` the contract signature must be `(a: T1, b: T2) => Promise<R>`.

If a task says "add a channel for X", produce all four edits in the same response. If you are unsure which return type to use, ask before guessing.

---

## 5. Code conventions

### TypeScript
- `strict` mode. No `any` unless it is genuinely the shape of an unparsed external payload — and then it goes through a `parseX` / `normalizeX` function that returns a typed value.
- Prefer `interface` for object contracts (IPC shapes, DB rows) and `type` for unions and aliases.
- Named exports. No default exports except React page components (matching existing pages).
- Null over undefined where the existing code uses null.

### Comments
Comments are English, dense, and explain **why** — the surprising constraint, the bug being avoided, the reason the obvious alternative was rejected. Read the comment style in `src/main/db.ts` and `src/main/backup.ts` before adding new ones. Do not add comments that restate the code.

### React
- Function components, hooks only.
- Do not lift state unnecessarily. Small child components with their own state are the preferred pattern for anything rendered inside a `.map()`.
- Tailwind classes only — no inline `style` unless the value is dynamic (`width: ${pct}%`).
- Existing component primitives to reuse: `ChampionIcon`, `AugmentIcon`, `ItemIcon`, `SummonerIcon`, `SummonerSpellIcon`, `RuneIcon`, `WinRateBar`, `StatBars`, `StatCard`, `MultikillBadge`, `MatchScoreboard`, `QueueSelect`, `PatchSelect`, `RarityFilter`, `RiotText`, and the shared icon set in `components/icons.tsx`.

### Database
- Prepared statements, never string interpolation for values.
- One transaction per write batch.
- Migrations go in `runMigrations()` in `src/main/db.ts`, bump `SCHEMA_VERSION`, and are additive whenever possible.
- Never store the Riot API key. Never store user secrets of any kind.

---

## 6. Known Copilot pitfalls — check every response against this list

1. **Hooks inside `.map()`** → "Rendered more hooks than during the previous render". Extract a small child component with its own hook state.
2. **Hooks below an early return** → same crash. All hooks must be above every `return` in the component body.
3. **`useState` initialized with an async function** → throws during render. Initialize to `null`, fetch in `useEffect`.
4. **Numeric ids for Data Dragon champion icons** → broken image. The path segment is a champion **key** string (`Yorick`, `MissFortune`, `TwistedFate`), never the numeric champion id.
5. **Forgot one of the four IPC places** (see section 4). Verify all four before claiming a channel works.
6. **Hardcoded `[1700, 1740, 1750]`** instead of importing `ARENA_QUEUE_IDS`.
7. **Assuming 404 for a missing Riot account.** See section 3, rule 6.
8. **`Promise.all` without `try/catch` in component setup** → one rejection blanks the whole view. Wrap, or use `Promise.allSettled`, or fall back per-request.
9. **Leaving the old implementation after a refactor** (two functions doing the same query). When you replace a function, explicitly `remove the previous implementation of X` in the same response.
10. **Doing too much at once.** A prompt with more than three substantial tasks loses the last one. Section 9 covers this.
11. **Using `#file:` or VS Code-only syntax.** The user is on Copilot Chat in the web/desktop app. Reference files by path in prose.
12. **Bumping `SCORE_FORMULA_VERSION` casually.** In `src/shared/opScore.ts` it triggers a full re-score of the whole library on next launch. Only bump when the formula or a stored field actually changed, and say so explicitly.
13. **Touching the `raw_gz` blob shape without a migration.** `games.raw_gz` is the source of truth for every derived row. Changing what goes in, or how it is parsed, requires a new migration in `db.ts`, not a silent rewrite of `participantRowsFromRaw`.

---

## 7. What to do when the user reports a crash or a broken render

The first response is **static analysis, not a fix**.

1. Read the named files and quote the exact functions or lines involved.
2. Walk the request through the pitfall list in section 6 and say which ones apply.
3. If the cause is obvious, propose a targeted fix. If not, ask one focused question — not a request for full logs.

Do not request logs unless the static pass genuinely cannot narrow the cause. Do not say "rewrite the file" unless the user asked for that. Do not pad the answer with alternatives — one fix, precisely where it belongs.

If the user pastes an error or log, quote it back before proposing the fix. That is how they know the message was read, not scanned.

---

## 8. Response format for a code change

When the user asks for a change:

- **One short sentence** stating the goal, no preamble.
- **At most three tasks** per prompt. If a request needs four or more, split it into separate blocks and tell the user to paste them in order.
- Each task names the file(s) and the exact change. Use concrete values — hex colors, constant names, function names — not "adjust the styling".
- Include a closing guard task when relevant: `### Task N: Do NOT change anything else` listing the files or behaviors that must be left alone.
- Between tasks, include the line: `Do tasks in order. Don't start the next task until the previous one is finished.`
- End every prompt with: `After the change, show me the final JSX of [specific element].`

For **visual work**, split it into two prompts: first the logic (state, data, handlers), then the presentation ("Now generate the visual component for this view, using Tailwind CSS"). Do not merge them.

For a **new feature that needs an IPC channel**, the tasks are: (1) main-process logic + handler, (2) preload + `shared/api.ts` contract, (3) renderer usage. That is three tasks — do not add a fourth.

---

## 9. What to never do

- Never write `any` on the preload `api` object to work around a type error. Fix the contract instead.
- Never disable `contextIsolation`, `sandbox`, or `nodeIntegration`.
- Never add a second path to Riot that bypasses the proxy.
- Never add a top-level `console.log` in a hot path (inside a render, inside a row renderer, inside a polling tick). If a temporary log is genuinely needed for diagnosis, it goes behind a specific request from the user and gets removed in the next prompt.
- Never introduce a new dependency without asking. The dependency list is deliberately small.
- Never create two implementations of the same query, handler, or component and leave both in the tree.
- Never assume the current branch is `main`. It is almost always a feature branch — ask if a change seems likely to conflict with uncommitted work.
- Never add emojis, decorative section dividers, or commentary that is not load-bearing.

---

## 10. Reference — file responsibilities

Load-bearing files, in the order they usually matter:

- `src/main/db.ts` — schema, migrations, every read/write query, repair, scoring backfill. The largest and most sensitive file. Change with care.
- `src/main/ipc-handlers.ts` — the full IPC surface. Any new channel lands here.
- `src/main/lcu.ts` — LCU polling, SGP backfill, post-game capture.
- `src/main/riot-api.ts` — Riot proxy calls, account resolution, match import.
- `src/main/dragon.ts` — Data Dragon and CommunityDragon caches, augment icon resolution.
- `src/main/backup.ts` — snapshots, retention, restore, startup recovery.
- `src/main/security.ts` — URL allowlist, permission handler, navigation policy.
- `src/shared/api.ts` — the IPC contract. Every channel is declared here.
- `src/shared/queues.ts` — queue ids, scopes, `ARENA_QUEUE_IDS`, `MAYHEM_QUEUE_IDS`, `AUGMENT_SLOTS`.
- `src/shared/opScore.ts` — the score formula. `SCORE_FORMULA_VERSION` gates a full backfill.
- `src/preload/index.ts` — the `window.api` bridge.
- `src/renderer/App.tsx` — routing. Every new page needs a route here.
- `src/renderer/pages/MatchHistory.tsx` — the largest page; `GameRow` is exported and reused by `Profile.tsx`.
- `src/renderer/pages/Profile.tsx` — the search-account and local-account views. Reused logic for favorites, recents, and imports 
