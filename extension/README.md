# 🐱 Neko Bot Twitch Extension

Eine vollständige Twitch Extension für dein Neko Bot Fishing & Currency System!

## 🎯 Features

✅ **Live-Inventar**: Sehe alle deine gefangenen Fische in Echtzeit  
✅ **Gold-System**: 5 Gold pro 10cm Fisch (0.5 Gold/cm)  
✅ **Fish Selling**: Verkaufe Fische direkt in der Extension  
✅ **Shop**: Kaufe Upgrades mit deinem Gold  
✅ **Soundalerts Integration**: Gold kann für YouTube/Twitch Alerts verwendet werden  
✅ **Mobile Responsive**: Funktioniert auch auf mobilen Geräten  

## 📁 Projektstruktur

```
├── extension/
│   ├── panel.html          # Haupt-UI
│   ├── config.html         # Konfiguration
│   ├── styles.css          # Styling
│   ├── client.js           # Frontend-Logik
│   └── extension.json      # Extension Manifest
│
├── extension-backend/
│   ├── server.js           # Express Backend
│   ├── package.json        # Dependencies
│   └── .env               # Environment Variables
```

## 🚀 Installation & Setup

### 1. Backend starten

```bash
cd extension-backend

# Dependencies installieren
npm install

# .env Datei erstellen
echo "EXT_BACKEND_PORT=3001" > .env
echo "TWITCH_EXT_SECRET=your-secret-here" >> .env

# Backend starten
npm start
```

Der Backend läuft dann auf `http://localhost:3001`

### 2. Twitch CLI installieren

```bash
npm install -g twitch-cli
```

### 3. Extension in Twitch Developer Console registrieren

1. Gehe zu https://dev.twitch.tv/console/extensions
2. Klicke auf "Create Extension"
3. Wähle "Panel" als Type
4. Notiere dir die **Client ID** und **Signing Secret**

### 4. Extension Manifest aktualisieren

In `extension/extension.json`:
```json
{
  "id": "YOUR_CLIENT_ID",
  "authorName": "Dein Name",
  ...
}
```

### 5. Extension deployen

```bash
cd extension

# Extension als .zip packen
zip -r extension.zip panel.html config.html styles.css client.js extension.json

# Mit Twitch CLI uploaden
twitch ext upload -z extension.zip

# Im Dashboard aktivieren & testen
```

## 🔑 Environment Variables

**extension-backend/.env:**
```env
EXT_BACKEND_PORT=3001
TWITCH_EXT_SECRET=your-signing-secret
NODE_ENV=development
```

**Main Bot (.env):**
```env
# Bestehende Variablen...
# Extension wird automatisch auf die bot-eigenen JSON-Dateien zugegriffen
```

## 📊 API Endpoints

### GET `/api/user/stats`
```bash
curl -H "Authorization: Bearer {token}" \
  http://localhost:3001/api/user/stats?username=matty
```

**Response:**
```json
{
  "username": "matty",
  "gold": 550,
  "totalEarned": 1200,
  "fishCount": 5,
  "upgrades": { "premium_bait": true }
}
```

### GET `/api/user/inventory`
```bash
curl -H "Authorization: Bearer {token}" \
  http://localhost:3001/api/user/inventory?username=matty
```

### POST `/api/sell-fish`
```bash
curl -X POST -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"username":"matty","fishIndex":0}' \
  http://localhost:3001/api/sell-fish
```

### POST `/api/buy-upgrade`
```bash
curl -X POST -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"username":"matty","upgradeName":"premium_bait","upgradeCost":100}' \
  http://localhost:3001/api/buy-upgrade
```

## 💰 Currency & Shop

### Gold verdienen
- **!angeln**: Fang jetzt Gold! (0.5 Gold pro cm Fisch)
- **!sell [1-N]**: Verkaufe einen Fisch für 1.5 Gold pro cm

### Shop Items
| Item | Preis | Effekt |
|------|-------|--------|
| Premium Köder | 100🏆 | +20% größere Fische |
| Tiefenwasser | 150🏆 | +30% bessere Chancen |
| Soundalert | 50🏆 | Ding! bei Fischfang |
| Legendary Status | 500🏆 | Bronze-Badge im Chat |

## 🔧 Troubleshooting

**"Failed to load stats"**
- Stelle sicher, dass der Backend läuft: `npm start`
- Überprüfe CORS Settings in `server.js`
- Check die Logs in der Browser Console

**"Invalid token"**
- Stelle sicher, dass der Token von Twitch Extension kommt
- Überprüfe, dass `CLIENT_SECRET` in `.env` richtig ist

**Extension lädt nicht in Twitch**
- Überprüfe die Browser Console für Fehler
- Stelle sicher, dass HTTPS in Production verwendet wird
- CORS muss korrekt konfiguriert sein

## 📝 Nächste Schritte

- [ ] Soundalerts Integration (Webhook)
- [ ] Crafting System
- [ ] Leaderboards
- [ ] Achievements Anzeige
- [ ] Advanced Upgrades
- [ ] Social Features (Gifts, Trading)

## 📄 Lizenz

Entwickelt für Neko Bot • 2024

---

**Fragen?** Schau dir die Bot-Logs an oder checke die Extension Console in Twitch Creator Dashboard!
