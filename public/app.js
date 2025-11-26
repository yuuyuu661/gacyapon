//------------------------------------------------------------
// app.js v7.6 完全安定版（UIは一切変更なし）
//------------------------------------------------------------

const API = "";

// 端末ID
function getDeviceId() {
    let id = localStorage.getItem("devId");
    if (!id) {
        id = "dev-" + Math.random().toString(36).substring(2, 12);
        localStorage.setItem("devId", id);
    }
    return id;
}
const deviceId = getDeviceId();

// DOM
const spinsDisplay = document.getElementById("spinsDisplay");

const serialAddBtn = document.getElementById("serialAddBtn");
const serialInput = document.getElementById("serialInput");

const spinButton = document.getElementById("spinButton");
const spin10Button = document.getElementById("spin10Button");

const effectVideo = document.getElementById("effectVideo");
const prizeVideo = document.getElementById("prizeVideo");

//------------------------------------------------------------
// 残り回数ロード
//------------------------------------------------------------
async function loadDevice() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    spinsDisplay.textContent = data.spins ?? 0;
}
loadDevice();


//------------------------------------------------------------
// シリアル使用 → 回数追加
//------------------------------------------------------------
serialAddBtn.onclick = async () => {
    const code = serialInput.value.trim();
    if (!code) return alert("コードを入力してください");

    const res = await fetch(`/api/redeem-serial`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ code, deviceId })
    });

    const data = await res.json();

    if (!data.ok) return alert(data.error);

    spinsDisplay.textContent = data.spins;
    serialInput.value = "";
    alert("回数が追加されました！");
};


//------------------------------------------------------------
// 単発ガチャ
//------------------------------------------------------------
spinButton.onclick = async () => {
    const res = await fetch(`/api/spin`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });

    const data = await res.json();
    if (!data.ok) return alert(data.error);

    spinsDisplay.textContent = data.prize ? data.prize.spins : spinsDisplay.textContent;

    playGacha(data);
};


//------------------------------------------------------------
// 10連ガチャ
//------------------------------------------------------------
spin10Button.onclick = async () => {
    if (Number(spinsDisplay.textContent) < 10) {
        return alert("回数不足");
    }

    const res = await fetch(`/api/spin10`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });

    const data = await res.json();
    if (!data.ok) return alert(data.error);

    spinsDisplay.textContent = data.spins;

    alert("10連完了！");
};


//------------------------------------------------------------
// ガチャ演出 → 景品動画
//------------------------------------------------------------
function playGacha(data) {
    const rarity = data.rarity;
    const effectPath = `/effects/video/${rarity}.mp4`;

    effectVideo.src = effectPath;
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
// マイコレ読み込み
//------------------------------------------------------------
async function loadMyCollection() {
    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const list = await res.json();

    document.getElementById("row-superrare").innerHTML = "";
    document.getElementById("row-rare").innerHTML = "";
    document.getElementById("row-common").innerHTML = "";
    document.getElementById("row-normal").innerHTML = "";

    list.forEach(item => {
        const v = document.createElement("video");
        v.src = item.video_path;
        v.muted = true;
        v.width = 120;

        if (item.rarity === "superrare")
            document.getElementById("row-superrare").appendChild(v);
        else if (item.rarity === "rare")
            document.getElementById("row-rare").appendChild(v);
        else if (item.rarity === "common")
            document.getElementById("row-common").appendChild(v);
        else
            document.getElementById("row-normal").appendChild(v);
    });
}


//------------------------------------------------------------
// 管理パネル
//------------------------------------------------------------
const adminLoginBtn = document.getElementById("adminLoginBtn");
const adminPass = document.getElementById("adminPass");

adminLoginBtn.onclick = async () => {
    const pw = adminPass.value;
    if (!pw) return;

    const res = await fetch(`/api/admin/login`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ password: pw })
    });

    const data = await res.json();
    if (!data.ok) return alert("パスワードが違います");

    adminPanel.style.display = "block";
    loadAdminRates();
    loadPrizeList();
    loadSerialLogs();
};


//------------------------------------------------------------
// レア度確率
//------------------------------------------------------------
async function loadAdminRates() {
    const r = await (await fetch(`/api/admin/rates`)).json();

    rateSuper.value = r.superrare;
    rateRare.value = r.rare;
    rateCommon.value = r.common;
    rateNormal.value = r.normal;
}

saveRateBtn.onclick = async () => {
    const body = {
        superrare: Number(rateSuper.value),
        rare: Number(rateRare.value),
        common: Number(rateCommon.value),
        normal: Number(rateNormal.value)
    };

    await fetch(`/api/admin/rates`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify(body)
    });

    alert("保存しました！");
};


//------------------------------------------------------------
// 景品登録
//------------------------------------------------------------
addPrizeBtn.onclick = async () => {
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

    const data = await res.json();
    if (!data.ok) return alert("登録失敗");

    alert("登録しました！");
    loadPrizeList();
};

async function loadPrizeList() {
    const list = await (await fetch(`/api/admin/prizes`)).json();
    prizeList.innerHTML = "";

    list.forEach(p => {
        const card = document.createElement("div");
        card.innerHTML = `
            <video src="${p.video_path}" width="120" muted></video>
            <p>${p.rarity}</p>
        `;
        prizeList.appendChild(card);
    });
}


//------------------------------------------------------------
// シリアル発行
//------------------------------------------------------------
issueSerialBtn.onclick = async () => {
    const code = serialWord.value.trim();
    const spins = Number(serialSpins.value);

    if (!code || !spins) return alert("不足があります");

    const res = await fetch(`/api/admin/serials/issue`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ code, spins })
    });

    const data = await res.json();
    if (!data.ok) return alert("失敗");

    alert("発行しました！");
    loadSerialLogs();
};

async function loadSerialLogs() {
    const logs = await (await fetch(`/api/admin/serials`)).json();
    serialLog.innerHTML = "";

    logs.forEach(s => {
        const div = document.createElement("div");
        div.textContent = `${s.code} / ${s.spins}回 / ${s.used ? "使用済" : "未使用"}`;
        serialLog.appendChild(div);
    });
}
