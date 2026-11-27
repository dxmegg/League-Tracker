# Rift Records

Aplikacja na Windows (Electron, React, TypeScript, better-sqlite3) trzymająca lokalnie historię meczów LoL i statystyki. Najważniejszy jest ARAM Mayhem. Repo jest publiczne.

# Język

- Rozmawiaj po polsku. Kod, komentarze, commity, CHANGELOG i README pisz po angielsku.

# Gdzie co jest

- `src/main`: proces główny (`db/` baza i statystyki, `lcu/` klient League, `riot-api.ts`).
- `src/preload`, `src/shared/api.ts`: most IPC; nowa metoda wymaga zmian w obu i w `ipc-handlers.ts`.
- `src/renderer`: interfejs. `scripts/check-*.mjs`: testy.

# Komendy

- `npm run dev -- --remoteDebuggingPort 9222`: aplikacja deweloperska.
- `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`: przed każdym commitem.
- `npm run format`: formatowanie (oxfmt, nie Prettier).

# Zasady pracy

- Pracuj na `redesign`. Commit i push na polecenie; merge do `main` tylko na wyraźne.
- Nie dopisuj Claude jako współautora.
- Nowa logika dostaje mały test w `scripts/`.
- Przy błędzie napraw przyczynę we wspólnym kodzie i sprawdź wszystkie miejsca, które go wołają.
- Instalator buduj tylko do wydania.
- Gdy proszę o rozplanowanie czegoś, zapisz plan po polsku jako `.md` w `data\` (poza gitem).
- Pliki tymczasowe usuwaj od razu, gdy nie są potrzebne.
- Nie uruchamiaj podagentów ani dodatkowych sesji bez prośby.
- Mów wprost, czego nie sprawdziłeś i co się nie udało.

# Ostrożnie

- `data\matches.db` to prawdziwe dane, części nie da się pobrać ponownie. Testuj na kopii.
- Migracje startują same przy uruchomieniu; nowej nie odpalaj na prawdziwej bazie bez zgody.
- Przed usunięciem danych, publikacją na zewnątrz lub nadpisaniem historii gita zapytaj.
- Użytkownik często gra: nie steruj myszą ani klawiaturą, a przed restartem aplikacji sprawdź, czy nie trwa gra.
- Nie wypisuj tokenów.

# Wydania

- Tylko na polecenie, przez skill `/release`. Tag to `v` + wersja z `package.json`.
- Bez sekcji "Unreleased"; zrzuty ekranu tylko na prośbę.
