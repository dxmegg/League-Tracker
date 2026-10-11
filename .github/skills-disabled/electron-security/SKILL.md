---
name: electron-security
description: Enforce Electron security boundaries in main, preload, and renderer code. Use whenever generating or modifying any file in src/main/, src/preload/, or src/renderer/.
---

# Electron Security

This project runs an Electron app with a strict three-process boundary. Every suggestion must respect it. If a user request conflicts with these rules, follow the rules and state which one blocks the request.

## Verification block — run this before applying any rule below

Before you use this skill for the first time in a session, verify the following against the actual repository. Do not assume. Read the files.

1. **Confirm the directory layout.** Read `electron.vite.config.ts` and confirm that `src/main/`, `src/preload/`, and `src/renderer/` are the actual entry roots. If the layout differs (e.g. `app/` instead of `src/`), report the difference to the user before proceeding and do not apply rules that reference `src/`.
2. **Confirm `src/shared/` exists** and is imported by both main and renderer. If it does not exist, note that the "only shared directory" rule is inactive.
3. **Confirm `src/main/security.ts` exists** and exports `openExternalUrl`. If it does not, do not enforce rule 4 — instead report to the user that the safety wrapper is missing.
4. **Confirm the CSP config.** Search `src/main/` for `Content-Security-Policy` or a `session.defaultSession.webRequest` handler. If neither exists, report that rule 5 is not enforced by the codebase and ask whether to add it.
5. **Confirm the IPC namespace list.** Grep `src/main/ipc-handlers.ts` for `ipcMain.handle("` and list the actual prefixes. If any prefix exists that is not in the list below, add it to the rule before applying it.

If any verification fails, output a short report with `[skill:electron-security]` prefix and do not apply the conflicting rule.

## Non-negotiable rules

1. **Renderer never touches Node.** No `require`, `fs`, `path`, `child_process`, `process`, or raw `ipcRenderer` inside the renderer directory. The only channel out is `window.api`.
2. **Preload is the only bridge.** The `window.api` object is created with `contextBridge.exposeInMainWorld`. Do not add anything else to the global namespace.
3. **Process flags are frozen.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. Never propose weakening these, even temporarily, even for a quick test.
4. **External links go through `openExternalUrl()`** from `src/main/security.ts`. A direct `shell.openExternal` call is a bug.
5. **CSP is enforced.** Script sources for local files are restricted to `'self'`. Do not propose inline scripts or `unsafe-eval`.
6. **IPC namespaces are closed.** Existing prefixes: `db:`, `riot:`, `lcu:`, `dragon:`, `settings:`, `window:`, `app:`, `data:`, `backup:`, `autostart:`, `update:`. Never invent a new one.

## What to never suggest

- Disabling `contextIsolation` "just for debugging".
- Using the `remote` module.
- Loading remote content into a `BrowserWindow` without a strict CSP.
- Writing to disk from the renderer via any workaround.
- Adding `nodeIntegration: true` to any window, including dev-only windows.
- Bypassing `openExternalUrl()` for any reason.