//------------------------------------------------------------
//  app.js v7.6（UI変更なし / 完全安定）
//------------------------------------------------------------

// 端末IDの永続生成
function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = "dev-" + Math.random().toString(36).substring(2, 12);
        localStorage.setItem("deviceId", id);
    }
    return id;
}
const deviceId = getDeviceId();

// API 基本URL
const API = "";

// DOM
const spinBtn = document.getElementById("spin-btn");
const spin10Btn = document.getElementById("spin10-btn");
const addSpinBtn = document.getElementById("add-spin-btn");
const serialInput = document.getElementById("serial-input");
const spinsDisplay = document.getElementById("spins-display");

// 管理ログイン
const adminLoginBtn = document.getElementById("admin-login-btn");
const adminPasswordInput = document.getElementById("admin-password");

// 景品登録
const prizeFileInput = document.getElementById("prize-file");
const prizeRaritySelect = document.getElementById("prize-rarity");
const prizeUploadBtn = document.getElementById("prize-upload-btn");

// マイコレ
const myCollectionContainer = document.getElementById("my-collection");


//------------------------------------------------------------
// 残り回数読み込み
//------------------------------------------------------------
async function loadDevice() {
    const res = await fetch(`${API}/api/device?deviceId=${deviceId}`);
    const json = await res.json();
    spinsDisplay.textContent = json.spins ?? 0;
}

loadDevice();


//------------------------------------------------------------
// ▼ シリアル使用 → 回数追加
//------------------------------------------------------------
addSpinBtn.addEventListener("click", async () => {
    const code = serialInput.value.trim();
    if (!code) {
        alert("シリアル番号を入力してください");
        return;
    }

    const res = await fetch(`${API}/api/redeem-serial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceId })
    });

    const json = await res.json();

    if (!json.ok) {
        alert(json.error || "使用できません");
        return;
    }

    spinsDisplay.textContent = json.spins;
    serialInput.value = "";
    alert("回数が追加されました！");
});


//------------------------------------------------------------
// ▼ 単発ガチャ
//------------------------------------------------------------
spinBtn.addEventListener("click", async () => {
    const res = await fetch(`${API}/api/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
    });

    const json = await res.json();

    if (!json.ok) {
        alert(json.error || "エラー");
        return;
    }

    spinsDisplay.textContent = json.spins;
    playGachaAnimation(json);
});


//------------------------------------------------------------
// ▼ 10連ガチャ
//------------------------------------------------------------
spin10Btn.addEventListener("click", async () => {
    const current = Number(spinsDisplay.textContent);

    // 何回もエラー出ないように
    if (current < 10) {
        alert("回数が足りません");
        return;
    }

    const res = await fetch(`${API}/api/spin10`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
    });

    const json = await res.json();

    if (!json.ok) {
        alert(json.error || "エラー");
        return;
    }

    spinsDisplay.textContent = json.spins;

    // 10連の演出処理（ここは後で拡張）
    alert("10連完了！");
});


//------------------------------------------------------------
// ▼ ガチャ演出 ＋ 当たり動画再生
//------------------------------------------------------------
function playGachaAnimation(result) {
    const effectVideo = document.getElementById("effect-video");
    const prizeVideo = document.getElementById("prize-video");

    // 演出を再生
    effectVideo.src = result.effect;
    effectVideo.style.display = "block";
    prizeVideo.style.display = "none";

    effectVideo.play();

    // 演出終了後に景品動画へ
    effectVideo.onended = () => {
        effectVideo.style.display = "none";
        prizeVideo.src = result.prize.video_path;
        prizeVideo.style.display = "block";
        prizeVideo.play();
    };
}


//------------------------------------------------------------
// ▼ 管理ログイン
//------------------------------------------------------------
adminLoginBtn.addEventListener("click", async () => {
    const password = adminPasswordInput.value;
    if (!password) return;

    const res = await fetch(`${API}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
    });

    const json = await res.json();

    if (!json.ok) {
        alert("パスワードが違います");
        return;
    }

    document.getElementById("admin-panel").style.display = "block";
});


//------------------------------------------------------------
// ▼ 景品アップロード
//------------------------------------------------------------
prizeUploadBtn.addEventListener("click", async () => {
    const file = prizeFileInput.files[0];
    const rarity = prizeRaritySelect.value;

    if (!file || !rarity) {
        alert("ファイルまたはレア度が不足しています");
        return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("rarity", rarity);

    const res = await fetch(`${API}/api/admin/prizes`, {
        method: "POST",
        body: fd
    });

    const json = await res.json();

    if (!json.ok) {
        alert(json.error);
        return;
    }

    prizeFileInput.value = "";
    alert("景品を登録しました！");
    loadPrizes();
});



//------------------------------------------------------------
// ▼ 景品一覧
//------------------------------------------------------------
async function loadPrizes() {
    const res = await fetch(`${API}/api/admin/prizes`);
    const list = await res.json();

    const area = document.getElementById("prize-list");
    area.innerHTML = "";

    list.forEach(p => {
        const div = document.createElement("div");
        div.className = "prize-item";
        div.innerHTML = `
            <p>[${p.rarity}]</p>
            <video src="${p.video_path}" width="120"></video>
        `;
        area.appendChild(div);
    });
}


//------------------------------------------------------------
// ▼ マイコレ読み込み
//------------------------------------------------------------
async function loadMyCollection() {
    const res = await fetch(`${API}/api/my-collection?deviceId=${deviceId}`);
    const list = await res.json();

    myCollectionContainer.innerHTML = "";

    list.forEach(item => {
        const d = document.createElement("div");
        d.className = "collection-item";
        d.innerHTML = `
            <video src="${item.video_path}" width="140"></video>
        `;
        myCollectionContainer.appendChild(d);
    });
}
