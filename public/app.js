// =======================
// 初期設定
// =======================

// 現在アクティブなタブ
let currentTab = "gacha";

// ボタン取得
const gachaTab = document.getElementById("tab-gacha");
const collectionTab = document.getElementById("tab-collection");
const adminTab = document.getElementById("tab-admin");

// 画面
const gachaSection = document.getElementById("section-gacha");
const collectionSection = document.getElementById("section-collection");
const adminSection = document.getElementById("section-admin");

// ガチャ画面Elements
const spinsDisplay = document.getElementById("spinsDisplay");
const serialInput = document.getElementById("serialInput");
const serialAddBtn = document.getElementById("serialAddBtn");
const spinButton = document.getElementById("spinButton");
const spin10Button = document.getElementById("spin10Button");
const resultVideo = document.getElementById("resultVideo");
const resultText = document.getElementById("resultText");

// 管理画面Elements
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminPassInput = document.getElementById("adminPass");
const adminMenu = document.getElementById("adminMenu");

// =======================
// ユーザー名の生成（匿名）
// =======================
let savedUser = localStorage.getItem("gacha_user");

if (!savedUser) {
    const r = Math.floor(Math.random() * 999999);
    savedUser = "user_" + r;
    localStorage.setItem("gacha_user", savedUser);
}

function getUser() {
    return savedUser;
}

// =======================
// タブ切り替え
// =======================
function showTab(tab) {
    currentTab = tab;

    gachaSection.style.display = tab === "gacha" ? "block" : "none";
    collectionSection.style.display = tab === "collection" ? "block" : "none";
    adminSection.style.display = tab === "admin" ? "block" : "none";

    gachaTab.classList.toggle("active", tab === "gacha");
    collectionTab.classList.toggle("active", tab === "collection");
    adminTab.classList.toggle("active", tab === "admin");

    if (tab === "gacha") loadSpins();
    if (tab === "collection") loadCollection();
}

// 初期表示
showTab("gacha");

// =======================
// API: 回数の読み込み
// =======================
async function loadSpins() {
    try {
        const user = getUser();
        const res = await fetch(`/api/spins?user=${user}`);
        const json = await res.json();

        spinsDisplay.textContent = json.spins;
    } catch (err) {
        console.error("loadSpins error:", err);
    }
}

// =======================
// API: シリアル入力 → 回数追加
// =======================
async function redeemSerial() {
    const code = serialInput.value.trim();
    if (!code) return;

    try {
        const user = getUser();
        const res = await fetch(`/api/spins`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user, serial: code })
        });

        const json = await res.json();

        if (!json.ok) {
            alert(json.message || "追加できません");
            return;
        }

        serialInput.value = "";
        loadSpins();

    } catch (err) {
        console.error("redeemSerial error:", err);
    }
}

serialAddBtn.addEventListener("click", redeemSerial);

// =======================
// API: ガチャを1回回す
// =======================
async function spinOnce() {
    try {
        const user = getUser();

        const res = await fetch(`/api/spin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user })
        });

        const json = await res.json();
        if (!json.ok) {
            alert(json.message || "ガチャが回せません");
            return;
        }

        // 動画再生
        if (json.video) {
            resultVideo.src = json.video;
            resultVideo.style.display = "block";
            resultVideo.play();
        }

        resultText.textContent = json.name || "";
        loadSpins();

    } catch (err) {
        console.error("spinOnce error:", err);
    }
}

spinButton.addEventListener("click", spinOnce);

// =======================
// API: ガチャ10連
// =======================
async function spinTen() {
    const remain = Number(spinsDisplay.textContent);
    if (remain < 10) {
        alert("回数が足りません (10回必要です)");
        return;
    }

    for (let i = 0; i < 10; i++) {
        await spinOnce();
        await new Promise(r => setTimeout(r, 300));
    }
}
spin10Button.addEventListener("click", spinTen);

// =======================
// API: マイコレ(景品一覧)
// =======================
async function loadCollection() {
    try {
        const user = getUser();
        const res = await fetch(`/api/collection?user=${user}`);
        const json = await res.json();

        const list = document.getElementById("collectionList");
        list.innerHTML = "";

        json.items.forEach(it => {
            const div = document.createElement("div");
            div.className = "collection-item";
            div.textContent = `${it.name} × ${it.count}`;
            list.appendChild(div);
        });

    } catch (err) {
        console.error("loadCollection error:", err);
    }
}

// =======================
// 管理ログイン
// =======================
adminLoginBtn.addEventListener("click", async () => {
    const pass = adminPassInput.value.trim();
    if (!pass) return;

    try {
        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pass })
        });

        const json = await res.json();
        if (!json.ok) {
            alert("パスワードが違います");
            return;
        }

        adminMenu.style.display = "block";

    } catch (err) {
        console.error("adminLogin error:", err);
    }
});
