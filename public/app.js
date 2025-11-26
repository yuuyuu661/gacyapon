/* ===========================================================
    初回ユーザー名モーダル
=========================================================== */
window.addEventListener("load", () => {
    const saved = localStorage.getItem("gacha_user");
    if (!saved) {
        document.getElementById("usernameModal").classList.remove("hidden");
    }
});
document.getElementById("usernameSaveBtn").onclick = () => {
    const name = document.getElementById("usernameInput").value.trim();
    if (!name) return;
    localStorage.setItem("gacha_user", name);
    document.getElementById("usernameModal").classList.add("hidden");
};

/* ===========================================================
    タブ切り替え
=========================================================== */
function openTab(tabId) {
    document.querySelectorAll(".tab").forEach(t => t.classList.add("hidden"));
    document.getElementById(tabId).classList.remove("hidden");
}

/* ===========================================================
    状態
=========================================================== */
let remaining = 0;
let collection = JSON.parse(localStorage.getItem("gacha_collection") || "{}");
let prizes = JSON.parse(localStorage.getItem("gacha_prizes") || "[]");
let rates = JSON.parse(localStorage.getItem("gacha_rates") || `{
    "superrare":2,"rare":20,"common":50,"normal":28
}`);
let serialHistory = JSON.parse(localStorage.getItem("serial_log") || "[]");

/* ===========================================================
    共通保存
=========================================================== */
function saveAll() {
    localStorage.setItem("gacha_collection", JSON.stringify(collection));
    localStorage.setItem("gacha_prizes", JSON.stringify(prizes));
    localStorage.setItem("gacha_rates", JSON.stringify(rates));
    localStorage.setItem("serial_log", JSON.stringify(serialHistory));
}

/* ===========================================================
    残り回数表示
=========================================================== */
function updateRemaining() {
    const box = document.getElementById("remainingCount");
    box.textContent = `残り回数: ${remaining}`;
}

/* ===========================================================
    レア度抽選
=========================================================== */
function drawRarity() {
    const total = rates.superrare + rates.rare + rates.common + rates.normal;
    const r = Math.random() * total;

    if (r < rates.superrare) return "superrare";
    if (r < rates.superrare + rates.rare) return "rare";
    if (r < rates.superrare + rates.rare + rates.common) return "common";
    return "normal";
}

/* ===========================================================
    景品1個抽選
=========================================================== */
function drawPrize() {
    const rarity = drawRarity();
    const pool = prizes.filter(p => p.rarity === rarity);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

/* ===========================================================
    ガチャ演出 → 景品動画
=========================================================== */
const gachaVideo = document.getElementById("gachaVideo");
const gachaThumb = document.getElementById("gachaThumb");
const gachaponImage = document.getElementById("gachaponImage");

async function playGachaOnce() {
    if (remaining <= 0) {
        alert("回数がありません！");
        return null;
    }
    remaining--;
    updateRemaining();

    const prize = drawPrize();
    if (!prize) {
        alert("動画が登録されていません");
        return null;
    }

    /* ▼ 1. 演出動画再生 */
    const effectPath = `effects/video/${prize.rarity}.mp4`;
    gachaVideo.src = effectPath;
    gachaVideo.classList.remove("hidden");
    gachaVideo.style.display = "block";
    gachaThumb.style.display = "none";

    // 効果音は1秒遅れ
    setTimeout(() => {
        const se = new Audio(`effects/audio/${prize.rarity}.mp3`);
        se.play();
    }, 1000);

    await gachaVideo.play();

    /* ▼ 2. 景品動画へ切替 */
    gachaVideo.pause();
    gachaVideo.src = prize.url;
    await gachaVideo.play();

    /* ▼ 3. マイコレ登録 */
    if (!collection[prize.id]) {
        collection[prize.id] = prize;
        saveAll();
        renderCollection();
    }

    return prize;
}

/* ===========================================================
    10連
=========================================================== */
async function play10() {
    if (remaining < 10) {
        alert("回数が足りません！");
        return;
    }
    for (let i = 0; i < 10; i++) {
        const result = await playGachaOnce();
        if (!result) break;
        await new Promise(res => setTimeout(res, 300));
    }
}

/* ===========================================================
    クリックイベント
=========================================================== */
document.getElementById("spinButton").onclick = playGachaOnce;
document.getElementById("spin10Button").onclick = play10;

/* ===========================================================
    回数追加（シリアル）
=========================================================== */
document.getElementById("useSerialBtn").onclick = () => {
    const text = serialInput.value.trim();
    if (!text) return;

    // 新規生成の自由ワードなら何度でもOK
    remaining++;
    updateRemaining();

    // ログ保存（5件まで）
    serialHistory.unshift({
        code: text,
        time: new Date().toLocaleString()
    });
    serialHistory = serialHistory.slice(0, 5);
    saveAll();
    renderSerialLog();
};

/* ===========================================================
    シリアルログ
=========================================================== */
function renderSerialLog() {
    const box = document.getElementById("serialLog");
    box.innerHTML = "";
    serialHistory.forEach(s => {
        const div = document.createElement("div");
        div.textContent = `${s.code} / ${s.time}`;
        box.appendChild(div);
    });
}
renderSerialLog();

/* ===========================================================
    管理ログイン
=========================================================== */
const ADMIN_PASS = "oasis";

document.getElementById("adminLoginBtn").onclick = () => {
    const p = adminPass.value;
    if (p === ADMIN_PASS) {
        adminPanel.classList.remove("hidden");
        adminLoginBox.classList.add("hidden");
    } else {
        alert("パスワードが違います");
    }
};

/* ===========================================================
    景品登録
=========================================================== */
document.getElementById("addPrizeBtn").onclick = () => {
    const url = prizeUrl.value.trim();
    const rarity = prizeRarity.value;

    if (!url) {
        alert("URLを入力してください");
        return;
    }

    const id = "p" + Date.now();
    prizes.push({ id, rarity, url });

    saveAll();
    renderPrizeList();
    renderCollection();
};

/* ===========================================================
    景品一覧表示
=========================================================== */
function renderPrizeList() {
    const box = document.getElementById("prizeList");
    box.innerHTML = "";

    prizes.forEach(p => {
        const div = document.createElement("div");
        div.classList.add("prize-item");

        const thumb = document.createElement("video");
        thumb.src = p.url;
        thumb.width = 120;

        div.appendChild(thumb);
        div.append(` (${p.rarity})`);

        box.appendChild(div);
    });
}
renderPrizeList();

/* ===========================================================
    確率保存
=========================================================== */
document.getElementById("saveRateBtn").onclick = () => {
    rates.superrare = Number(rate-superrare.value);
    rates.rare = Number(rate-rare.value);
    rates.common = Number(rate-common.value);
    rates.normal = Number(rate-normal.value);
    saveAll();
};

/* ===========================================================
    マイコレ表示
=========================================================== */
function renderCollection() {
    ["superrare","rare","common","normal"].forEach(r => {
        const box = document.getElementById("col-" + r);
        box.innerHTML = "";
        Object.values(collection)
            .filter(c => c.rarity === r)
            .forEach(c => {
                const img = document.createElement("img");
                img.src = c.url + "#t=0.1";
                img.onclick = () => {
                    gachaVideo.src = c.url;
                    gachaVideo.style.display = "block";
                    gachaVideo.play();
                };
                box.appendChild(img);
            });
    });
}
renderCollection();

/* ===========================================================
    初回ロード
=========================================================== */
updateRemaining();
