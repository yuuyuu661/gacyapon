//------------------------------------------------------------
//  app.js v7.6（UI変更なし / index.html 完全準拠版）
//------------------------------------------------------------

// 端末ID 永続保存
function getDeviceId() {
    let id = localStorage.getItem("deviceId");
    if (!id) {
        id = "dev-" + Math.random().toString(36).substring(2, 12);
        localStorage.setItem("deviceId", id);
    }
    return id;
}
const deviceId = getDeviceId();

// API
const API = "";

//------------------------------------------------------------
// DOM取得（index.html に完全一致）
//------------------------------------------------------------

// ガチャ
const spinButton     = document.getElementById("spinButton");
const spin10Button   = document.getElementById("spin10Button");
const spinsDisplay   = document.getElementById("spinsDisplay");

// シリアル → 回数追加
const serialInput    = document.getElementById("serialInput");
const addSerialBtn   = document.querySelector(".serial-box button"); // ← UIは変えない

// 管理ログイン
const adminLoginBtn  = document.getElementById("adminLoginBtn");
const adminPass      = document.getElementById("adminPass");

// 景品登録
const prizeFile      = document.getElementById("prizeFile");
const prizeRarity    = document.getElementById("prizeRarity");
const addPrizeBtn    = document.getElementById("addPrizeBtn");
const prizeList      = document.getElementById("prizeList");

// シリアル発行
const serialWord     = document.getElementById("serialWord");
const serialSpins    = document.getElementById("serialSpins");
const issueSerialBtn = document.getElementById("issueSerialBtn");
const serialLog      = document.getElementById("serialLog");

// マイコレ
const rowSuper   = document.getElementById("row-superrare");
const rowRare    = document.getElementById("row-rare");
const rowCommon  = document.getElementById("row-common");
const rowNormal  = document.getElementById("row-normal");


//------------------------------------------------------------
// ▼ デバイスの残り回数を読む
//------------------------------------------------------------
async function loadDevice() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    spinsDisplay.textContent = data.spins;
}
loadDevice();


//------------------------------------------------------------
// ▼ シリアル → 回数追加
//------------------------------------------------------------
addSerialBtn.addEventListener("click", async () => {
    const code = serialInput.value.trim();
    if (!code) return alert("シリアルコードを入力してください");

    const res = await fetch(`/api/redeem-serial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceId })
    });

    const data = await res.json();

    if (!data.ok) {
        alert(data.error || "使用できません");
        return;
    }

    spinsDisplay.textContent = data.spins;
    serialInput.value = "";
    alert("回数が追加されました！");
});


//------------------------------------------------------------
// ▼ 単発ガチャ
//------------------------------------------------------------
spinButton.addEventListener("click", async () => {
    const res = await fetch(`/api/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
    });

    const json = await res.json();

    if (!json.ok) {
        alert(json.error || "エラーが発生");
        return;
    }

    spinsDisplay.textContent = json.spins;

    // ガチャ演出
    playGachaAnimation(json);
});


//------------------------------------------------------------
// ▼ 10連ガチャ
//------------------------------------------------------------
spin10Button.addEventListener("click", async () => {
    const current = Number(spinsDisplay.textContent);

    if (current < 10) {
        alert("回数が足りません");
        return;
    }

    const res = await fetch(`/api/spin10`, {
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
    alert("10連完了！");
});


//------------------------------------------------------------
// ▼ ガチャ演出 ＋ 景品動画再生
//------------------------------------------------------------
function playGachaAnimation(result) {
    // index.html の videoArea を使う
    const videoArea = document.getElementById("videoArea");

    videoArea.innerHTML = `
        <video id="effectVideo" class="effect-video" autoplay></video>
        <video id="prizeVideo" class="prize-video"></video>
    `;

    const effectVideo = document.getElementById("effectVideo");
    const prizeVideo  = document.getElementById("prizeVideo");

    // 演出動画
    effectVideo.src = result.effect;

    // 演出終了後 → 景品動画
    effectVideo.onended = () => {
        prizeVideo.src = result.prize.video_path;
        prizeVideo.style.display = "block";
        prizeVideo.play();
        effectVideo.remove();
    };
}


//------------------------------------------------------------
// ▼ 管理ログイン
//------------------------------------------------------------
adminLoginBtn.addEventListener("click", async () => {
    const password = adminPass.value;

    const res = await fetch(`/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
    });

    const json = await res.json();
    if (!json.ok) {
        alert("パスワードが違います");
        return;
    }

    document.getElementById("adminPanel").style.display = "block";

    loadAdminRates();
    loadPrizeList();
    loadSerialLogs();
});


//------------------------------------------------------------
// ▼ レア度確率読み込み
//------------------------------------------------------------
async function loadAdminRates() {
    const res = await fetch(`/api/admin/rates`);
    const rate = await res.json();

    document.getElementById("rateSuper").value  = rate.superrare;
    document.getElementById("rateRare").value   = rate.rare;
    document.getElementById("rateCommon").value = rate.common;
    document.getElementById("rateNormal").value = rate.normal;
}


//------------------------------------------------------------
// ▼ レア度確率 保存
//------------------------------------------------------------
document.getElementById("saveRateBtn").addEventListener("click", async () => {
    const body = {
        superrare: Number(document.getElementById("rateSuper").value),
        rare:      Number(document.getElementById("rateRare").value),
        common:    Number(document.getElementById("rateCommon").value),
        normal:    Number(document.getElementById("rateNormal").value)
    };

    await fetch(`/api/admin/rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    alert("保存しました！");
});


//------------------------------------------------------------
// ▼ 景品一覧
//------------------------------------------------------------
async function loadPrizeList() {
    const res = await fetch(`/api/admin/prizes`);
    const list = await res.json();

    prizeList.innerHTML = "";

    list.forEach(p => {
        const card = document.createElement("div");
        card.className = "prize-card";
        card.innerHTML = `
            <video src="${p.video_path}" muted></video>
            <p>${p.rarity}</p>
        `;
        prizeList.appendChild(card);
    });
}


//------------------------------------------------------------
// ▼ 景品 登録
//------------------------------------------------------------
addPrizeBtn.addEventListener("click", async () => {
    const file = prizeFile.files[0];
    const rarity = prizeRarity.value;

    if (!file) return alert("動画を選択してください");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("rarity", rarity);

    const res = await fetch(`/api/admin/prizes`, {
        method: "POST",
        body: fd
    });

    const json = await res.json();

    if (!json.ok) {
        alert("登録に失敗しました");
        return;
    }

    alert("登録しました");
    loadPrizeList();
});


//------------------------------------------------------------
// ▼ シリアル発行履歴
//------------------------------------------------------------
async function loadSerialLogs() {
    const res = await fetch(`/api/admin/serials`);
    const list = await res.json();

    serialLog.innerHTML = "";

    list.forEach(s => {
        const row = document.createElement("div");
        row.textContent = `${s.code} / ${s.spins}回 / ${
            s.used ? "使用済" : "未使用"
        }${s.usedAt ? " / " + s.usedAt : ""}`;
        serialLog.appendChild(row);
    });
}


//------------------------------------------------------------
// ▼ シリアル発行
//------------------------------------------------------------
issueSerialBtn.addEventListener("click", async () => {
    const code  = serialWord.value.trim();
    const spins = Number(serialSpins.value);

    if (!code || !spins) return alert("入力が不足しています");

    const res = await fetch(`/api/admin/serials/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, spins })
    });

    const json = await res.json();

    if (!json.ok) return alert("発行に失敗しました");

    alert("発行しました！");
    loadSerialLogs();
});


//------------------------------------------------------------
// ▼ マイコレ読み込み
//------------------------------------------------------------
async function loadMyCollection() {
    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const list = await res.json();

    // 初期化
    rowSuper.innerHTML = "";
    rowRare.innerHTML = "";
    rowCommon.innerHTML = "";
    rowNormal.innerHTML = "";

    // 分類して表示
    list.forEach(item => {
        const video = document.createElement("video");
        video.src = item.video_path;
        video.width = 140;
        video.controls = true;

        if (item.rarity === "superrare") rowSuper.appendChild(video);
        else if (item.rarity === "rare") rowRare.appendChild(video);
        else if (item.rarity === "common") rowCommon.appendChild(video);
        else rowNormal.appendChild(video);
    });
}
