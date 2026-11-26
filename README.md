# Rift Records

A Windows desktop app that keeps your League of Legends match history on your own computer and turns it into dashboards: champions, items, augments, trends, records and live game data. ARAM Mayhem comes first, every other queue is tracked too.

**[Download the latest release](https://github.com/dxmegg/Rift-Records/releases/latest)** · [Changelog](CHANGELOG.md)

## Recent Changes

**1.4.0**

- **(NEW)** All champions summary, opened from the Champions tab
- **(NEW)** Misc. Data tab: champions, augments and items of the other players in your games
- **(NEW)** Timeline on ARAM Mayhem matches: gold and XP lead and a kill map
- **(NEW)** Favorite matches, a setting to run Mayhem only, and a test view of post-game data on Live Game
- **(IMPROVED)** Filters, sorting and search are remembered by default
- **(IMPROVED)** Games played while the app was closed are all picked up on the next start
- **(CHANGED)** Automatic backups are off unless you switch them on
- **(REMOVED)** Manual add-account form, searched-accounts cleanup and the old themes
- Various small fixes

**1.3.1**

- **(NEW)** Use default button for the database folder (Settings → Backups)
- **(CHANGED)** Data folder renamed to `%APPDATA%\rift-records`; existing data moves on the first start
- **(CHANGED)** New server address for Riot API sync: 1.3.0 and older can no longer sync through the Riot API

**1.3.0**

- **(NEW)** Installer: coming from the portable exe, your match history is picked up automatically
- **(NEW)** Choose where the database and its backups are kept (Settings → Backups)
- **(IMPROVED)** Updates install silently, without console windows
- **(REMOVED)** The portable exe

**1.2.2**

- **(IMPROVED)** What's new tab redesigned as a timeline of releases with labelled changes
- **(CHANGED)** Bigger die icon on the taskbar, in Task Manager and on the exe
- **(REMOVED)** Theme switcher: the app now uses the Redesign theme

**1.2.1**

- **(NEW)** What's new tab in Settings
- **(NEW)** Update window in the top bar with download progress and optional automatic install
- **(CHANGED)** New app icon; flat violet-black panels in Mayhem mode
- **(IMPROVED)** Rebuilt About section in Settings
- Various small fixes

Full history: [CHANGELOG.md](CHANGELOG.md)

## Screenshots

![Home dashboard](docs/screenshots/home.png)

|                                                  |                                            |
| ------------------------------------------------ | ------------------------------------------ |
| ![Match history](docs/screenshots/match-history.png) | ![Champions](docs/screenshots/champions.png) |
| ![Augments](docs/screenshots/augments.png)       | ![Trends](docs/screenshots/trends.png)     |

## Features

- **Automatic tracking**: detects the League client and stores games as you play, also from the system tray
- **Live Game**: scoreboard, game flow charts, events and peak stats while a match is running
- **Match history**: grouped by day and session, with a detailed page per match (items, runes, augments, per-player stats)
- **Champions, Items, Augments, Runes**: win rates, KDA, damage, gold, multikills and detailed breakdowns
- **Match timeline**: gold and XP lead and a kill map for ARAM Mayhem games
- **Misc. Data**: what the other players in your games picked and built
- **Scoring**: separate systems for ARAM, Summoner's Rift and Arena, with MVP/ACE badges and a score breakdown on hover
- **Your Profile, Friends & Foes, Trends, Records**: habits, time-of-day patterns, who you play with and your best games
- **Achievements and Challenges**: tiers from Iron to Challenger, plus challenges read from the League client
- **Multiple accounts**: sync, show, hide or merge them
- **Your data stays yours**: local database, optional automatic backups, export and import
- **Updates**: checks GitHub Releases on start, can install automatically, with download progress

## Install

Windows 10/11 (64-bit). Download `Rift.Records.Setup.exe` from [Releases](https://github.com/dxmegg/Rift-Records/releases) and run it. It installs for the current user, no administrator rights needed. Coming from the portable version, your history is picked up automatically.

### If the app does not start

The executable is not signed by a trusted certificate authority, so Windows may treat a fresh download with suspicion:

- If a blue "Windows protected your PC" screen appears, click **More info → Run anyway**.
- If nothing happens at all, right-click the setup file → **Properties** → tick **Unblock** → OK, then run it again. Also check Windows Security → Protection history, in case antivirus quarantined it.
- If the app opens an error window, or `%APPDATA%\rift-records\startup.log` exists, include that text in your report.

## Data and network

Match history is stored in `%APPDATA%\rift-records` (`league-tracker` up to 1.3.0, renamed on the first start); the database and backup folders can be changed in Settings. Uninstalling keeps your data unless you choose to delete it. There is no Rift Records account. The app talks to the League client, the Riot Games API (through a small proxy that holds the API key), Data Dragon and CommunityDragon (game art) and GitHub (update checks).

## Development

```
npm install
npm run rebuild   # Rebuild native modules for Electron
npm run dev       # Start the application in development mode
npm run dist      # Build the Windows installer (dist/Rift Records Setup.exe)
```

## Legal

Rift Records was created under Riot Games' ["Legal Jibber Jabber" policy](https://www.riotgames.com/en/legal) using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

Rift Records isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games and all associated properties are trademarks or registered trademarks of Riot Games, Inc.

## License

[MIT](LICENSE)
