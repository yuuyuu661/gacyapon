//------------------------------------------------------------
// app.js v7.7（UI変更なし / 音バグ修正 / 横スクロール / 保存）
//------------------------------------------------------------

// デバイスID管理
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

// DOM
const spinsDisplay = document.getElementById("spinsDisplay");
const serialInput = document.getElementById("serialInput");
const addSpinBtn = document.getElementById("addSpinBtn");
const spinBtn = document.getElementById("spinBtn");
const spin10Btn = document.getElementById("spin10Btn");

const effectVideo = document.getElementById("effectVideo");
const prizeVideo = document.getElementById("prizeVideo");

//------------------------------------------------------------
// 残り回数読み込み
//------------------------------------------------------------
async function loadDevice() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    spinsDisplay.textContent = data.spins ?? 0;
}
loadDevice();


//------------------------------------------------------------
// シリアル使用
//------------------------------------------------------------
addSpinBtn.onclick = async () => {
    const code = serialInput.value.trim();
    if (!code) return alert("コードを入力してください");

    const res = await fetch(`/api/redeem-serial`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ code, deviceId })
    });
    const json = await res.json();

    if (!json.ok) return alert(json.error);

    spinsDisplay.textContent = json.spins;
    serialInput.value = "";
};


//------------------------------------------------------------
// ガチャ演出
//------------------------------------------------------------
function playEffectAndPrize(data) {

    // 音を強制的に ON（ユーザー操作後のみ可能）
    effectVideo.muted = false;
    prizeVideo.muted = false;

    // 演出動画
    effectVideo.src = data.effect;
    effectVideo.style.display = "block";
    prizeVideo.style.display = "none";

    effectVideo.play();

    effectVideo.onended = () => {
        effectVideo.style.display = "none";
        prizeVideo.src = data.prize.video_path;
        prizeVideo.style.display = "block";
        prizeVideo.play();
    };
}


//------------------------------------------------------------
// 単発
//------------------------------------------------------------
spinBtn.onclick = async () => {
    const res = await fetch(`/api/spin`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });

    const json = await res.json();
    if (!json.ok) return alert(json.error);

    // 残数を更新
    loadDevice();

    playEffectAndPrize(json);
};


//------------------------------------------------------------
// 10連
//------------------------------------------------------------
spin10Btn.onclick = async () => {
    const r = await fetch(`/api/spin10`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });

    const json = await r.json();
    if (!json.ok) return alert(json.error);

    loadDevice();
    alert("10連完了！");
};


//------------------------------------------------------------
// マイコレの読み込み
//------------------------------------------------------------
async function loadCollection() {
    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const list = await res.json();

    // 4つの枠をクリア
    ["superrare","rare","common","normal"].forEach(r => {
        document.getElementById(`row-${r}`).innerHTML = "";
    });

    list.forEach(item => {
        const wrap = document.createElement("div");
        wrap.innerHTML = `
            <video class="collection-video" src="${item.video_path}" controls></video>
            <button class="save-btn">💾 保存</button>
        `;

        // 保存ボタン
        wrap.querySelector(".save-btn").onclick = () => {
            const a = document.createElement("a");
            a.href = item.video_path;
            a.download = item.video_path.split("/").pop();
            a.click();
        };

        document.getElementById(`row-${item.rarity}`).appendChild(wrap);
    });
}


//------------------------------------------------------------
// 管理ログイン
//------------------------------------------------------------
document.getElementById("adminLoginBtn").onclick = async () => {
    const pw = document.getElementById("adminPass").value;

    const res = await fetch(`/api/admin/login`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ password: pw })
    });

    const json = await res.json();
    if (!json.ok) return alert("パスワードが違います");

    document.getElementById("adminPanel").style.display = "block";

    loadAdminRates();
    loadPrizeList();
    loadSerialLogs();
};


//------------------------------------------------------------
// レア度確率
//------------------------------------------------------------
async function loadAdminRates() {
    const res = await fetch(`/api/admin/rates`);
    const r = await res.json();

    rateSuper.value = r.superrare;
    rateRare.value = r.rare;
    rateCommon.value = r.common;
    rateNormal.value = r.normal;
}

document.getElementById("saveRateBtn").onclick = async () => {
    const data = {
        superrare: Number(rateSuper.value),
        rare: Number(rateRare.value),
        common: Number(rateCommon.value),
        normal: Number(rateNormal.value)
    };

    await fetch(`/api/admin/rates`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify(data)
    });

    alert("保存しました");
};


//------------------------------------------------------------
// 景品一覧表示（横スクロール）
//------------------------------------------------------------
async function loadPrizeList() {
    const res = await fetch(`/api/admin/prizes`);
    const list = await res.json();

    ["superrare","rare","common","normal"].forEach(r => {
        document.getElementById(`prizeRow-${r}`).innerHTML = "";
    });

    list.forEach(p => {
        const card = document.createElement("div");
        card.className = "prize-card";
        card.innerHTML = `
            <video src="${p.video_path}" muted></video>
            <p>${p.rarity}</p>
        `;
        document.getElementById(`prizeRow-${p.rarity}`).appendChild(card);
    });
}


//------------------------------------------------------------
// 景品登録
//------------------------------------------------------------
document.getElementById("addPrizeBtn").onclick = async () => {
    const file = prizeFile.files[0];
    const rarity = prizeRarity.value;

    if (!file) return alert("動画を選択");

    const fd = new FormData();
    fd.append("file", file);
    fd.append("rarity", rarity);

    const res = await fetch(`/api/admin/prizes`, {
        method:"POST",
        body: fd
    });

    const json = await res.json();
    if (!json.ok) return alert(json.error);

    loadPrizeList();
    alert("登録しました！");
};


//------------------------------------------------------------
// シリアル発行
//------------------------------------------------------------
async function loadSerialLogs() {
    const r = await fetch(`/api/admin/serials`);
    const logs = await r.json();

    const area = document.getElementById("serialLog");
    area.innerHTML = "";

    logs.forEach(s => {
        const d = document.createElement("div");
        d.textContent = `${s.code} / ${s.spins}回 / ${s.used ? "使用済" : "未使用"}`;
        area.appendChild(d);
    });
}

document.getElementById("issueSerialBtn").onclick = async () => {
    const code = serialWord.value.trim();
    const spins = Number(serialSpins.value);

    if (!code || !spins) return alert("未入力あり");

    const res = await fetch(`/api/admin/serials/issue`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({code, spins})
    });

    const json = await res.json();
    if (!json.ok) return alert("エラー");

    loadSerialLogs();
    alert("発行しました！");
};


//------------------------------------------------------------
// タブ切り替え
//------------------------------------------------------------
document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
        document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

        btn.classList.add("active");
        document.getElementById(btn.dataset.tab).classList.add("active");

        if (btn.dataset.tab === "collection") loadCollection();
    });
});
