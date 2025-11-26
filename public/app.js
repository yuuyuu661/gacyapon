/* ==========================================================
    app.js v7.3（完全修正版）
    - 演出動画 → 効果音 → 景品動画 or サムネ
    - 10連対応：新規は動画、重複はサムネ
    - マイコレ4段スライド
    - コンプリート残数 正しく表示
    - シリアル入力 → 回数追加 動作安定化
========================================================== */

let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", deviceId);
}

/* ==========================================================
    DOM
========================================================== */
const spinsDisplay = document.getElementById("spinsDisplay");
const spinButton = document.getElementById("spinButton");
const spin10Button = document.getElementById("spin10Button");
const completeText = document.getElementById("completeText");
const serialInput = document.getElementById("serialInput");

const gachaImage = document.getElementById("gachaImage");
const videoArea = document.getElementById("videoArea");

const rowSuper = document.getElementById("row-superrare");
const rowRare = document.getElementById("row-rare");
const rowCommon = document.getElementById("row-common");
const rowNormal = document.getElementById("row-normal");

/* ==========================================================
    初期ロード
========================================================== */
loadSpins();
loadMyCollection();

/* ==========================================================
    ▼ 回数読み込み
========================================================== */
async function loadSpins() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    spinsDisplay.textContent = data.spins ?? 0;
}

/* ==========================================================
    ▼ 効果音再生
========================================================== */
function playSE(rarity) {
    return new Promise(resolve => {
        const audio = new Audio(`/effects/sound/${rarity}.mp3`);
        audio.volume = 1.0;
        audio.play();
        audio.onended = () => resolve();
    });
}

/* ==========================================================
    ▼ 演出動画再生
========================================================== */
function playVideo(url) {
    return new Promise(resolve => {
        gachaImage.style.display = "none";
        videoArea.innerHTML = "";

        const v = document.createElement("video");
        v.src = url;
        v.autoplay = true;
        v.playsInline = true;

        v.onended = () => {
            resolve();
        };

        videoArea.appendChild(v);
    });
}

/* ==========================================================
    ▼ サムネ（重複の場合1フレームだけ表示）
========================================================== */
function showThumbnail(url) {
    return new Promise(resolve => {
        gachaImage.style.display = "none";
        videoArea.innerHTML = "";

        const v = document.createElement("video");
        v.src = url;
        v.className = "thumb-video-large";
        v.muted = true;

        v.addEventListener("loadeddata", () => {
            resolve();
        });

        videoArea.appendChild(v);
    });
}

/* ==========================================================
    ▼ コンプリート残数
========================================================== */
async function updateCompleteCount() {
    const allRes = await fetch(`/api/admin/prizes`, {
        headers: { Authorization: "" }
    });
    const allPrizes = await allRes.json();

    const myRes = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const myPrizes = await myRes.json();

    const remain = allPrizes.length - myPrizes.length;

    if (remain <= 10) completeText.style.color = "red";
    else completeText.style.color = "black";

    completeText.textContent = `コンプリートまで残り ${remain} 種類！`;
}

/* ==========================================================
    ▼ マイコレ読込
========================================================== */
async function loadMyCollection() {
    rowSuper.innerHTML = "";
    rowRare.innerHTML = "";
    rowCommon.innerHTML = "";
    rowNormal.innerHTML = "";

    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const data = await res.json();

    data.forEach(item => {
        const video = document.createElement("video");
        video.src = item.url;
        video.className = "thumb-video";

        if (item.rarity === "superrare") rowSuper.appendChild(video);
        else if (item.rarity === "rare") rowRare.appendChild(video);
        else if (item.rarity === "common") rowCommon.appendChild(video);
        else rowNormal.appendChild(video);
    });

    updateCompleteCount();
}

/* ==========================================================
    ▼ シリアルコード入力（回数追加）
========================================================== */
async function redeemSerial() {
    const code = serialInput.value.trim();
    if (!code) return alert("コードを入力してください");

    const res = await fetch("/api/redeem-serial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, deviceId })
    });

    const data = await res.json();

    if (!data.ok) {
        alert(data.error || "エラー");
        return;
    }

    spinsDisplay.textContent = data.spins;
    serialInput.value = "";
}

/* ==========================================================
    ▼ 単発ガチャ
========================================================== */
spinButton.addEventListener("click", async () => {

    const res = await fetch("/api/spin", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });

    const data = await res.json();

    if (!data.ok) {
        alert(data.error || "エラー");
        return;
    }

    spinsDisplay.textContent = Number(spinsDisplay.textContent) - 1;

    /* ① 演出動画 */
    await playVideo(data.effect);

    /* ② 効果音 */
    await playSE(data.rarity);

    /* ③ 重複確認 */
    const myRes = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const before = await myRes.json();
    const already = before.some(x => x.video_path === data.prize.video_path);

    /* ④ 景品動画 or サムネ */
    if (already) {
        await showThumbnail(data.prize.url);
    } else {
        await playVideo(data.prize.url);
    }

    gachaImage.style.display = "block";
    loadMyCollection();
});

/* ==========================================================
    ▼ 10連ガチャ
========================================================== */
spin10Button.addEventListener("click", async () => {
    const spins = Number(spinsDisplay.textContent);
    if (spins < 10) {
        alert("回数が足りません！");
        return;
    }

    const res = await fetch("/api/spin10", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });

    const data = await res.json();

    if (!data.ok) {
        alert("エラー");
        return;
    }

    spinsDisplay.textContent = spins - 10;

    for (const result of data.results) {
        if (!result || result.error) continue;

        /* ① 演出 */
        await playVideo(result.effect);

        /* ② 効果音 */
        await playSE(result.rarity);

        /* ③ 所持チェック */
        const myRes = await fetch(`/api/my-collection?deviceId=${deviceId}`);
        const before = await myRes.json();
        const already = before.some(item => item.video_path === result.prize.video_path);

        /* ④ 本編 or サムネ */
        if (!already) {
            await playVideo(result.prize.url);
        } else {
            await showThumbnail(result.prize.url);
        }
    }

    gachaImage.style.display = "block";
    loadMyCollection();
});
