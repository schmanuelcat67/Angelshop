const DEFAULT_REMOTE_BACKEND = "https://nekobot-extension-backend-production.up.railway.app";
const BACKEND_RENDER = window.location?.origin && window.location.origin !== "null"
  ? window.location.origin
  : DEFAULT_REMOTE_BACKEND;
const BACKEND_LOCAL = "http://localhost:3001";
const FALLBACK_USERNAME = "neko_deko_o7";

const SHOP_ITEMS = [
  { key: "tackle_box", name: "🧰 Tackle Box", cost: 120, desc: "Mehr Platz und Style für dein Angel-Inventar." },
  { key: "premium_bait", name: "🪱 Premium Köder", cost: 250, desc: "Upgrade für deinen Angelshop." },
  { key: "lucky_charm", name: "🍀 Lucky Charm", cost: 400, desc: "Seltenes Glücks-Item fürs Inventar." },
  { key: "golden_rod", name: "🎣 Goldene Rute", cost: 650, desc: "Legendäres Showcase-Item für Sammler." },
];

let BACKEND = BACKEND_RENDER;
let authToken = null;
let currentUsername = FALLBACK_USERNAME;
let refreshTimer = null;
let lastStats = { gold: 0, fishCount: 0, upgrades: {}, craftedItems: [] };

const isLocalRig = ["localhost", "127.0.0.1"].includes(window.location.hostname);

console.log("Shop geladen, initialisiere Website...");
initPanel();
testBackend().finally(() => {
  waitForTwitch();
});

function initPanel() {
  renderShop();
  setUiUser(FALLBACK_USERNAME);
  setStatus("⏳ Laden...", false);

  const input = document.getElementById("userInput");
  if (input) {
    input.value = FALLBACK_USERNAME;
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        applyUserFromInput();
      }
    });
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function labelForUpgrade(key) {
  const item = SHOP_ITEMS.find((entry) => entry.key === key);
  return item ? item.name : key;
}

function setUiUser(nameForDisplay) {
  document.getElementById("username").textContent = nameForDisplay || "?";
}

function syncUserInput(value) {
  const input = document.getElementById("userInput");
  if (input) {
    input.value = value || "";
  }
}

function setResolvedUsername(username) {
  currentUsername = username || FALLBACK_USERNAME;
  syncUserInput(currentUsername);
  try {
    localStorage.setItem("neko_last_username", currentUsername);
  } catch {
    // ignore storage errors in embedded browsers
  }
}

function applyUserFromInput() {
  const input = document.getElementById("userInput");
  const value = String(input?.value || "").trim().replace(/^@/, "");
  if (!value) {
    return;
  }

  setResolvedUsername(value.toLowerCase());
  setUiUser(value);
  loadData();
}

async function copyShopLink() {
  const url = `${window.location.origin}/shop?user=${encodeURIComponent(currentUsername)}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatus("🔗 Link kopiert", true);
  } catch {
    showError("Link konnte nicht kopiert werden.");
  }
}

function setStatus(text, isOnline) {
  const signal = document.getElementById("signal");
  signal.textContent = text;
  signal.className = isOnline ? "pill online" : "pill";
}

function showError(message = "") {
  const errorEl = document.getElementById("error");
  if (message) {
    errorEl.textContent = message;
    errorEl.style.display = "block";
  } else {
    errorEl.textContent = "";
    errorEl.style.display = "none";
  }
}

function isNumericIdentifier(value) {
  return /^\d{6,}$/.test(String(value || "").trim());
}

function resolveViewerName() {
  const viewer = window.Twitch?.ext?.viewer || {};
  const params = new URLSearchParams(window.location.search);

  const explicitLoginRaw = params.get("user") || params.get("username") || params.get("login") || params.get("channel");
  const explicitLogin = explicitLoginRaw && !isNumericIdentifier(explicitLoginRaw) ? explicitLoginRaw : null;
  const displayName = viewer.displayName;
  const viewerLogin = viewer.login;
  const cached = localStorage.getItem("neko_last_username");

  if (displayName && displayName.trim() && !isNumericIdentifier(displayName)) {
    return { display: displayName, lookup: displayName.toLowerCase() };
  }

  if (viewerLogin && viewerLogin.trim() && !isNumericIdentifier(viewerLogin)) {
    return { display: viewerLogin, lookup: viewerLogin.toLowerCase() };
  }

  if (explicitLogin && explicitLogin.trim()) {
    return { display: explicitLogin, lookup: explicitLogin.toLowerCase() };
  }

  if (cached && cached.trim() && !isNumericIdentifier(cached)) {
    return { display: cached, lookup: cached.toLowerCase() };
  }

  return { display: FALLBACK_USERNAME, lookup: FALLBACK_USERNAME };
}

function startPolling() {
  if (refreshTimer) {
    return;
  }

  loadData();
  refreshTimer = setInterval(loadData, 15000);
}

async function testBackend() {
  if (!isLocalRig) {
    BACKEND = BACKEND_RENDER;
    return;
  }

  try {
    const res = await fetch(`${BACKEND_LOCAL}/health`, {
      method: "GET",
      mode: "cors"
    });

    if (res.ok) {
      BACKEND = BACKEND_LOCAL;
      console.log("Nutze lokalen Backend");
    }
  } catch {
    BACKEND = BACKEND_RENDER;
  }
}

function waitForTwitch() {
  const resolved = resolveViewerName();
  setResolvedUsername(resolved.lookup);
  setUiUser(resolved.display || resolved.lookup);

  if (!window.Twitch || !window.Twitch.ext) {
    console.log("Web-Shop Modus aktiv");
    startPolling();
    return;
  }

  console.log("Twitch SDK geladen");

  try {
    window.Twitch.ext.onAuthorized((auth) => {
      authToken = auth.token || null;
      const twitchResolved = resolveViewerName();

      setResolvedUsername(twitchResolved.lookup);
      setUiUser(twitchResolved.display || twitchResolved.lookup);

      console.log("Viewer erkannt:", twitchResolved);
      startPolling();
    });
  } catch (error) {
    console.error("Fehler bei onAuthorized:", error);
    startPolling();
  }

  try {
    window.Twitch.ext.onError((error) => {
      console.error("Twitch Error:", error);
      showError(String(error));
    });
  } catch (error) {
    console.error("Fehler bei onError:", error);
  }
}

async function loadData() {
  const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};

  try {
    const statsUrl = `${BACKEND}/api/user/stats?username=${encodeURIComponent(currentUsername)}&ext=1`;
    const inventoryUrl = `${BACKEND}/api/user/inventory?username=${encodeURIComponent(currentUsername)}&ext=1`;

    const [statsRes, inventoryRes] = await Promise.all([
      fetch(statsUrl, { method: "GET", mode: "cors", headers }),
      fetch(inventoryUrl, { method: "GET", mode: "cors", headers }).catch(() => null),
    ]);

    if (!statsRes.ok) {
      throw new Error(`HTTP ${statsRes.status}: ${statsRes.statusText}`);
    }

    const stats = await statsRes.json();
    lastStats = {
      gold: stats.gold || 0,
      fishCount: stats.fishCount || 0,
      upgrades: stats.upgrades || {},
      craftedItems: stats.craftedItems || [],
    };

    renderStats(stats);

    if (inventoryRes && inventoryRes.ok) {
      const inventory = await inventoryRes.json();
      renderInventory(inventory);
    } else {
      renderInventory(null, stats.fishCount || 0);
    }

    setStatus("✅ Online", true);
    showError("");
  } catch (error) {
    console.error("Fehler beim Laden:", error.message);
    setStatus("❌ Offline", false);
    showError(error.message);
  }
}

function renderStats(stats) {
  document.getElementById("gold").textContent = stats.gold || 0;
  document.getElementById("fishCount").textContent = stats.fishCount || 0;

  if (stats.username && stats.username !== currentUsername) {
    setResolvedUsername(stats.username);
    setUiUser(stats.username);
  }

  const ownedKeys = [...new Set([
    ...Object.keys(stats.upgrades || {}).filter((key) => stats.upgrades[key]),
    ...((Array.isArray(stats.craftedItems) ? stats.craftedItems : []).filter(Boolean)),
  ])];

  const ownedItemsEl = document.getElementById("ownedItems");
  if (!ownedKeys.length) {
    ownedItemsEl.innerHTML = '<span class="muted">Noch keine Items gekauft</span>';
  } else {
    ownedItemsEl.innerHTML = ownedKeys
      .map((key) => `<span class="chip">${escapeHtml(labelForUpgrade(key))}</span>`)
      .join("");
  }

  updateShopButtons(stats);
}

function renderInventory(payload, fallbackCount = 0) {
  const inventoryEl = document.getElementById("inventory");

  if (!payload || !payload.inventory) {
    if (fallbackCount > 0) {
      inventoryEl.innerHTML = `
        <div class="item">
          <div class="item-title">🎣 ${fallbackCount} Fische gespeichert</div>
          <div class="muted">Die Detailansicht wird geladen, sobald das Inventar bereit ist.</div>
        </div>`;
      return;
    }

    inventoryEl.innerHTML = '<div class="item"><div class="muted">Noch keine Fische im Inventar.</div></div>';
    return;
  }

  const fishes = Object.values(payload.inventory).flatMap((group) => group.fishes || []);

  if (!fishes.length) {
    inventoryEl.innerHTML = '<div class="item"><div class="muted">Noch keine Fische im Inventar.</div></div>';
    return;
  }

  fishes.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  const visible = fishes.slice(0, 5);

  let html = visible.map((fish) => {
    const size = Number(fish.size || 0);
    const sellPrice = Math.floor(size * 1.5);
    const dateLabel = fish.timestamp ? new Date(fish.timestamp).toLocaleDateString("de-DE") : "Gerade gefangen";

    return `
      <div class="item">
        <div class="item-row">
          <div>
            <div class="item-title">${escapeHtml(fish.emoji || "🐟")} ${escapeHtml(fish.name || "Fisch")}</div>
            <div class="muted">${escapeHtml(size)} cm • ${escapeHtml(dateLabel)}</div>
          </div>
          <div class="price">${sellPrice}🏆</div>
        </div>
      </div>`;
  }).join("");

  if (fishes.length > visible.length) {
    html += `<div class="item"><div class="muted">+${fishes.length - visible.length} weitere Fische</div></div>`;
  }

  inventoryEl.innerHTML = html;
}

function renderShop() {
  const shopEl = document.getElementById("shop");
  shopEl.innerHTML = SHOP_ITEMS.map((item) => `
    <div class="item">
      <div class="item-row">
        <div>
          <div class="item-title">${escapeHtml(item.name)}</div>
          <div class="muted">${escapeHtml(item.desc)}</div>
        </div>
        <div>
          <div class="price">${item.cost}🏆</div>
          <button class="buy-btn" id="buy-${item.key}" onclick="buyUpgrade('${item.key}')">Kaufen</button>
        </div>
      </div>
    </div>`).join("");

  updateShopButtons(lastStats);
}

function updateShopButtons(stats = lastStats) {
  const owned = Object.keys(stats?.upgrades || {}).filter((key) => stats.upgrades[key]);
  const crafted = Array.isArray(stats?.craftedItems) ? stats.craftedItems : [];

  for (const item of SHOP_ITEMS) {
    const button = document.getElementById(`buy-${item.key}`);
    if (!button) {
      continue;
    }

    const alreadyOwned = owned.includes(item.key) || crafted.includes(item.key);
    const notEnough = Number(stats?.gold || 0) < item.cost;

    button.disabled = alreadyOwned || notEnough;
    button.textContent = alreadyOwned ? "Gekauft" : notEnough ? "Zu teuer" : "Kaufen";
  }
}

async function buyUpgrade(itemKey) {
  const item = SHOP_ITEMS.find((entry) => entry.key === itemKey);
  if (!item) {
    return;
  }

  try {
    const headers = {
      "Content-Type": "application/json",
    };

    if (authToken) {
      headers["Authorization"] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${BACKEND}/api/buy-upgrade`, {
      method: "POST",
      mode: "cors",
      headers,
      body: JSON.stringify({
        username: currentUsername,
        upgradeName: item.key,
        upgradeCost: item.cost,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    setStatus(`✅ ${item.name} gekauft`, true);
    showError("");
    await loadData();
  } catch (error) {
    console.error("Kauf fehlgeschlagen:", error.message);
    showError(error.message);
  }
}

window.buyUpgrade = buyUpgrade;
window.applyUserFromInput = applyUserFromInput;
window.copyShopLink = copyShopLink;

