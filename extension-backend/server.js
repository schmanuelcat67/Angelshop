import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import "dotenv/config";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const corsOptions = {
  origin: (origin, callback) => {
    // Erlaube Twitch Extension Origins, lokale Tests und ngrok
    const allowed = [
      /\.ext-twitch\.tv$/,
      /^https:\/\/localhost/,
      /^http:\/\/localhost/,
      /ngrok-free\.dev$/,
      /ngrok\.io$/,
      /onrender\.com$/,
    ];
    if (!origin || allowed.some((r) => r.test(origin))) {
      callback(null, true);
    } else {
      callback(null, true); // Für Extension-Entwicklung alle erlauben
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "ngrok-skip-browser-warning"],
  credentials: false,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // Preflight für alle Routen
app.use(express.json());

// Twitch Extension Client Secret
const CLIENT_SECRET = process.env.TWITCH_EXT_SECRET || "your-secret-here";

// Data directory (shared mit main bot)
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "..");
fs.mkdirSync(DATA_DIR, { recursive: true });
console.log(`📁 Extension data dir: ${DATA_DIR}`);

function resolveUsernameKey(map, requestedUsername) {
  if (!requestedUsername || typeof requestedUsername !== "string") {
    return null;
  }

  if (map[requestedUsername]) {
    return requestedUsername;
  }

  const lower = requestedUsername.toLowerCase();
  return Object.keys(map).find((key) => key.toLowerCase() === lower) || null;
}

function loadUserMap() {
  const userMapFile = path.join(DATA_DIR, "user_map.json");
  if (!fs.existsSync(userMapFile)) {
    return { byId: {}, byName: {} };
  }

  try {
    const data = JSON.parse(fs.readFileSync(userMapFile, "utf8"));
    return {
      byId: data?.byId || {},
      byName: data?.byName || {},
    };
  } catch {
    return { byId: {}, byName: {} };
  }
}

function normalizeRequestedUsername(requestedUsername) {
  if (!requestedUsername || typeof requestedUsername !== "string") {
    return requestedUsername;
  }

  const userMap = loadUserMap();
  if (userMap.byId[requestedUsername]) {
    return userMap.byId[requestedUsername];
  }

  const lowered = requestedUsername.toLowerCase();
  if (userMap.byName[lowered]) {
    return lowered;
  }

  return requestedUsername;
}

// Middleware: Verify Twitch Extension Token
function verifyExtensionToken(req, res, next) {
  const token = req.headers["authorization"]?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, CLIENT_SECRET, { algorithms: ["HS256"] });
    req.user = {
      userId: decoded.user_id || decoded.sub,
      channelId: decoded.channel_id,
      role: decoded.role,
    };
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(403).json({ error: "Invalid token" });
  }
}

// ============ API ENDPOINTS ============

// GET /api/user/stats - Get user stats
app.get("/api/user/stats", (req, res) => {
  try {
    // Optional token handling for extension panel (avoid preflight on ngrok free)
    const token = req.headers["authorization"]?.split(" ")[1];
    if (token && token !== "test") {
      try {
        jwt.verify(token, CLIENT_SECRET, { algorithms: ["HS256"] });
      } catch (err) {
        console.error("Token verification failed:", err.message);
        return res.status(403).json({ error: "Invalid token" });
      }
    } else if (token === "test") {
      console.log("📊 TEST MODE: Using test token");
    } else {
      // Kein Token: erlaubt für public Panel-Stats
      console.log("📊 PANEL MODE: No token provided, serving read-only stats");
    }

    const currencyFile = path.join(DATA_DIR, "currency.json");
    const fishInventoryFile = path.join(DATA_DIR, "fish_inventory.json");

    let currency = {};
    let fishInventory = {};

    if (fs.existsSync(currencyFile)) {
      currency = JSON.parse(fs.readFileSync(currencyFile, "utf8"));
    }

    if (fs.existsSync(fishInventoryFile)) {
      fishInventory = JSON.parse(fs.readFileSync(fishInventoryFile, "utf8"));
    }

    const requestedUsernameRaw = req.query.username || "neko_deko_o7";
    const requestedUsername = normalizeRequestedUsername(requestedUsernameRaw);
    const currencyKey = resolveUsernameKey(currency, requestedUsername);
    const inventoryKey = resolveUsernameKey(fishInventory, requestedUsername);
    const resolvedUsername = currencyKey || inventoryKey || requestedUsername;

    const stats = currency[currencyKey || resolvedUsername] || { gold: 0, totalEarned: 0, upgrades: {}, craftedItems: [] };
    const fishes = fishInventory[inventoryKey || resolvedUsername] || [];

    res.json({
      username: resolvedUsername,
      gold: stats.gold,
      totalEarned: stats.totalEarned,
      fishCount: fishes.length,
      upgrades: stats.upgrades || {},
      craftedItems: stats.craftedItems || [],
    });
  } catch (err) {
    console.error("Error fetching stats:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/user/inventory - Get fish inventory
app.get("/api/user/inventory", (req, res) => {
  try {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (token && token !== "test") {
      try {
        jwt.verify(token, CLIENT_SECRET, { algorithms: ["HS256"] });
      } catch (err) {
        console.error("Token verification failed:", err.message);
        return res.status(403).json({ error: "Invalid token" });
      }
    }

    const fishInventoryFile = path.join(DATA_DIR, "fish_inventory.json");
    let fishInventory = {};

    if (fs.existsSync(fishInventoryFile)) {
      fishInventory = JSON.parse(fs.readFileSync(fishInventoryFile, "utf8"));
    }

    const requestedUsernameRaw = req.query.username || "unknown";
    const requestedUsername = normalizeRequestedUsername(requestedUsernameRaw);
    const resolvedUsername = resolveUsernameKey(fishInventory, requestedUsername) || requestedUsername;
    const fishes = fishInventory[resolvedUsername] || [];

    // Group by fish type
    const grouped = {};
    fishes.forEach((fish, idx) => {
      if (!grouped[fish.name]) {
        grouped[fish.name] = { count: 0, fishes: [] };
      }
      grouped[fish.name].count++;
      grouped[fish.name].fishes.push({ ...fish, id: idx });
    });

    res.json({ inventory: grouped, total: fishes.length });
  } catch (err) {
    console.error("Error fetching inventory:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sell-fish - Sell a fish
app.post("/api/sell-fish", verifyExtensionToken, (req, res) => {
  try {
    const { username, fishIndex } = req.body;
    const currencyFile = path.join(DATA_DIR, "currency.json");
    const fishInventoryFile = path.join(DATA_DIR, "fish_inventory.json");

    let currency = {};
    let fishInventory = {};

    if (fs.existsSync(currencyFile)) {
      currency = JSON.parse(fs.readFileSync(currencyFile, "utf8"));
    }

    if (fs.existsSync(fishInventoryFile)) {
      fishInventory = JSON.parse(fs.readFileSync(fishInventoryFile, "utf8"));
    }

    const normalizedUsername = normalizeRequestedUsername(username);
    const resolvedUsername = resolveUsernameKey(fishInventory, normalizedUsername) || resolveUsernameKey(currency, normalizedUsername) || normalizedUsername;
    const fishes = fishInventory[resolvedUsername] || [];
    if (!fishes[fishIndex]) {
      return res.status(400).json({ error: "Fish not found" });
    }

    const fish = fishes[fishIndex];
    const sellPrice = Math.floor(fish.size * 1.5);

    fishes.splice(fishIndex, 1);
    fishInventory[resolvedUsername] = fishes;

    if (!currency[resolvedUsername]) {
      currency[resolvedUsername] = { gold: 0, totalEarned: 0, upgrades: {}, craftedItems: [] };
    }

    currency[resolvedUsername].gold += sellPrice;

    fs.writeFileSync(currencyFile, JSON.stringify(currency, null, 2));
    fs.writeFileSync(fishInventoryFile, JSON.stringify(fishInventory, null, 2));

    res.json({ success: true, goldEarned: sellPrice, newGold: currency[resolvedUsername].gold });
  } catch (err) {
    console.error("Error selling fish:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/buy-upgrade
app.post("/api/buy-upgrade", verifyExtensionToken, (req, res) => {
  try {
    const { username, upgradeName, upgradeCost } = req.body;
    const currencyFile = path.join(DATA_DIR, "currency.json");

    let currency = {};
    if (fs.existsSync(currencyFile)) {
      currency = JSON.parse(fs.readFileSync(currencyFile, "utf8"));
    }

    const normalizedUsername = normalizeRequestedUsername(username);
    const resolvedUsername = resolveUsernameKey(currency, normalizedUsername) || normalizedUsername;

    if (!currency[resolvedUsername]) {
      currency[resolvedUsername] = { gold: 0, totalEarned: 0, upgrades: {}, craftedItems: [] };
    }

    currency[resolvedUsername].upgrades = currency[resolvedUsername].upgrades || {};
    currency[resolvedUsername].craftedItems = currency[resolvedUsername].craftedItems || [];

    if (currency[resolvedUsername].upgrades[upgradeName]) {
      return res.status(400).json({ error: "Upgrade already owned" });
    }

    if (currency[resolvedUsername].gold < upgradeCost) {
      return res.status(400).json({ error: "Not enough gold" });
    }

    currency[resolvedUsername].gold -= upgradeCost;
    currency[resolvedUsername].upgrades[upgradeName] = true;

    if (!currency[resolvedUsername].craftedItems.includes(upgradeName)) {
      currency[resolvedUsername].craftedItems.push(upgradeName);
    }

    fs.writeFileSync(currencyFile, JSON.stringify(currency, null, 2));

    res.json({
      success: true,
      newGold: currency[resolvedUsername].gold,
      upgrades: currency[resolvedUsername].upgrades,
      craftedItems: currency[resolvedUsername].craftedItems,
    });
  } catch (err) {
    console.error("Error buying upgrade:", err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK" });
});

const PORT = process.env.PORT || process.env.EXT_BACKEND_PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ Extension Backend läuft auf http://localhost:${PORT}`);
});
