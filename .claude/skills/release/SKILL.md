---
name: release
description: Release a new version of Rift Records - changelog, README, version bump, local installer build, tag and GitHub release. Use only when the user asks for a release.
argument-hint: "[version, e.g. 1.5.0]"
disable-model-invocation: true
---

# Release Rift Records

Talk to the user in Polish. Write commit messages, CHANGELOG, README and release notes in English.
Never add any Claude credit to commits, tags or release notes.
Stop at the first failed command and report it.

## 1. Prepare

- Work on `redesign`; `git status` must be clean. Ask what to do with uncommitted changes.
- Version: use the argument; without one, propose one from the changes and ask.
- Read what changed: `git log --reverse <last tag>..HEAD`, and the diffs where a message is not clear.

## 2. Write the notes

- `CHANGELOG.md`: add `## X.Y.Z (YYYY-MM-DD)` on top, plain bullets about what a user notices. Never an "Unreleased" section. The app shows this file in its What's new tab.
- `README.md`, "Recent Changes": add the version, keep the last 5 only. Tags: **(NEW)**, **(IMPROVED)**, **(CHANGED)**, **(REMOVED)**; small fixes as one "Various small fixes" line.
- Fix other README text the changes made wrong.
- Screenshots: do not take or change any unless the user mentions them.

Show the user the version and both texts and wait for a yes. That yes covers the push and publish below.

## 3. Check, bump, build

Quit the dev app first: `npm run rebuild` cannot replace a native module in use. The user may be mid-game, so ask before closing it.

```powershell
npm version X.Y.Z --no-git-tag-version
```

```powershell
node --no-warnings scripts/check-postgame.mjs && npm run check:scores && node --no-warnings scripts/check-versions.mjs
```

```powershell
npm run rebuild && npx electron-vite build && npx electron-builder --win --publish never
```

`npm version` runs typecheck, lint, format check and a build first (`preversion`). Run any other `scripts/check-*.mjs` that covers what changed.

The result is `dist/Rift Records Setup.exe` (unsigned). Check that its time is from this build.

## 4. Publish

- Commit `package.json`, `package-lock.json`, `CHANGELOG.md`, `README.md` as `chore — release: vX.Y.Z`.
- Tag `vX.Y.Z` (lightweight), push `redesign` and the tag.
- Fast-forward `main` to the release (the README on GitHub comes from `main`): `git push origin redesign:main`. If it is rejected, stop and ask; never force.
- Write the new CHANGELOG section to a file in the scratchpad, then:

```powershell
gh release create vX.Y.Z "dist/Rift Records Setup.exe" --title "vX.Y.Z" --notes-file <notes file>
```

Attach exactly one `.exe`: the app's updater takes the first one. Do not wait for GitHub Actions.

## 5. Verify and report

- `gh release view vX.Y.Z --json name,assets,url` shows one asset, `Rift.Records.Setup.exe`.
- Delete the notes file.
- Report the release link and what was not tried (installing, updating from the previous version).
