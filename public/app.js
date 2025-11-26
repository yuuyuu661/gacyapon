/* ==========================================================
    app.js v7.2（SE完全対応版）
    - 演出動画 → 効果音 → 景品動画
    - 重複は演出→SE→サムネのみ
    - 10連対応
    - マイコレ4段
    - コンプリート残数表示
========================================================== */

let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", deviceId);
}

/* ▼ DOM参照 */
const spinsDisplay = document.getElementById("spinsDisplay");
const spinButton = document.getElementById("spinButton");
const spin10Button = document.getElementById("spin10Button");
const completeText = document.getElementById("completeText");
const gachaImage = document.getElementById("gachaImage");
const videoArea = document.getElementById("videoArea");

const rowSuper = document.getElementById("row-superrare");
const rowRare = document.getElementById("row-rare");
const rowCommon = document.getElementById("row-common");
const rowNormal = document.getElementById("row-normal");

/* 初期ロード */
loadSpins();
loadMyCollection();

/* ==========================================================
    ▼ ガチャ残数読込
========================================================== */
async function loadSpins() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    spinsDisplay.textContent = data.spins ?? 0;
}

/* ==========================================================
    ▼ 効果音再生（レア度に対応）
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
    ▼ 演出動画 / 景品動画再生
========================================================== */
function playVideo(url) {
    return new Promise(resolve => {
        gachaImage.style.display = "none";
        videoArea.innerHTML = "";

        const v = document.createElement("video");
        v.src = url;
        v.autoplay = true;
        v.playsInline = true;
        v.onended = () => resolve();

        videoArea.appendChild(v);
    });
}

/* 重複時：サムネ1フレームだけ表示 */
function showThumbnail(url) {
    return new Promise(resolve => {
        gachaImage.style.display = "none";
        videoArea.innerHTML = "";

        const img = document.createElement("video");
        img.src = url;
        img.className = "thumb-video-large";

        img.addEventListener("loadeddata", () => resolve());

        videoArea.appendChild(img);
    });
}

/* ==========================================================
    ▼ コンプリート残数
========================================================== */
async function updateCompleteCount() {
    const prizeRes = await fetch(`/api/admin/prizes`, { headers: { Authorization: "" }});
    const allPrizes = await prizeRes.json();

    const myRes = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const myPrizes = await myRes.json();

    const remain = allPrizes.length - myPrizes.length;

    if (remain <= 10) completeText.style.color = "red";
    else completeText.style.color = "black";

    completeText.textContent = `コンプリートまで残り ${remain} 種類！`;
}

/* ==========================================================
    ▼ マイコレ読込（4段）
========================================================== */
async function loadMyCollection() {
    rowSuper.innerHTML = "";
    rowRare.innerHTML = "";
    rowCommon.innerHTML = "";
    rowNormal.innerHTML = "";

    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const data = await res.json();

    data.forEach(item => {
        const thumb = document.createElement("video");
        thumb.src = `/uploads/${item.video_path}`;
        thumb.className = "thumb-video";

        if (item.rarity === "superrare") rowSuper.appendChild(thumb);
        else if (item.rarity === "rare") rowRare.appendChild(thumb);
        else if (item.rarity === "common") rowCommon.appendChild(thumb);
        else rowNormal.appendChild(thumb);
    });

    updateCompleteCount();
}

/* ==========================================================
    ▼ 単発ガチャ
========================================================== */
spinButton.addEventListener("click", async () => {
    const res = await fetch("/api/spin", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
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
    const beforeList = await myRes.json();
    const already = beforeList.some(x => x.video_path === data.prize.video_path);

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
    if (spins < 10) return alert("回数が足りません！");

    const res = await fetch("/api/spin10", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ deviceId })
    });
    const data = await res.json();

    if (!data.ok) return alert("エラー");

    spinsDisplay.textContent = spins - 10;

    for (const result of data.results) {
        if (!result || result.error) continue;

        /* ① 演出動画 */
        await playVideo(result.effect);

        /* ② 効果音 */
        await playSE(result.rarity);

        /* 所持確認 */
        const myBefore = await fetch(`/api/my-collection?deviceId=${deviceId}`);
        const beforeList = await myBefore.json();
        const already = beforeList.some(item => item.video_path === result.prize.video_path);

        /* ③ 景品動画 or サムネ */
        if (!already) {
            await playVideo(result.prize.url);
        } else {
            await showThumbnail(result.prize.url);
        }
    }

    gachaImage.style.display = "block";
    loadMyCollection();
});
