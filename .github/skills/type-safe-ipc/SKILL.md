---
name: type-safe-ipc
description: Add a new IPC channel following the four-place rule. Use when the user asks to add a channel, expose a new capability to the renderer, or wire a renderer action to main-process logic.
---

# Type-Safe IPC — The Four-Place Rule

## Verification block — run this before applying any rule below

Before you use this skill for the first time in a session, verify the following against the actual repository. Do not assume. Read the files.

1. **Confirm the four locations exist.** Read each of these paths and confirm it is a real file:
   - the main-process IPC handler registry (typically `src/main/ipc-handlers.ts`)
   - the preload bridge (typically `src/preload/index.ts`)
   - the shared IPC contract (typically `src/shared/api.ts`)
   - the main-process module that holds the logic (varies by channel)

   If any of these has a different name or location, use the actual path for the rest of the session and report the difference to the user.

2. **Confirm the preload api annotation.** Open the preload file and confirm the `api` object is annotated with an explicit interface type (e.g. `const api: ElectronAPI`). If it is untyped or uses `any`, flag it as a bug before adding any new channel.

3. **Confirm the contract interface name.** Read the shared contract file and confirm the interface name (e.g. `ElectronAPI`). Use that name in all suggestions. Do not introduce a parallel interface.

4. **Confirm the handler registration function.** Read the handler registry and confirm the function name that wraps all `ipcMain.handle` calls (e.g. `registerIpcHandlers`). Use that name.

5. **List existing channels.** Enumerate every `ipcMain.handle("...")` and every `ipcRenderer.invoke("...")` in the repo. Compare the two lists. If they do not match 1:1, report the mismatch before adding anything — there is already drift in the codebase.

6. **Check for `any` escapes.** Grep the preload file for `as any`. If any match exists, report it before proceeding.

If any verification fails, output a short report with `[skill:type-safe-ipc]` prefix and resolve or escalate before adding a channel.

## The four places

Every new IPC channel requires four edits, in this order. Produce all four in the same response. If you are unsure of a return type, ask before guessing.

1. **Logic** in the appropriate main-process module. It must log entry and outcome per the diagnostic rule in `copilot-instructions.md`.

2. **Handler** registered inside the handler-registration function:
   ```ts
   ipcMain.handle("namespace:action", async (_event, arg1, arg2) => {
     // validate args
     return doTheThing(arg1, arg2);
   });
Every handler validates its arguments. Do not trust the renderer.

Preload method added to the api object. Keep the explicit type annotation. Never use as any.

Contract added to the shared interface, with argument and return types defined there or imported from an existing shared type.

Signature matching
Steps 3 and 4 must match exactly:

If preload calls ipcRenderer.invoke("db:foo", a, b), the contract signature must be (a: T1, b: T2) => Promise<R>.

If the return type is a DB row, import the row interface from the shared contract file. Do not redeclare it.

Common failures
Forgetting step 4 → renderer gets unknown types.

Forgetting step 3 → renderer cannot call the channel at all.

Adding the handler but not the logic → runtime error, not a type error.

Using any on the preload api object → hides the real problem.

Checklist before claiming the channel works
□ Logic function exists, logs entry and outcome.
□ Handler registered with the correct namespace prefix.
□ Preload method added, api object still typed.
□ Contract in the shared file with exact signature.
□ Renderer calls window.api.<method> — never ipcRenderer directly.