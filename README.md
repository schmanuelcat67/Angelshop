# Nekobot

## Struktur
- `index.js` – Twitch-Bot Logik
- `extension-backend/` – Express-Backend für Railway
- `extension/` – statische Twitch-Extension-Dateien
- `data/` – lokale Laufzeitdaten (JSON), standardmäßig nicht im Git-Repo
- `temp_ext/` – lokaler Test-/Backup-Ordner, ignoriert

## Lokal starten
```bash
npm install
npm start
```

## Railway
Das Projekt nutzt `railway.json` mit:
- Startkommando: `npm run start:railway`
- Healthcheck: `/health`

Empfohlene Variablen in Railway:
- `TWITCH_EXT_SECRET`
- `TWITCH_BOT_USERNAME`
- `TWITCH_OAUTH_TOKEN`
- `TWITCH_CHANNEL` oder `TWITCH_CHANNELS`
- optional `DATA_DIR` oder `MONGODB_URI`
