//------------------------------------------------------------
//  app.js v7.7  (ガチャポンUI完全版)
//------------------------------------------------------------

const deviceId = localStorage.getItem("deviceId") || crypto.randomUUID();
localStorage.setItem("deviceId", deviceId);

// DOM
const spinsText = document.getElementById("spinsText");
const spinBtn = document.getElementById("spinBtn");
const spin10Btn = document.getElementById("spin10Btn");
const effectVideo = document.getElementById("effectVideo");
const prizeVideo = document.getElementById("prizeVideo");
const prizeThumb = document.getElementById("prizeThumb");
const gachaImage = document.getElementById("gachaImage");
const resultBox = document.getElementById("resultBox");
const completeText = document.getElementById("completeText");

// マイコレ
const collectionList = document.getElementById("collectionList");

// API BASE
const API = "";

// レア度別効果音
const se = {
    superrare: new Audio("/effects/se/superrare.mp3"),
    rare: new Audio("/effects/se/rare.mp3"),
    common: new Audio("/effects/se/common.mp3"),
    normal: new Audio("/effects/se/normal.mp3"),
};

//------------------------------------------------------------
// デバイス情報ロード
//------------------------------------------------------------
async function loadDevice() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    updateSpins(data.spins);
    loadCollection();
}
loadDevice();

// 更新
function updateSpins(n) {
    spinsText.textContent = `残り回数：${n}`;
}

//------------------------------------------------------------
// コンプリート数チェック
//------------------------------------------------------------
async function updateCompleteCount() {
    const res = await fetch(`/api/admin/prizes`);
    const prizes = await res.json();

    const res2 = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const col = await res2.json();

    const remaining = prizes.length - col.length;

    if (remaining > 0) {
        completeText.style.color = "#000";
        completeText.innerHTML = `コンプリートまで残り <b>${remaining}</b> 種類！`;
    } else {
        completeText.style.color = "#FFD700";
        completeText.innerHTML =
            `✨✨ <b>コンプリートおめでとう！！</b> ✨✨<br>
             ✨ 受付の人に言って特別景品を貰おう！！！ ✨`;
    }
}

//------------------------------------------------------------
// マイコレ読み込み
//------------------------------------------------------------
async function loadCollection() {
    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const data = await res.json();

    collectionList.innerHTML = "";

    for (const item of data) {
        const wrap = document.createElement("div");
        wrap.className = "collectionItem";

        const thumb = document.createElement("img");
        thumb.src = item.video_path;
        thumb.className = "collectionThumb";

        thumb.onclick = () => {
            // 動画を上からオーバーレイ表示
            openVideoPlayer(item.video_path);
        };

        wrap.appendChild(thumb);
        collectionList.appendChild(wrap);
    }

    updateCompleteCount();
}

//------------------------------------------------------------
// 動画プレイヤー（オーバーレイ）
//------------------------------------------------------------
function openVideoPlayer(src) {
    const overlay = document.createElement("div");
    overlay.className = "videoOverlay";

    const video = document.createElement("video");
    video.src = src;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.webkitPlaysInline = true;

    const closeBtn = document.createElement("div");
    closeBtn.textContent = "×";
    closeBtn.className = "closeVideoBtn";
    closeBtn.onclick = () => overlay.remove();

    overlay.appendChild(video);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
}

//------------------------------------------------------------
// ガチャ 演出開始
//------------------------------------------------------------
function playEffect(effectPath, rarity) {
    return new Promise((resolve) => {
        resultBox.style.display = "none";
        prizeThumb.style.display = "none";
        prizeVideo.style.display = "none";

        // 演出表示
        effectVideo.src = effectPath;
        effectVideo.style.display = "block";
        effectVideo.play();

        // 1秒後に効果音
        setTimeout(() => {
            se[rarity].currentTime = 0;
            se[rarity].play();
        }, 1000);

        // 演出終了で resolve
        effectVideo.onended = () => {
            effectVideo.style.display = "none";
            resolve();
        };
    });
}

//------------------------------------------------------------
// 景品動画 再生
//------------------------------------------------------------
function playPrizeVideo(videoPath) {
    return new Promise((resolve) => {
        prizeVideo.src = videoPath;
        prizeVideo.style.display = "block";
        prizeVideo.play();

        prizeVideo.onended = () => {
            prizeVideo.style.display = "none";
            resultBox.style.display = "none";
            resolve();
        };
    });
}

//------------------------------------------------------------
// 被り：サムネ2秒表示
//------------------------------------------------------------
function showDuplicateThumb(videoPath) {
    return new Promise((resolve) => {
        prizeThumb.src = videoPath;
        prizeThumb.style.display = "block";
        resultBox.style.display = "block";

        setTimeout(() => {
            prizeThumb.style.display = "none";
            resultBox.style.display = "none";
            resolve();
        }, 2000);
    });
}

//------------------------------------------------------------
// 単発 ガチャ
//------------------------------------------------------------
spinBtn.onclick = async () => {
    const res = await fetch(`/api/spin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
    });

    const data = await res.json();

    if (!data.ok) {
        alert(data.error);
        return;
    }

    // 残り回数更新
    loadDevice();

    const { rarity, effect, prize } = data;

    // 演出スタート
    await playEffect(effect, rarity);

    if (!prize.already) {
        // 初ゲット → 本編再生
        await playPrizeVideo(prize.video_path);
    } else {
        // 被り → サムネ2秒表示
        await showDuplicateThumb(prize.video_path);
    }

    loadCollection();
};

//------------------------------------------------------------
// 10連ガチャ
//------------------------------------------------------------
spin10Btn.onclick = async () => {
    const res = await fetch(`/api/spin10`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId }),
    });

    const data = await res.json();

    if (!data.ok) {
        alert(data.error);
        return;
    }

    loadDevice();

    for (const r of data.results) {
        if (r.error) continue;

        await playEffect(r.effect, r.rarity);

        if (!r.prize.already) {
            await playPrizeVideo(r.prize.video_path);
        } else {
            await showDuplicateThumb(r.prize.video_path);
        }
    }

    loadCollection();
};

//------------------------------------------------------------
