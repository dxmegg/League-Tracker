# Changelog

## 1.0.2 (2026-11-28)

- Much faster export
- Faster import, especially when most games are already in your database
- New animated progress bar for export and import, with a percentage
- Fixed an export that could hang forever when the file could not be written

## 1.0.1 (2026-11-28)

- Fixed an "EPIPE: broken pipe" error window that could appear while the app was running
- Plain `.db` backups are no longer removed automatically
- A restore that fails now puts your current database back
- Restoring an older backup no longer overwrites the safety copy made just before it
- Unexpected errors are now written to the log files
- Diagnostics: "Last check" shows when a failed update check happened, and the Riot API is no longer reported as OK when the answer did not come from Riot
- Clearer message when no account is selected

## 1.0.0 (2026-11-27)

- First release under the new numbering, bringing together everything from the early builds
- Automatic match tracking from the League client, also from the system tray: ARAM Mayhem first, every other queue stored too
- Live Game tab: scoreboard, game flow charts, events, peak stats and scouting
- Match history grouped by day and session, with a page per match: items, augments, per-player stats, graphs and timeline
- Home, Your Profile, Champions, Items, Augments, Friends & Foes, Trends, Records, Achievements, Storage and Misc. Data
- Full match data for Mayhem and ARAM: skill and item order, per-player CS, gold and damage
- Separate scoring for ARAM, Summoner's Rift and Arena, with a breakdown on hover
- Several accounts: show, hide or merge them
- Your data stays on your computer: compressed automatic backups, export, import and folders of your choice
- Installer with updates from GitHub Releases, which can install on start but never during a game
- New Diagnostics page in Settings: versions, connections, database and folders, with a report to copy or export
- New log files in the program data folder, with tokens and player ids removed
- New What's new button in the top bar, and the update window lists every release you missed
- Faster item statistics, which no longer freeze the window for about a second
- Fixed the desktop shortcut losing its icon after an update

[Early builds changelog](CHANGELOG-EARLY.md)
