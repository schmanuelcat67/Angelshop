// Twitch Extension Client
const BACKEND_URL = "http://localhost:3001";
let authToken = null;
let currentUsername = "unknown";
let isAuthorized = false;

// Initialize Twitch Extension
function initTwitch() {
    if (window.Twitch && window.Twitch.ext) {
        window.Twitch.ext.onAuthorized((auth) => {
            authToken = auth.token;
            isAuthorized = true;
            console.log("✅ Twitch Extension authorized");
            
            // Try to get username from various sources
            const params = new URLSearchParams(window.location.search);
            currentUsername = params.get("user") || params.get("channel") || "unknown";
            
            if (window.Twitch.ext.viewer && window.Twitch.ext.viewer.id) {
                currentUsername = window.Twitch.ext.viewer.id;
            }
            
            document.getElementById("username").textContent = `@${currentUsername}`;
            loadStats();
        });

        window.Twitch.ext.onError((error) => {
            console.error("❌ Twitch Extension error:", error);
            showFallback();
        });

        window.Twitch.ext.onContext((context, contextProperties) => {
            console.log("📺 Context:", context);
        });
    } else {
        console.warn("⚠️ Twitch SDK not loaded, using fallback mode");
        showFallback();
    }
}

function showFallback() {
    // Fallback for local testing
    currentUsername = "test_user";
    document.getElementById("username").textContent = `@${currentUsername} (Test Mode)`;
    console.log("🧪 Running in test mode");
}

// ============ UI FUNCTIONS ============

// Tab switching
document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
        const tabName = tab.dataset.tab;
        
        document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(tc => tc.classList.remove("active"));
        
        tab.classList.add("active");
        document.getElementById(tabName + "-tab").classList.add("active");
        
        if (tabName === "inventory") {
            loadInventory();
        } else if (tabName === "crafting") {
            loadCrafting();
        }
    });
});

// ============ API CALLS ============

async function loadStats() {
    try {
        const headers = {
            "Content-Type": "application/json"
        };
        
        if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
        }
        
        const response = await fetch(
            `${BACKEND_URL}/api/user/stats?username=${currentUsername}`,
            { headers }
        );
        
        if (!response.ok) {
            console.warn(`⚠️ Stats API returned ${response.status}`);
            // Show placeholder data for testing
            document.getElementById("gold-amount").textContent = "?";
            document.getElementById("earned-total").textContent = "Verdient: ?";
            document.getElementById("fish-count").textContent = "?";
            return;
        }
        
        const data = await response.json();
        
        document.getElementById("gold-amount").textContent = data.gold;
        document.getElementById("earned-total").textContent = `Verdient: ${data.totalEarned}`;
        document.getElementById("fish-count").textContent = data.fishCount;
        
    } catch (err) {
        console.error("❌ Error loading stats:", err);
        document.getElementById("gold-amount").textContent = "Fehler";
        document.getElementById("earned-total").textContent = "Backend nicht erreichbar";
    }
}

async function loadInventory() {
    try {
        const headers = {};
        if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
        }
        
        const response = await fetch(
            `${BACKEND_URL}/api/user/inventory?username=${currentUsername}`,
            { headers }
        );
        
        if (!response.ok) throw new Error(`API returned ${response.status}`);
        
        const data = await response.json();
        const fishList = document.getElementById("fish-list");
        
        if (data.total === 0) {
            fishList.innerHTML = '<p class="loading">Dein Inventar ist leer. Geh fischen!</p>';
            return;
        }
        
        let html = "";
        Object.entries(data.inventory).forEach(([fishName, group]) => {
            group.fishes.forEach((fish, idx) => {
                const sellPrice = Math.floor(fish.size * 1.5);
                html += `
                    <div class="fish-item">
                        <div class="fish-info">
                            <h4>${fish.emoji} ${fish.size}cm ${fishName}</h4>
                            <small>${new Date(fish.timestamp).toLocaleDateString("de-DE")}</small>
                        </div>
                        <div style="text-align: right;">
                            <div class="fish-price">+${sellPrice}🏆</div>
                            <button class="btn btn-small" onclick="sellFish(${idx})">Verkaufen</button>
                        </div>
                    </div>
                `;
            });
        });
        
        fishList.innerHTML = html;
        
    } catch (err) {
        console.error("❌ Error loading inventory:", err);
        document.getElementById("fish-list").innerHTML = '<p class="loading">❌ Fehler beim Laden</p>';
    }
}

async function sellFish(index) {
    try {
        const headers = {
            "Content-Type": "application/json"
        };
        if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
        }
        
        const response = await fetch(`${BACKEND_URL}/api/sell-fish`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                username: currentUsername,
                fishIndex: index
            })
        });
        
        if (!response.ok) throw new Error("Failed to sell fish");
        
        const data = await response.json();
        
        alert(`✅ Fisch verkauft! +${data.goldEarned}🏆\n\nNeuer Gold Total: ${data.newGold}🏆`);
        
        loadStats();
        loadInventory();
        
    } catch (err) {
        console.error("❌ Error selling fish:", err);
        alert("❌ Fehler beim Verkaufen");
    }
}

async function buyUpgrade(upgradeName, cost) {
    if (!confirm(`Kaufen für ${cost}🏆?`)) return;
    
    try {
        const headers = {
            "Content-Type": "application/json"
        };
        if (authToken) {
            headers["Authorization"] = `Bearer ${authToken}`;
        }
        
        const response = await fetch(`${BACKEND_URL}/api/buy-upgrade`, {
            method: "POST",
            headers,
            body: JSON.stringify({
                username: currentUsername,
                upgradeName,
                upgradeCost: cost
            })
        });
        
        if (!response.ok) throw new Error("Failed to buy upgrade");
        
        const data = await response.json();
        
        alert(`✅ Upgrade gekauft!\n\nNeues Gold: ${data.newGold}🏆`);
        
        loadStats();
        
    } catch (err) {
        console.error("❌ Error buying upgrade:", err);
        alert("❌ Fehler beim Kauf");
    }
}

function loadCrafting() {
    console.log("Loading crafting...");
}

// Initial load - wait for Twitch SDK or fallback
document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Neko Bot Extension loading");
    
    // Try to init Twitch
    initTwitch();
    
    // Fallback if Twitch SDK doesn't load in time
    setTimeout(() => {
        if (!isAuthorized && currentUsername === "unknown") {
            showFallback();
            loadStats();
        }
    }, 2000);
});
