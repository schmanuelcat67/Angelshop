# 🐱 Neko Bot - Komplettes Setup Guide

Vollständiges Setup für Neko Bot mit Fishing, Currency, und Twitch Extension!

## 📋 Übersicht

```
nekobot/
├── index.js                    # Main Bot (mit !angeln, !saufen, etc.)
├── drinks.json                 # Drink Counter Data
├── achievements.json           # Achievements Data
├── command_usage.json          # Command Usage Stats
├── currency.json              # 💰 NEW: Gold/Currency System
├── fish_inventory.json        # 🎣 NEW: Fish Inventory
├── package.json
│
├── extension/                 # 🌐 NEW: Twitch Extension
│   ├── panel.html
│   ├── config.html
│   ├── client.js
│   ├── styles.css
│   ├── extension.json
│   └── README.md
│
└── extension-backend/         # 🔧 NEW: Backend Server
    ├── server.js
    ├── package.json
    └── .env
```

## 🚀 Schritt 1: Main Bot Setup

### 1.1 Dependencies installieren
```bash
npm install tmi.js dotenv
```

### 1.2 .env Datei erstellen
```bash
# In root directory
cat > .env << EOF
TWITCH_BOT_USERNAME=nekobot
TWITCH_OAUTH_TOKEN=oauth:your_token_here
TWITCH_CHANNEL=your_channel_name
TWITCH_EXT_SECRET=your-extension-secret
EOF
```

### 1.3 Bot starten
```bash
node index.js
```

✅ Du solltest sehen:
```
✅ connected: irc.chat.twitch.tv:6667
✅ joined #yourchannel as nekobot
```

## 💰 Step 2: Currency System (bereits integriert!)

### Neue Commands:
```
!angeln        → Fange Fische + verdiene Gold (0.5 Gold/cm)
!gold          → Zeige dein Gold
!inventory     → Zeige deine Fische
!sell [1-n]    → Verkaufe einen Fisch
```

### Beispiel im Chat:
```
User: !angeln
Bot:  @User Die Angel wird ausgeworfen... [...] Ergebnis: 120cm Wels 🐋 
      Du hast einen riesigen Fisch gefangen! | +60🏆 (Total: 250🏆)

User: !gold
Bot:  @User 🏆 Gold: 250 | Insgesamt verdient: 1100

User: !sell 1
Bot:  @User Verkauft: 120cm Wels 🐋 für 180🏆 (Total: 430🏆)
```

### Daten Struktur
```json
// currency.json
{
  "matty": {
    "gold": 250,
    "totalEarned": 1100,
    "upgrades": {
      "premium_bait": true,
      "soundalert": false
    },
    "craftedItems": []
  }
}
```

## 🌐 Step 3: Twitch Extension Setup

### 3.1 Backend starten (separates Terminal)
```bash
cd extension-backend
npm install
cp .env.example .env
# WICHTIG: .env editieren und TWITCH_EXT_SECRET hinzufügen!
npm start
```

Du solltest sehen:
```
✅ Extension Backend läuft auf http://localhost:3001
```

### 3.2 Twitch Developer Console
1. Gehe zu: https://dev.twitch.tv/console/extensions
2. Klicke "Create Extension"
3. Type: "Panel"
4. Notiere dir:
   - **Client ID**
   - **Version** (z.B. 1.0.0)
   - **Signing Secret**

### 3.3 Extension hochladen & deployen
```bash
cd extension

# ZIP packen
zip -r extension.zip *.html *.js *.css *.json

# Mit Twitch CLI uploaden
twitch ext upload \
  --client-id YOUR_CLIENT_ID \
  --version 1.0.0 \
  -z extension.zip
```

### 3.4 Im Twitch Creator Dashboard testen
1. Gehe zu https://creator.twitch.tv/
2. Panels → "Add a Panel"
3. Wähle "Neko Bot Inventory"
4. Öffne die Extension
5. Wenn alles grün ist: Extension funktioniert! 🎉

## 🧪 Testing

### Test 1: Bot Commands
```bash
# Im Twitch Chat:
!angeln      # Sollte Fisch + Gold geben
!gold        # Sollte dein Gold zeigen
!inventory   # Sollte deine Fische zeigen
!sell 1      # Sollte Fisch verkaufen
```

### Test 2: Backend API
```bash
# Terminal Test
curl http://localhost:3001/health

# Sollte antworten:
# {"status":"OK"}
```

### Test 3: Extension (im Twitch Panel)
- Öffne dein Twitch Channel
- Gehe zum Panel
- Du solltest sehen:
  - 🏆 Dein Gold
  - 🎣 Deine Fische
  - Shop mit Upgrades

## 🎫 Soundalerts Integration (optional)

Um mit Gold Soundalerts zu triggern, musst du noch ein Command hinzufügen:

```javascript
// in index.js, im commands object:
soundalert: async (channel, tags, args) => {
  const username = getUsername(tags);
  const cost = 50; // 50 Gold für einen Alert
  
  const currentGold = removeGold(username, cost);
  if (currentGold === null) {
    return { text: `@${username} Du hast nicht genug Gold! (kostet ${cost}🏆)`, count: false };
  }
  
  // Hier: Webhook zu Soundalerts/YouTube senden
  // z.B. POST zu streamlabs.com/api/alerts/...
  
  return { text: `@${username} 🔊 Soundalert gesendet! -${cost}🏆`, count: true };
}
```

## 📊 File Structure & Data

### currency.json
```json
{
  "username": {
    "gold": 500,
    "totalEarned": 1500,
    "upgrades": {
      "premium_bait": true,
      "deep_water": false
    },
    "craftedItems": ["item1", "item2"]
  }
}
```

### fish_inventory.json
```json
{
  "username": [
    {
      "name": "Wels",
      "size": 145,
      "emoji": "🐋",
      "timestamp": "2024-03-16T12:34:56.000Z"
    }
  ]
}
```

## 🔧 Troubleshooting

### Bot startet nicht
```
❌ "Cannot find module 'tmi.js'"
→ npm install tmi.js

❌ "undefined channels"
→ Check .env Datei: TWITCH_CHANNEL muss gesetzt sein
```

### Extension zeigt "Loading..."
```
❌ Backend antwortet nicht
→ Stelle sicher: cd extension-backend && npm start

❌ CORS Error
→ Frontend ruft falschen BACKEND_URL auf (check client.js:3)
```

### Gold wird nicht gespeichert
```
❌ currency.json wird nicht erstellt
→ Stelle sicher, dass index.js !angeln verwendet
→ Check currency.json Permissions (lesbar/schreibbar)
```

## 📈 Nächste Features

- [ ] Crafting System (!craft command)
- [ ] Leaderboards (!top, !stats)
- [ ] Achievements in Extension
- [ ] Trading zwischen Spielern
- [ ] Advanced Shop mit saisonalen Items
- [ ] Gamification (Quests, Challenges)

## 🆘 Support

**Logs anschauen:**
```bash
# Bot Logs (Terminal wo node läuft)
# Extension Logs (Browser F12 → Console)
# Backend Logs (Terminal wo npm start läuft)
```

**Häufige Probleme:**
- Token ungültig? → Neue Token generieren auf Twitch Creator Dashboard
- Extension wird nicht geladen? → Refresh Browser, Clear Cache
- Backend antwortet nicht? → Port 3001 bereits in Benutzung? → `netstat -ano | findstr 3001`

---

✨ **Viel Erfolg mit deinem Bot!** ✨

Bei Fragen: Check die Extension/README.md für Details!
