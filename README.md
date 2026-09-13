# LeagueTracker

Desktop app for tracking complete League of Legends match history locally. It can connect to the League Client (LCU) for automatic detection. It was made solely for myself—for my own use—though I did want to share it with a specific person, which is why it is here.
<img width="1280" height="820" alt="image" src="https://raw.githubusercontent.com/dxmegg/League-Tracker/refs/heads/main/1.png" />

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

<img width="1280" height="820" alt="image" src="https://raw.githubusercontent.com/dxmegg/League-Tracker/refs/heads/main/2.png" />
<img width="1280" height="820" alt="image" src="https://raw.githubusercontent.com/dxmegg/League-Tracker/refs/heads/main/3.png" />
<img width="1280" height="820" alt="image" src="https://raw.githubusercontent.com/dxmegg/League-Tracker/refs/heads/main/4.png" />
<img width="1280" height="820" alt="image" src="https://raw.githubusercontent.com/dxmegg/League-Tracker/refs/heads/main/5.png" />

## Tech Stack

Electron + React + TypeScript, built with electron-vite. Uses Tailwind CSS for styling, better-sqlite3 for local storage, and league-connect for LCU integration.

## Development

```bash
npm install
npm run rebuild   # rebuild native modules for Electron
npm run dev       # start in dev mode
```

## Build

```bash
npm run dist      # build Windows portable executable
```

## Disclaimer

League Tracker was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.


## Credits & Acknowledgements

This project is a fork of [Mayhem Tracker](https://github.com/Yhprum/mayhem-tracker) by [Yhprum](https://github.com/Yhprum).

Huge thanks to Yhprum for creating the original Mayhem Tracker. The original project inspired me to build this fork and adapt it for my own needs. Without Yhprum's work, this wouldn't exist.

If you're looking for the original, unmodified tracker, check out it here: [https://github.com/Yhprum/mayhem-tracker](https://github.com/Yhprum/mayhem-tracker)
