---
name: lcu-api-guard
description: Riot API access must always go through the Cloudflare Worker proxy. Use whenever touching src/main/riot-api.ts, src/main/lcu.ts, or any code that reaches Riot or the League Client.
---

# LCU and Riot API Guard

## Verification block — run this before applying any rule below

Before you use this skill for the first time in a session, verify the following against the actual repository. Do not assume. Read the files.

1. **Locate the proxy URL.** Grep the repo for `league-tracker-proxy` and for `workers.dev`. If the URL differs from the one in this skill, use the one in the code and report the mismatch to the user.
2. **Locate the Riot API module.** Grep `src/main/` for `accountByRiotId`, `match-v5`, or `riot`. Confirm the file name. If it is not `riot-api.ts`, update the reference in this skill for the rest of the session and note the actual path.
3. **Locate the LCU module.** Grep `src/main/` for `league-connect` or `lcu`. Confirm the file name. If it is not `lcu.ts`, note the actual path.
4. **Check for the API key.** Grep the entire repo for `RIOT_API_KEY`, `riotApiKey`, and `apiKey`. If any match is found outside of this skill's own text and outside the proxy Worker config, **stop and report it as a critical finding** before doing anything else.
5. **Check the account lookup pattern.** Search `src/main/` for `status === 404`. If found in a Riot account lookup path, flag it as a bug — Riot returns `200` with `{}` for some missing accounts.
6. **Check the Dragon cache module.** Confirm `src/main/dragon.ts` exists and is the only file importing `ddragon.leagueoflegends.com` or `raw.communitydragon.org`. If there is more than one, report it.
7. **Check for hardcoded regions.** Grep the repo for `eun1`, `euw1`, `na1`, `kr`, `br1`. If any appears outside `src/shared/queues.ts`, report it.

If any verification fails, output a short report with `[skill:lcu-api-guard]` prefix and do not apply the conflicting rule until the user resolves it.

## The proxy rule

The Riot API key never enters this codebase. Not in `.env`, not in `safeStorage`, not in source, not in a comment, not in an example.

The only path to Riot is the Cloudflare Worker proxy:
GET https://league-tracker-proxy.dxmegg.workers.dev/proxy{path}?platform={region}

Do not suggest moving the key back into the app. Do not add a second path that bypasses the proxy.

## The LCU socket

- Reached via `league-connect` in the main process.
- Talks to the locally running League Client only.
- It is not a substitute for the Riot proxy.
- Never call it from renderer code.
- Used for polling and post-game capture, not for match history backfill.

## The 404 trap

A 404 is **not** how Riot signals a missing account. The account lookup can return `200` with an empty body `{}`. Any validation must inspect the body, not just `res.status === 404`.

## Riot ID rules

- Case-insensitive in the API, but the display name must come from the API response, never from user input.
- When calling `accountByRiotId`, use what the response says, not what the user typed.

## Data Dragon and CommunityDragon

- Champion icon paths use the champion **key** string (`Yorick`, `MissFortune`, `TwistedFate`), never the numeric champion id.
- All caches are managed in `src/main/dragon.ts`. Do not add a second cache.

## What to never do

- Never read, log, or transmit the API key.
- Never add an alternative HTTP client that reaches Riot directly.
- Never trust a payload from Riot, LCU, or Dragon without parsing it through a `parseX` / `normalizeX` function.
- Never call the LCU socket from the renderer.
- Never hardcode a platform or region outside `src/shared/queues.ts`.