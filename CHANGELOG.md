# Changelog

## 1.4.1 (2026-11-27)

- New Season Recap tab, still empty
- New full match data for Mayhem and ARAM: timeline, skill and item order, per-player CS, gold and damage
- New "After the game" section and Graphs tab on the match page
- New Trends views: win rate by gold lead, economy by queue, matchup tier list and results against classes
- New teammate groups in Friends & Foes and a setting for how match lists are grouped
- New question about a backup before deleting an account, importing, repairing or restoring
- Automatic backups are compressed and on by default, with separate weekly, monthly and manual copies
- The database is about three times smaller; the first start upgrades it and takes a minute or two
- Faster long lists that load more as you scroll, and one row per item across game modes
- The update check now offers the release published last
- Fixed export and import losing some stored data
- Fixed item statistics ignoring the chosen account and patch, and counting copies instead of games
- Fixed champion page charts ignoring the Mayhem or All matches mode
- Fixed half-downloaded icons, retired item art and several smaller problems

## 1.4.0 (2026-11-26)

- New All champions summary, opened from the Champions tab
- New Misc. Data tab: champions, augments and items of the other players in your games
- New Timeline tab on ARAM Mayhem matches: gold and XP lead and a kill map, saved from the League client
- New favorite matches in Match History
- New setting to hide the All matches mode and run Mayhem only
- New test view on Live Game of what the client reports after a game: end-of-game screen, mastery and honor
- Filters, sorting and search are remembered by default, across more views
- Automatic backups are now off unless you switch them on
- Fixed games being lost when more than 20 were played while the app was closed
- Fixed the win rate over time chart showing the oldest weeks instead of the newest
- Fixed history links on Home
- Better queue names
- Removed the manual add-account form, the searched-accounts cleanup and the old themes

## 1.3.1 (2026-11-26)

- New Use default button for the database folder under Backups
- The data folder is now `%APPDATA%\rift-records`; existing data moves there on the first start
- Moved Riot API sync to a new server address: version 1.3.0 and older can no longer sync through the Riot API

## 1.3.0 (2026-11-26)

- New installer replaces the portable exe; your history is picked up automatically
- New folder settings under Backups: choose where the database and its backups are kept
- Better updates: they install silently and no longer rename the program or flash console windows
- The program is named Rift Records everywhere, with a new file description
- Removed OP.GG from the list of services the app uses

## 1.2.2 (2026-11-26)

- Redesigned What's new tab: a timeline of releases with a label on every change
- Bigger die icon without the frame on the taskbar, in Task Manager and on the exe
- Removed the theme switcher; the app uses the Redesign theme

## 1.2.1 (2026-11-26)

- New What's new tab in Settings with the changes of every release
- Update window in the top bar: check on start, optional automatic install, download progress and speed
- Fixed two-part version tags such as `v1.1` never being offered as an update
- New icon; flat violet-black panels and no glow in Mayhem mode
- Rebuilt Settings → About: version and links, where your data goes, legal notices, collapsible stored-data reference

## 1.1 (2026-11-25)

- New Redesign theme, now the default, with a grouped sidebar; Third to Sixth themes removed
- Live Game tab: scoreboard, game flow charts, events, peak stats, scouting; live data is saved with each match
- Match history grouped by day and session, redesigned match page with a Stats tab
- Rebuilt Champions, Items, Augments, Friends & Foes, Trends, Records, Storage and Settings
- Achievements with tiers from Iron to Challenger, challenges from the League client
- Developer mode switch for testing tools, program version in the sidebar
- Fixed account merging and deletion, export/import coverage, stale statistics, updater errors, client connection flapping and narrow-window layouts

## 1.0.10 (2026-11-24)

- A failed start shows an error window and writes `startup.log` instead of closing silently
- If the graphics driver crashes at launch, the app restarts once with software rendering

## 1.0.9 (2026-11-23)

- Separate scoring for ARAM, Summoner's Rift and Arena, with a breakdown on hover and score recalculation
- Global All / Mayhem data mode and a Mayhem-first layout
- New Home and Your Profile pages with activity heatmap and insights
- Live Game tab, theme switcher in the top bar, faster startup

## 1.0.8 (2026-10-20)

- Redesigned Trends: time filter, role and queue breakdowns, day/hour heatmap, streaks and insights
- Home dashboard refactor with champion results and personal records
- Fixed merging of Arena queues and of duplicate accounts

## 1.0.7 (2026-10-16)

- Riot Match-V5 sync with progress bar and stop button
- Per-player telemetry and challenges on match pages and champion details
- Reworked Records, Friends and item detail pages
- Manual merge of duplicate accounts

## 1.0.6 (2026-10-12)

- App renamed to Rift Records
- Champion detail with tabs: combat, economy, farm, objectives, vision, items, runes, abilities, matchups, synergies, trends, timeline
- Match timeline download, kill/death map and heatmap
- Dragon images cached on disk, with a Data Dragon fallback
- Export/import rewritten as compressed files with progress, fixing failures on large databases

## 1.0.5 (2026-09-19)

- Redesigned match history dashboard cards and navigation
- Queue exclusions applied to averages, records and champion stats
- Fixed account streaks in Records

## 1.0.4 (2026-09-19)

- Home dashboard with queue filters, records and match list
- Restyled match history rows and side navigation, unified cards and controls
- Lossless export format; fixed cached rank and match pagination

## 1.0.3 (2026-09-17)

- Redesigned full match history and navigation
- Local account page with cached profile and refresh
- OP.GG integration, restoring ignored games, better sync

## 1.0.2 (2026-09-12)

- Saved account management and full history backfill
- Profile statistics, favorites, recent matches from Riot, match pagination
- Fixed Arena spells, queue lookup and imports

## 1.0.1 (2026-09-11)

- Small fixes

## 1.0.0 (2026-09-11)

- First release: local history of all queues, with fixes to history sync and loading
