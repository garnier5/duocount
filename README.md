# DuoCount

Household spending, month after month — a PWA with no account and no server.
Built from a design-tool mockup (30 screens, kept outside the repository).

- Data stays on the phone (IndexedDB).
- Members share an encrypted `.duocount` file (PBKDF2 + AES-256-GCM, household password, kept in the household's password manager), e.g. over WhatsApp, then review and merge each other's changes.
- Monthly routine: enter expenses, review and close the month, confirm next month's forecast (share = total × % − advances).
- Excel export (.xlsx), encrypted backups, light and dark themes, works offline.

## Develop

```sh
npm install
npm run dev      # http://localhost:5173, this computer only
npm run dev:lan  # same, also reachable from a phone on the same Wi-Fi (and anyone else on it)
npm test         # unit tests (money, forecast, merge, encryption, xlsx)
npm run build    # production build in dist/
```

## Deploy

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`
(enable it once in the repository: Settings › Pages › Source: GitHub Actions).
The build uses a relative base path, so it works under any repository name.

## Notes for iPhone

- Install it with Safari › Share › Add to Home Screen: home-screen apps keep their data, Safari tabs may lose it after weeks without use.
- Web apps can't schedule notifications without a server: the month-end reminder is shown in the app and can be added to the calendar (.ics).
- A file received in WhatsApp must be saved to Files, then opened from Household sync › Import data.
