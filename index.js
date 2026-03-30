import tmi from "tmi.js";
import "dotenv/config";
import fs from "fs";
import path from "path";
import { getDataDir, getStorageInfo, initPersistentCache, syncState } from "./storage.js";

/* ========================
   ENV + CONNECT
======================== */

const DATA_DIR = getDataDir();
const DEFAULT_ACHIEVEMENTS = {
  boobsH: { globalUnlocked: false, firstBy: null, unlockedUsers: {} },
  boobsBeasty: { globalUnlocked: false, firstBy: null, unlockedUsers: {} },
};

await initPersistentCache({
  drinks: { count: 0 },
  achievements: DEFAULT_ACHIEVEMENTS,
  command_usage: { commands: {} },
  fish_inventory: {},
  currency: {},
  user_map: { byId: {}, byName: {} },
});

const storageInfo = getStorageInfo();
const SHOP_BASE_URL = String(
  process.env.PUBLIC_SHOP_URL ||
  process.env.SHOP_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3001")
).replace(/\/$/, "");

console.log("Data directory:", DATA_DIR);
console.log(`Storage mode: ${storageInfo.mode} (${storageInfo.location})`);

const PASSWORD = process.env.TWITCH_OAUTH_TOKEN?.startsWith("oauth:")
  ? process.env.TWITCH_OAUTH_TOKEN
  : `oauth:${process.env.TWITCH_OAUTH_TOKEN || ""}`;

const channels = (process.env.TWITCH_CHANNELS || process.env.TWITCH_CHANNEL || "")
  .split(",")
  .map(c => c.trim().replace(/^#/, ""))
  .filter(Boolean);

console.log("Join channels:", channels);

const client = new tmi.Client({
  options: { debug: true },
  identity: {
    username: process.env.TWITCH_BOT_USERNAME,
    password: PASSWORD,
  },
  channels,
});

client.on("connected", (addr, port) => console.log(`✅ connected: ${addr}:${port}`));
client.on("join", (channel, username, self) => {
  if (self) console.log(`✅ joined ${channel} as ${username}`);
});
client.on("disconnected", (reason) => console.log("❌ disconnected:", reason));

/* ========================
   PERSISTENTE DATEN
======================== */

const DRINK_FILE = path.join(DATA_DIR, "drinks.json");
let drinkCount = 0;

if (fs.existsSync(DRINK_FILE)) {
  drinkCount = JSON.parse(fs.readFileSync(DRINK_FILE)).count || 0;
} else {
  fs.writeFileSync(DRINK_FILE, JSON.stringify({ count: 0 }, null, 2));
}

function saveDrinks() {
  syncState("drinks", { count: drinkCount });
}

const ACH_FILE = path.join(DATA_DIR, "achievements.json");

const ACH_LIST = [
  { key: "cock69", name: "Die perfekte Länge", desc: "Rolle 69cm bei !cock", hidden: true },
  { key: "boobsH", name: "Größer als ein Ballon", desc: "Rolle H bei !boobs", hidden: true },
  { key: "boobsBeasty", name: "Beasty Mode Unlocked", desc: "Rolle Beasty bei !boobs", hidden: true },
  { key: "Fisch200", name: "Legendärer Fang", desc: "Fange 200cm bei !angeln", hidden: true },

  // Beispiele für nicht-versteckte Achievements:
  // { key: "hug100", name: "True Love", desc: "Erreiche 100% Liebe bei !hug", hidden: false },
  // { key: "fish200", name: "Legendärer Fang", desc: "Fange 200cm bei !angeln", hidden: true },
];
// Struktur:
// {
//   "boobsH": {
//     "globalUnlocked": true/false,
//     "firstBy": "username",
//     "unlockedUsers": { "user1": true, "user2": true }
//   }
// }

let achievements = {
  ...DEFAULT_ACHIEVEMENTS,
};

if (fs.existsSync(ACH_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(ACH_FILE, "utf8"));
    achievements = {
      ...achievements,
      ...data,
    };
  } catch {
    fs.writeFileSync(ACH_FILE, JSON.stringify(achievements, null, 2));
  }
} else {
  fs.writeFileSync(ACH_FILE, JSON.stringify(achievements, null, 2));
}

function saveAchievements() {
  syncState("achievements", achievements);
}

/**
 * Generische Achievement-Logik für beliebige Events.
 * @param {string} key - Der Schlüssel in achievements (z.B. 'boobsH', 'cock69')
 * @param {string} achievementName - Der Name des Achievements für die Nachricht
 * @param {string} username - Der Benutzername
 * @param {string} shortName - Kurzer Name für Wiederholung (z.B. 'H', '69cm')
 * @returns {string} - Der Achievement-Text oder leerer String
 */
function handleAchievement(key, achievementName, username, shortName) {
  if (!achievements[key]) {
    achievements[key] = {
      globalUnlocked: false,
      firstBy: null,
      unlockedUsers: {},
    };
  }

  const alreadyUser = !!achievements[key].unlockedUsers[username];

  if (!alreadyUser) {
    achievements[key].unlockedUsers[username] = true;

    let achText = "";
    if (!achievements[key].globalUnlocked) {
      achievements[key].globalUnlocked = true;
      achievements[key].firstBy = username;
      achText = ` 🏆 ACHIEVEMENT UNLOCKED: "${achievementName}" (Erstfund von @${username})`;
    } else {
      achText = ` 🏆 ACHIEVEMENT UNLOCKED: "${achievementName}"`;
    }

    saveAchievements();
    return achText;
  }

  return ` ✨ (${shortName} schon mal gehabt!)`;
}

const USAGE_FILE = path.join(DATA_DIR, "command_usage.json");

let commandUsage = { commands: {} };

if (fs.existsSync(USAGE_FILE)) {
  try {
    commandUsage = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8")) || { commands: {} };
  } catch {
    commandUsage = { commands: {} };
    fs.writeFileSync(USAGE_FILE, JSON.stringify(commandUsage, null, 2));
  }
} else {
  fs.writeFileSync(USAGE_FILE, JSON.stringify(commandUsage, null, 2));
}

function saveUsage() {
  syncState("command_usage", commandUsage);
}

function incUsage(commandName, username) {
  if (!commandUsage.commands[commandName]) commandUsage.commands[commandName] = {};
  commandUsage.commands[commandName][username] = (commandUsage.commands[commandName][username] || 0) + 1;
  saveUsage();
}

/* ========================
   FISCH INVENTAR
======================== */

const FISH_INVENTORY_FILE = path.join(DATA_DIR, "fish_inventory.json");
let fishInventory = {};

if (fs.existsSync(FISH_INVENTORY_FILE)) {
  try {
    fishInventory = JSON.parse(fs.readFileSync(FISH_INVENTORY_FILE, "utf8")) || {};
  } catch {
    fishInventory = {};
    fs.writeFileSync(FISH_INVENTORY_FILE, JSON.stringify(fishInventory, null, 2));
  }
} else {
  fs.writeFileSync(FISH_INVENTORY_FILE, JSON.stringify(fishInventory, null, 2));
}

function saveFishInventory() {
  syncState("fish_inventory", fishInventory);
}

/* ========================
   CURRENCY / GOLD SYSTEM
======================== */

const CURRENCY_FILE = path.join(DATA_DIR, "currency.json");
let currency = {}; // { username: { gold: 0, totalEarned: 0 } }

const USER_MAP_FILE = path.join(DATA_DIR, "user_map.json");
let userMap = { byId: {}, byName: {} };

if (fs.existsSync(USER_MAP_FILE)) {
  try {
    userMap = JSON.parse(fs.readFileSync(USER_MAP_FILE, "utf8")) || { byId: {}, byName: {} };
    userMap.byId = userMap.byId || {};
    userMap.byName = userMap.byName || {};
  } catch {
    userMap = { byId: {}, byName: {} };
    fs.writeFileSync(USER_MAP_FILE, JSON.stringify(userMap, null, 2));
  }
} else {
  fs.writeFileSync(USER_MAP_FILE, JSON.stringify(userMap, null, 2));
}

function saveUserMap() {
  syncState("user_map", userMap);
}

if (fs.existsSync(CURRENCY_FILE)) {
  try {
    currency = JSON.parse(fs.readFileSync(CURRENCY_FILE, "utf8")) || {};
  } catch {
    currency = {};
    fs.writeFileSync(CURRENCY_FILE, JSON.stringify(currency, null, 2));
  }
} else {
  fs.writeFileSync(CURRENCY_FILE, JSON.stringify(currency, null, 2));
}

function saveCurrency() {
  syncState("currency", currency);
}

// Wichtig: Lade aktuelle Werte von Disk vor jeder Operation!
function reloadCurrency() {
  if (fs.existsSync(CURRENCY_FILE)) {
    try {
      currency = JSON.parse(fs.readFileSync(CURRENCY_FILE, "utf8")) || {};
    } catch (err) {
      console.error("Error reloading currency:", err);
    }
  }
}

function addGold(username, amount) {
  reloadCurrency(); // Stelle sicher dass wir aktuelle Werte haben!
  if (!currency[username]) {
    currency[username] = { gold: 0, totalEarned: 0, upgrades: {}, craftedItems: [] };
  }
  currency[username].gold += amount;
  currency[username].totalEarned += amount;
  saveCurrency();
  return currency[username].gold;
}

function removeGold(username, amount) {
  reloadCurrency(); // Stelle sicher dass wir aktuelle Werte haben!
  if (!currency[username]) currency[username] = { gold: 0, totalEarned: 0, upgrades: {}, craftedItems: [] };
  
  if (currency[username].gold < amount) return null; // Nicht genug Gold
  
  currency[username].gold -= amount;
  saveCurrency();
  return currency[username].gold;
}

function getGold(username) {
  return currency[username]?.gold || 0;
}

function getUserStats(username) {
  return currency[username] || { gold: 0, totalEarned: 0, upgrades: {}, craftedItems: [] };
}

function getTopUsers(commandName, topN = 3) {
  const map = commandUsage.commands[commandName] || {};
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])      // desc by count
    .slice(0, topN);
}

function getUserCount(commandName, username) {
  return commandUsage.commands?.[commandName]?.[username] || 0;
}

/* ========================
   COOLDOWNS + WARN/IGNORE
======================== */

// pro commandName: Map(username -> lastTimestamp)
const cooldowns = {
  cock: new Map(),
  angeln: new Map(),
  saufen: new Map(),
  lurk: new Map(), // wenn du keinen Cooldown willst, einfach unten nicht setzen
  boobs: new Map(),
  bonk: new Map(),
};

// pro commandName: Cooldown-Zeit
const cooldownMs = {
  cock: 20 * 60 * 1000,    // 20 min
  angeln: 5 * 60 * 1000,   // 5 min
  saufen: 10 * 60 * 1000,  // 10 min
  boobs: 5 * 60 * 1000,
  bonk: 5 * 1000, 

};

// pro commandName: Map(username -> warned?)
const warnedUsers = {
  saufen: new Map(), // nur saufen hat warn+ignore
  cock: new Map(), 
  angeln: new Map(),
  boobs: new Map(),
  bonk: new Map(),

};

function formatTime(ms) {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getUsername(tags) {
  return (tags?.username || tags?.["display-name"] || "user").toLowerCase();
}

function buildShopUrl(username = "") {
  const base = SHOP_BASE_URL || "http://localhost:3001";
  return username
    ? `${base}/shop?user=${encodeURIComponent(username)}`
    : `${base}/shop`;
}

function recordUserIdentity(tags) {
  const username = getUsername(tags);
  const userId = String(tags?.["user-id"] || "").trim();

  if (!username) {
    return;
  }

  let changed = false;

  if (userId && userMap.byId[userId] !== username) {
    userMap.byId[userId] = username;
    changed = true;
  }

  if (userMap.byName[username] !== userId) {
    userMap.byName[username] = userId || userMap.byName[username] || "";
    changed = true;
  }

  if (changed) {
    saveUserMap();
  }
}


/**
 * Prüft Cooldown.
 * - Wenn kein cooldown definiert: ok=true
 * - Wenn aktiv: ok=false + remaining
 * - Wenn ok: setzt lastTimestamp
 */
function checkCooldown(commandName, username) {
  const map = cooldowns[commandName];
  const cd = cooldownMs[commandName];

  if (!map || !cd) return { ok: true };

  const now = Date.now();
  const last = map.get(username);

  if (last && now - last < cd) {
    return { ok: false, remaining: cd - (now - last) };
  }

  map.set(username, now);
  return { ok: true };
}

/**
 * Warn+Ignore helper:
 * - Wenn cooldown aktiv:
 *   - wenn noch nicht gewarnt -> warnText
 *   - sonst -> null (ignorieren)
 * - Wenn cooldown ok: warned reset + ok=true
 */
function cooldownWarnIgnore(commandName, username, warnTextFn) {
  const cd = checkCooldown(commandName, username);

  const warnMap = warnedUsers[commandName];
  if (!cd.ok) {
    // wenn kein warnMap existiert -> einfach immer cooldown-text zurückgeben
    if (!warnMap) return { ok: false, response: warnTextFn(cd.remaining), remaining: cd.remaining };

    if (!warnMap.get(username)) {
      warnMap.set(username, true);
      return { ok: false, response: warnTextFn(cd.remaining), remaining: cd.remaining };
    }
    return { ok: false, response: null, remaining: cd.remaining }; // danach ignorieren
  }

  // cooldown ok -> warn-status resetten (falls vorhanden)
  if (warnMap) warnMap.delete(username);
  return { ok: true, response: null };
}

/* Optional: Cleanup gegen wachsende Maps (1x pro Stunde) */
setInterval(() => {
  const now = Date.now();
  for (const [cmd, map] of Object.entries(cooldowns)) {
    const cd = cooldownMs[cmd];
    if (!cd) continue;
    for (const [user, ts] of map.entries()) {
      // wenn Eintrag älter als 2x Cooldown, weg damit
      if (now - ts > cd * 2) map.delete(user);
    }
  }
  for (const [cmd, map] of Object.entries(warnedUsers)) {
    // warn-maps können wir grob an cooldown koppeln
    const cd = cooldownMs[cmd] ?? 10 * 60 * 1000;
    for (const user of map.keys()) {
      // wenn es keinen cooldown-eintrag mehr gibt -> warn weg
      if (!cooldowns[cmd]?.has(user)) map.delete(user);
      else {
        const ts = cooldowns[cmd].get(user);
        if (ts && now - ts > cd * 2) map.delete(user);
      }
    }
  }
}, 60 * 60 * 1000);

function getTopCommands(topN = 3) {
  const cmds = commandUsage.commands || {};

  const totals = Object.entries(cmds).map(([cmd, users]) => {
    const total = Object.values(users || {}).reduce((a, b) => a + b, 0);
    return [cmd, total];
  });

  return totals
    .filter(([_, total]) => total > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

function getUserTopCommands(username, topN = 3) {
  const cmds = commandUsage.commands || {};

  const list = Object.entries(cmds).map(([cmd, users]) => {
    const cnt = users?.[username] || 0;
    return [cmd, cnt];
  });

  return list
    .filter(([_, cnt]) => cnt > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

/* ========================
   COMMAND REGISTRY
======================== */

const commands = {
  
cock: async (channel, tags) => {
  const username = getUsername(tags);

  const gate = cooldownWarnIgnore(
    "cock",
    username,
    (remaining) => `@${username} Du kannst !cock erst wieder in ${formatTime(remaining)} benutzen.`
  );

  if (!gate.ok) return { text: gate.response ?? undefined, count: false };

  const eventRoll = Math.random();

  if (eventRoll < 0.02) {
    return {
      text: `🚨 Messfehler! @${username} sprengt die Skala. Die Wissenschaft ist ratlos.`,
      count: true
    };
  }

  const n = Math.floor(Math.random() * 69) + 1;

  const intros = [
    "Der Chat nimmt das Maßband raus...",
    "Ein professioneller Vermesser erscheint...",
    "Die wissenschaftliche Untersuchung beginnt...",
    "Die Twitch-Messkommission überprüft die Daten...",
    "Neko guckt ihn sich mal an und misst..."
  ];

  const reactions = {
    tiny: [
      "Klein aber fein!",
      "Der passt noch in die Büx.",
      "Minimalismus ist auch eine Philosophie.",
    ],
    mid: [
      "Stabil.",
      "Der Chat nickt respektvoll.",
      "Solide Größe."
    ],
    big: [
      "Das ist ein ordentliche Länge!",
      "Der Chat ist beeindruckt.",
      "Hoffentlich ist die Hose lang genug."
    ]
  };

  let extra = "";

  if (n <= 10) extra = rand(reactions.tiny);
  else if (n <= 40) extra = rand(reactions.mid);
  else extra = rand(reactions.big);

  if (n === 69) extra = "Nice. Der Chat rastet komplett aus.";

  let achText = "";
  if (n === 69) achText = handleAchievement("cock69", "Die perfekte Länge", username, "69cm");

  return {
    text: `${rand(intros)} Ergebnis: @${username} misst heute ${n}cm 🍆 — ${extra}${achText}`,
    count: true
  };
},

  angeln: async (channel, tags) => {
  const username = getUsername(tags);

  const gate = checkCooldown("angeln", username);

  if (!gate.ok) {
    return { text: `@${username} Du kannst erst wieder in ${formatTime(gate.remaining)} angeln.`, count: false };
  }

  // Helper Funktion
  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Fisch-Typen Definition
  const FISH_TYPES = [
  {
    name: "Karpfen",
    emoji: "🐟",
    minSize: 30,
    maxSize: 120,
    weight: 25
  },
  {
    name: "Forelle",
    emoji: "🐠",
    minSize: 20,
    maxSize: 80,
    weight: 25
  },
  {
    name: "Barsch",
    emoji: "🐟",
    minSize: 15,
    maxSize: 50,
    weight: 20
  },
  {
    name: "Hecht",
    emoji: "🍣",
    minSize: 60,
    maxSize: 150,
    weight: 15
  },
  {
    name: "Wels",
    emoji: "🐋",
    minSize: 80,
    maxSize: 220,
    weight: 10
  },
  {
    name: "Goldfisch",
    emoji: "🐠",
    minSize: 5,
    maxSize: 15,
    weight: 4
  },
  {
    name: "Alter Stiefel",
    emoji: "👢",
    minSize: 10,
    maxSize: 40,
    weight: 1
  }
];
  
  // Wähle einen Fischtyp basierend auf Gewichtungen
  const totalWeight = FISH_TYPES.reduce((sum, f) => sum + f.weight, 0);
  let random = Math.random() * totalWeight;
  let fish = FISH_TYPES[0];
  
  for (const f of FISH_TYPES) {
    random -= f.weight;
    if (random <= 0) {
      fish = f;
      break;
    }
  }
  
  // Generiere Größe im definierten Bereich
  const size = Math.floor(Math.random() * (fish.maxSize - fish.minSize + 1)) + fish.minSize;
  
  const fishingScenes = [
  "Die Angel wird ausgeworfen...",
  "Das Wasser gluckert leise...",
  "Ein Schatten bewegt sich unter der Oberfläche...",
  "Der Köder verschwindet im Wasser..."
];

  const catchScenes = [
  "Plötzlich zieht etwas stark an der Leine!",
  "Die Angel biegt sich gefährlich!",
  "Der Fisch kämpft wie verrückt!",
  "Ein riesiger Schatten taucht auf!"
];

  // Initialisiere Inventar für User falls nicht vorhanden
  if (!fishInventory[username]) {
    fishInventory[username] = [];
  }
  
  // Addiere Fisch zum Inventar
  fishInventory[username].push({
    name: fish.name,
    size: size,
    emoji: fish.emoji,
    timestamp: new Date().toISOString()
  });

  saveFishInventory();
  incUsage("angeln", username);
  
  // Gold berechnen: 5 Gold pro 10cm = 0.5 Gold pro cm
  const goldEarned = Math.floor(size * 0.5);
  const currentGold = addGold(username, goldEarned);
  
  let extra = "";
  if (size >= 150) extra = " — Du hast den legendären Fisch gefangen! 👑";
  else if (size >= 100) extra = " — Du hast einen riesigen Fisch gefangen! 🐟";
  else if (size >= 80) extra = " — Sehr beeindruckend! 🎣";
  else if (size >= 50) extra = " — Der sieht lecker aus!";
  else if (size >= 30) extra = " — Joa damit könnte man was anfangen...";
  else extra = " — Süßer Kleine, aber zum Braten ein bisschen dünn.";
  
  let achText = "";
  if (size >= 200) {achText = handleAchievement("Fisch200", "Legendärer Fang", username, "200cm");}

  return { text: `@${username} ${rand(fishingScenes)} ${rand(catchScenes)} Ergebnis: ${size}cm ${fish.name} ${fish.emoji}${extra} | +${goldEarned}🏆 (Total: ${currentGold}🏆)${achText}`, count: true };
},
  
  saufen: async (channel, tags) => {
    const username = getUsername(tags);

    // warn+ignore nur für saufen
    const gate = cooldownWarnIgnore(
      "saufen",
      username,
      (remaining) => `@${username} ⏳ Noch ${formatTime(remaining)} bis zum nächsten Drink.`
    );

    if (!gate.ok) {
      return { text: gate.response ?? undefined, count: false };
    }

    drinkCount++;
    saveDrinks();
    return { text: `Neko hat schon ${drinkCount} Drinks geschlürft.`, count: true };
  },

  lurk: async (channel, tags) => {
    const username = getUsername(tags);
    return { text: `@${username} schleicht sich in eine ruhige Ecke. Viel Spaß!`, count: true };
  },

love: async (channel, tags, args) => {
  const from = getUsername(tags);

  const targetRaw = (args?.[0] || "").trim();
  const target = targetRaw.replace(/^@/, "");

  if (!target) {
    return `@${from} wen willst du umarmen? Beispiel: !love @Fischbrötchen`;
  }

  if (target.toLowerCase() === from.toLowerCase()) {
    const selfTexts = [
      "versucht sich selbst zu umarmen...",
      "umarmt sich selbst. Flexibilität 100.",
      "probiert Selbstumarmung.",
      "fragt sich kurz was im Leben falsch gelaufen ist."
    ];
    return `@${from} ${selfTexts[Math.floor(Math.random() * selfTexts.length)]}`;
  }

  const lick = Math.floor(Math.random() * 100) + 1;

  const intros = [
    "Die Arme werden vorbereitet...",
    "Der Chat hält kurz den Atem an...",
    "Eine mysteriöse Umarmungs-Aktion beginnt...",
    "Die Umarmungsposition wird eingenommen...",
    "Ein seltsames Ritual startet..."
  ];

  const Lovereactions = {
    weak: [
      "Das war eher ein vorsichtiges Antippen.",
      "Mehr Liebe wäre hilfreich gewesen.",
      "Das war… minimal liebevoll.",
      "Der Versuch war da."
    ],
    mid: [
      "Die Umarmung ist in Ordnung.",
      "Das war schon ordentlich Liebe.",
      `@${target} guckt peinlich berührt weg.`,
      "Solide Umarmungs-Technik."
    ],
    strong: [
      "Ui da werden die Arme ordentlich geschwungen!",
      "Da wird jemand richtig durch geknuddelt.",
      "Man spürt die Liebe.",
      "Oh da bahnt sich was an!"
    ],
    legendary: [
      "Die Umarmung ist so stark wie ein Fleischstreifen im Döner. Da kommt niemand mehr raus! 💖",
      "Die Liebe ist so stark, dass die Zeit stillsteht.",
      "Wann ist die Hochzeit??",
      "WTF DAS IST MEHR ALS LIEBE, DAS IST SCHICKSAL!"
    ]
  };

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  let extra = "";

  if (lick === 100) extra = rand(Lovereactions.legendary);
  else if (lick >= 80) extra = rand(Lovereactions.strong);
  else if (lick >= 50) extra = rand(Lovereactions.mid);
  else extra = rand(Lovereactions.weak);

  let achText = "";
  if (lick === 100) {
    achText = handleAchievement("love100", "Lovers", from, "100%");
  }

  return `${rand(intros)} @${from} umarmt @${target} mit ${lick}% Kraft — ${extra}${achText}`;
},

rehug: async (channel, tags, args) => {
  const from = getUsername(tags);

  // Zielperson: erstes Argument, ohne führendes @
  const targetRaw = (args?.[0] || "").trim();
  const target = targetRaw.replace(/^@/, "");

  if (!target) {
    return `@${from} wen willst du zurück umarmen? Beispiel: !rehug @Fischbrötchen`;
  }

  // optional: sich selbst umarmen verhindern
  if (target.toLowerCase() === from.toLowerCase()) {
    return `@${from} möchte sich selbst zurück umarmen? Das ist doch ein bisschen traurig...`;
  }

  const love = Math.floor(Math.random() * 100) + 1; // 1-100

  const rehugReactions = {
    weak: ["Das war eher ein vorsichtiges Antippen.", "Mehr Liebe wäre hilfreich gewesen.", "Der Versuch war da."],
    mid: ["Die Umarmung ist in Ordnung.", "Das war schon ordentlich Liebe.", "Solide Umarmungs-Technik."],
    strong: ["Ui da werden die Arme ordentlich geschwungen!", "Da wird jemand richtig durch geknuddelt.", "Man spürt die Liebe."],
    legendary: ["Die Umarmung ist so stark wie ein Fleischstreifen im Döner. Da kommt niemand mehr raus! 💖", "Die Liebe ist so stark, dass die Zeit stillsteht.", "SCHICKSAL!"]
  };

  let extra = "";
  if (love === 100) extra = rand(rehugReactions.legendary);
  else if (love >= 80) extra = rand(rehugReactions.strong);
  else if (love >= 50) extra = rand(rehugReactions.mid);
  else extra = rand(rehugReactions.weak);

  return `@${from} umarmt @${target} mit ${love}% Liebe zurück 🤗 ${extra}`;
},

lick: async (channel, tags, args) => {
  const from = getUsername(tags);

  const targetRaw = (args?.[0] || "").trim();
  const target = targetRaw.replace(/^@/, "");

  if (!target) {
    return `@${from} wen willst du abschlecken? Beispiel: !lick @Fischbrötchen`;
  }

  if (target.toLowerCase() === from.toLowerCase()) {
    const selfTexts = [
      "versucht sich selbst abzuschlecken... Chat ist maximal verwirrt.",
      "leckt sich selbst. Flexibilität 100.",
      "probiert Selbstpflege der besonderen Art.",
      "fragt sich kurz was im Leben falsch gelaufen ist."
    ];
    return `@${from} ${selfTexts[Math.floor(Math.random() * selfTexts.length)]}`;
  }

  const lick = Math.floor(Math.random() * 100) + 1;

  const intros = [
    "Die Zunge wird vorbereitet...",
    "Der Chat hält kurz den Atem an...",
    "Eine mysteriöse Schleck-Aktion beginnt...",
    "Die Speichelproduktion steigt gefährlich an...",
    "Ein seltsames Ritual startet..."
  ];

  const Lickreactions = {
    weak: [
      "Das war eher ein vorsichtiges Antippen.",
      "Mehr Speichel wäre hilfreich gewesen.",
      "Das war… minimal feucht.",
      "Der Versuch war da."
    ],
    mid: [
      "Die Hand ist jetzt blitzblank.",
      "Das war schon ordentlich Speichel.",
      "Der Chat guckt angewiedert weg.",
      "Solide Schleck-Technik."
    ],
    strong: [
      "Ui da wird die Zunge ordentlich geschwungen!",
      "Da wird jemand richtig eingesaut.",
      "Das ist schon professionelles Schlecken.",
      "Der Chat ist gleichzeitig beeindruckt und verstört."
    ],
    legendary: [
      "Da wird jemand einmal komplett durch geschlabbert! 💦",
      "Die Zunge bewegt sich schneller als das Licht.",
      "Legendärer Schleckangriff aktiviert.",
      "WTF WAS WAR DAS"
    ]
  };

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  let extra = "";

  if (lick === 100) extra = rand(Lickreactions.legendary);
  else if (lick >= 80) extra = rand(Lickreactions.strong);
  else if (lick >= 50) extra = rand(Lickreactions.mid);
  else extra = rand(Lickreactions.weak);

  let achText = "";
  if (lick === 100) {
    achText = handleAchievement("lick100", "Lick Master", from, "100%");
  }

  return `${rand(intros)} @${from} leckt @${target} mit ${lick}% Kraft 👅 — ${extra}${achText}`;
},

boobs: async (channel, tags) => {
  const username = getUsername(tags);

  const gate = cooldownWarnIgnore(
    "boobs",
    username,
    (remaining) => `@${username} Noch ${formatTime(remaining)} bis zum nächsten Größen Check.`
  );
  if (!gate.ok) return { text: gate.response ?? undefined, count: false };

  // Größen-Chancen in Prozent
  const sizePercents = {
    A: 20,
    B: 20,
    C: 15,
    D: 15,
    E: 10,
    F: 10,
    G: 5,
    H: 0.01,
    Beasty: 0.00001, // Spaßwert, damit Beasty theoretisch auch möglich ist, aber mega selten :D
  };

  // Zufällige Auswahl basierend auf den Prozentwerten. Die Werte müssen
  // nicht exakt 100 ergeben — sie werden relativ zueinander verwendet.
  const total = Object.values(sizePercents).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  let size;
  for (const [s, p] of Object.entries(sizePercents)) {
    if (r < p) {
      size = s;
      break;
    }
    r -= p;
  }
  if (!size) size = "A"; // Fallback

  let extra = "";
  switch (size) {
    case "A": extra = " — Die sind ja kleiner als meine??"; break;
    case "B": extra = " — Ich empfehle dir mal BH-Pads zu tragen..."; break;
    case "C": extra = " — Beasty würde sie schonmal angucken."; break;
    case "D": extra = " — Da bleibt der Blick gern mal hängen 😂"; break;
    case "E": extra = " — Achtung Rückenprobleme incoming!!"; break;
    case "F": extra = " — Wo hast du die Luftpumpe versteckt?? 🤯"; break;
    case "G": extra = " — Bei welchem Hentai spielst du denn die Hauptrolle??"; break;
    case "H": extra = " — Crazy solche Heißuftballons hast auch nur du..."; break;
    case "Beasty": extra = " - Yoo das hätte niemand gedacht!"; break;
  }

  // Achievement-Logik für seltene Größen
  let achText = "";
  if (size === "H") {
    achText = handleAchievement("boobsH", "Größer als ein Ballon", username, "H");
  } else if (size === "Beasty") {
    achText = handleAchievement("boobsBeasty", "Beasty Mode Unlocked", username, "Beasty");
  }

  
  return { text: `@${username} hat einfach Körbchengröße ${size}${extra}${achText}`, count: true };
},

bonk: async (channel, tags, args) => {
  const from = getUsername(tags);

  const targetRaw = (args?.[0] || "").trim();
  const target = targetRaw.replace(/^@/, "");
 if (!target) return { text: `@${from} wen willst du bonken? Beispiel: !bonk @Person`, count: false };

  // Nur Mods/Broadcaster dürfen timeout-bonken (Anti-Missbrauch)
  const isMod = !!tags.mod;
  const isBroadcaster = tags.badges?.broadcaster === "1";
  if (!isMod && !isBroadcaster) {
  return { text: `@${from} Bonk geht klar – aber Bewusstlos-Bonk (Timeout) dürfen nur Mods.`, count: false };
  }

  // Cooldown (optional)
  const gate = cooldownWarnIgnore(
    "bonk",
    from,
    (remaining) => `@${from} ⏳ Noch ${formatTime(remaining)} bis du jemanden wieder bonken darfst.`
  );
  if (!gate.ok) return { text: gate.response ?? undefined, count: false };

  const power = Math.floor(Math.random() * 100) + 1;

  // Nicht Broadcaster/Mods timeouten (Sicherheit)
  const targetIsBroadcaster = target.toLowerCase() === channel.replace("#", "").toLowerCase();

  let extra = "";
  if (power === 100) extra = " Da wurd wohl jemand bewusstlos gehauen!";
  else if (power >= 75) extra = " Ui das hat gesessen!";
  else if (power >= 40) extra = " Hoffentlich ist noch alles heil!";
  else extra = " Das ist ja eher ein Tätscheln!";

  // Timeout bei ULTRA BONK
  if (power === 100 && !targetIsBroadcaster) {
    try {
      // 10 Sekunden Timeout
      await client.timeout(channel, target, 10, "ULTRA BONK (kurz bewusstlos)");
    } catch (e) {
      // Falls Bot nicht mod ist / keine Rechte hat
      console.error("Timeout fehlgeschlagen:", e);
      // optional: stille ignorieren oder Hinweis ausgeben
    }
  }

  return { text: `@${from} bonkt @${target} mit ${power}% Stärke ${extra}`, count: true };
},

achievements: async (channel, tags) => {
  const username = getUsername(tags);

  const has = (key) => !!achievements?.[key]?.unlockedUsers?.[username];

  const total = ACH_LIST.length;
  const unlocked = ACH_LIST.filter(a => has(a.key)).length;

  // Achtung Twitch Nachrichtenlänge: wir halten's kurz
  const parts = ACH_LIST.map(a => {
    const unlockedThis = has(a.key);

    if (!unlockedThis && a.hidden) return "???";
    if (!unlockedThis) return `${a.name}`; // oder: `${a.name}(${a.desc})` wenn du mehr Text willst
    return `✅${a.name}`;
  });

  return `@${username} Achievements ${unlocked}/${total}: ${parts.join(" | ")}`;
},

comsused: async (channel, tags, args) => {
  const username = getUsername(tags);

  const raw = (args?.[0] || "").toLowerCase().replace(/^!/, "").trim();

  // ✅ Ohne Argument: Top 3 Commands global
  if (!raw) {
    const topCmds = getTopCommands(3);

    if (topCmds.length === 0) {
      return { text: `@${username} Noch keine Command-Nutzungsdaten vorhanden.`, count: false };
    }

    const text = topCmds
      .map(([cmd, total], i) => `${i + 1}) !${cmd} (${total}x)`)
      .join(" | ");

    return { text: `@${username} Top Commands: ${text}`, count: false };
  }

  // ✅ Mit Argument: Top 3 User für diesen Command
  const top = getTopUsers(raw, 3);
  const mine = getUserCount(raw, username);

  if (top.length === 0) {
    return { text: `@${username} Für !${raw} gibt’s noch keine Nutzungsdaten.`, count: false };
  }

  const podium = top
    .map(([user, cnt], i) => `${i + 1}) @${user} (${cnt}x)`)
    .join(" | ");

  return { text: `@${username} Top !${raw}: ${podium} — Du: ${mine}x`, count: false };
},

mycoms: async (channel, tags) => {
  const username = getUsername(tags);

  const top = getUserTopCommands(username, 3);

  if (top.length === 0) {
    return { text: `@${username} Du hast noch keine Commands benutzt.`, count: false };
  }

  const text = top
    .map(([cmd, cnt], i) => `${i + 1}) !${cmd} (${cnt}x)`)
    .join(" | ");

  return { text: `@${username} Deine Top Commands: ${text}`, count: false };
},

  shop: async (channel, tags) => {
    const username = getUsername(tags);
    return { text: `@${username} 🛒 Dein Shop: ${buildShopUrl(username)}`, count: false };
  },

  gold: async (channel, tags) => {
    const username = getUsername(tags);
    const stats = getUserStats(username);
    return { text: `@${username} 🏆 Gold: ${stats.gold} | Insgesamt verdient: ${stats.totalEarned}`, count: false };
  },

  inventory: async (channel, tags) => {
    const username = getUsername(tags);
    const fishes = fishInventory[username] || [];
    
    if (fishes.length === 0) {
      return { text: `@${username} Dein Inventar ist leer. Geh fischen mit !angeln!`, count: false };
    }
    
    const summary = {};
    fishes.forEach(f => {
      summary[f.name] = (summary[f.name] || 0) + 1;
    });
    
    const text = Object.entries(summary)
      .map(([name, cnt]) => `${cnt}x ${name}`)
      .join(" | ");
    
    return { text: `@${username} Inventar: ${text} (${fishes.length} total)`, count: false };
  },

  sell: async (channel, tags, args) => {
    const username = getUsername(tags);
    const fishes = fishInventory[username] || [];
    
    if (fishes.length === 0) {
      return { text: `@${username} Du hast keine Fische zu verkaufen!`, count: false };
    }
    
    const index = parseInt(args?.[0]) - 1;
    
    if (isNaN(index) || index < 0 || index >= fishes.length) {
      return { text: `@${username} Benutzung: !sell [nummer]. Beispiel: !sell 1`, count: false };
    }
    
    const fish = fishes[index];
    const sellPrice = Math.floor(fish.size * 1.5); // 1.5 Gold pro cm
    
    fishes.splice(index, 1);
    fishInventory[username] = fishes;
    saveFishInventory();
    
    const newGold = addGold(username, sellPrice);
    
    return { text: `@${username} Verkauft: ${fish.size}cm ${fish.name} ${fish.emoji} für ${sellPrice}🏆 (Total: ${newGold}🏆)`, count: true };
  }
};

/* ========================
   MESSAGE HANDLER
======================== */

client.on("message", async (channel, tags, message, self) => {
  // Ignore bot messages
  if (self) return;

  // Only handle commands
  if (!message.startsWith("!")) return;

  const parts = message.slice(1).split(" ");
  const commandName = parts[0].toLowerCase();
  const args = parts.slice(1);

  recordUserIdentity(tags);

  const user = getUsername(tags);
  incUsage(commandName, user);

  const command = commands[commandName];
  if (!command) return;

  try {
    const result = await command(channel, tags, args);

    // Backwards-compatible: string → {text, count:true}
    const payload =
      typeof result === "object" && result !== null
        ? result
        : { text: result, count: !!result };

    if (payload.text) await client.say(channel, payload.text);

    // Zählung erfolgt bereits oben für alle ! Nachrichten
  } catch (err) {
    console.error("Command Fehler:", err);
  }
});

async function main() {
  try {
    await client.connect();
    console.log("✅ Bot verbunden (connect resolved).");
  } catch (e) {
    console.error("❌ connect() failed:", e);
  }
}

main();
