# Rift Records

Desktop app for tracking complete League of Legends match history locally. It can connect to the League Client (LCU) for automatic detection. It was made solely for myself—for my own use—though I did want to share it with a specific person, which is why it is here.

## Important

This is really work in progress, be aware that some functions can be buggy, or not working at all.

Original project can be found here: [https://github.com/Yhprum/mayhem-tracker](https://github.com/Yhprum/mayhem-tracker)

## Features

- Automatic match detection via League Client API
- Imports all queues by default, including ARAM Mayhem
- Match history with detailed game breakdowns
- Champion, augment, and friend stats with win rates
- Aggregate statistics from all players in your games
- Item and Runes statistics
- More

# Rift Records

A desktop companion for League of Legends players who want a clear and convenient way to review their match history and track their progress.

Rift Records stores your match data locally and turns it into an easy-to-read dashboard. View your recent games, champion performance, queue statistics, win rates, KDA, damage, items, runes, multikills, champion mastery, and more — all in one place.

## Features

- Local account overview with summoner level, champion mastery, and ranked information

- Recent match history with detailed game results

- Separate views for ARAM Mayhem, ARAM, Arena, Ranked, Normal, and other queues

- Champion statistics, win rates, KDA, and performance trends

- Detailed match breakdowns including items, spells, runes, damage, healing, and multikills

- Your Profile page with augment, multikill, session, and time-of-day insights

- Live game tab that shows everything the game exposes while a match is running

- Separate scoring systems for ARAM, Summoner's Rift, and Arena, with MVP/ACE badges and a score breakdown on hover (Settings → Recalculate score rescores stored games)

- Local data storage with export and import support

- Automatic synchronization with the League of Legends client

- Dark, League-inspired interface designed for quick browsing, with a theme switcher in the top bar

## Important

This project is still a work in progress. Some features may be incomplete, buggy, or not work as expected.

Rift Records is a personal fork of the original [Mayhem Tracker](https://github.com/Yhprum/mayhem-tracker).

## Development

```
npm install
npm run rebuild   # Rebuild native modules for Electron
npm run dev       # Start the application in development mode

```

## Build

```
npm run dist      # Build the Windows portable executable (dist/RiftRecords.exe)

```

## If the app does not start

The executable is not code-signed, so Windows may treat a fresh download with suspicion:

- If a blue "Windows protected your PC" screen appears, click **More info → Run anyway**.
- If nothing happens at all, right-click `RiftRecords.exe` → **Properties** → tick **Unblock** → OK, then run it again. Also check Windows Security → Protection history, in case antivirus quarantined it.
- If the app opens an error window, or `%APPDATA%\league-tracker\startup.log` exists, send me that text.

## Disclaimer

Rift Records was created under Riot Games' ["Legal Jibber Jabber" policy](https://www.riotgames.com/en/legal-jibber-jabber) using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.

## Credits & Acknowledgements

This project is a fork of [Mayhem Tracker](https://github.com/Yhprum/mayhem-tracker) by [Yhprum](https://github.com/Yhprum).

Huge thanks to Yhprum for creating the original Mayhem Tracker. The original project inspired me to build this fork and adapt it for my own needs. Without Yhprum's work, this project would not exist.

If you are looking for the original, unmodified tracker, you can find it here:

[https://github.com/Yhprum/mayhem-tracker](https://github.com/Yhprum/mayhem-tracker)
