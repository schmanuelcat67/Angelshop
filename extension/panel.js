const BACKEND_RENDER = "https://YOUR-RENDER-SERVICE.onrender.com";
const BACKEND_LOCAL = "http://localhost:3001";
const FALLBACK_USERNAME = "neko_deko_o7";

let BACKEND = BACKEND_RENDER;
let authToken = null;
let currentUsername = FALLBACK_USERNAME;
let refreshTimer = null;
const isLocalRig = ["localhost", "127.0.0.1"].includes(window.location.hostname);

console.log("Panel JS geladen, warte auf Twitch SDK...");
document.getElementById("backend").textContent = BACKEND;

testBackend();
waitForTwitch();

setTimeout(() => {
  if (!authToken) {
    console.log("Keine Auth nach 3s, nutze Fallback-Ladung");
    startPolling();
  }
}, 3000);

function setUiUser(nameForDisplay) {
  document.getElementById("username").textContent = nameForDisplay || "?";
}

function setResolvedUsername(username) {
  currentUsername = username || FALLBACK_USERNAME;
  localStorage.setItem("neko_last_username", currentUsername);
}

function isNumericIdentifier(value) {
  return /^\d{6,}$/.test(String(value || "").trim());
}

function resolveViewerName(auth) {
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
  refreshTimer = setInterval(loadData, 5000);
}

async function testBackend() {
  if (!isLocalRig) {
    BACKEND = BACKEND_RENDER;
    document.getElementById("backend").textContent = BACKEND;
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
  } catch (error) {
    console.log("Lokaler Backend nicht erreichbar, nutze Render URL");
    BACKEND = BACKEND_RENDER;
  }

  document.getElementById("backend").textContent = BACKEND;
}

function waitForTwitch() {
  if (!window.Twitch || !window.Twitch.ext) {
    setTimeout(waitForTwitch, 100);
    return;
  }

  console.log("Twitch SDK geladen");

  try {
    window.Twitch.ext.onAuthorized((auth) => {
      authToken = auth.token;
      const resolved = resolveViewerName(auth);

      setResolvedUsername(resolved.lookup);
      setUiUser(resolved.display || resolved.lookup);

      console.log("Viewer erkannt:", resolved);
      startPolling();
    });
  } catch (error) {
    console.error("Fehler bei onAuthorized:", error);
    document.getElementById("signal").textContent = "Auth Error";
  }

  try {
    window.Twitch.ext.onError((error) => {
      console.error("Twitch Error:", error);
      document.getElementById("error").textContent = String(error);
      document.getElementById("error").style.display = "block";
    });
  } catch (error) {
    console.error("Fehler bei onError:", error);
  }
}

async function loadData() {
  try {
    const url = `${BACKEND}/api/user/stats?username=${encodeURIComponent(currentUsername)}&ext=1`;
    document.getElementById("backend").textContent = BACKEND;

    const res = await fetch(url, {
      method: "GET",
      mode: "cors"
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    document.getElementById("gold").textContent = data.gold || 0;
    document.getElementById("signal").textContent = "Online";
    document.getElementById("error").style.display = "none";

    if (data.username && data.username !== currentUsername) {
      setResolvedUsername(data.username);
      setUiUser(data.username);
    }
  } catch (error) {
    console.error("Fehler beim Laden:", error.message);
    document.getElementById("signal").textContent = "Offline";
    document.getElementById("error").textContent = error.message;
    document.getElementById("error").style.display = "block";
  }
}

