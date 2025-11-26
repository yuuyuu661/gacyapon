/* ==========================================================
    app.js v7.1
    - 単発ガチャ：演出 → 景品動画（重複はサムネのみ）
    - 10連ガチャ：新規は演出→動画、重複はサムネのみ
    - コンプリート残数表示（色変化）
    - マイコレ4段（superrare, rare, common, normal）
========================================================== */

// デバイスID（初回だけ生成）
let deviceId = localStorage.getItem("deviceId");
if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", deviceId);
}

/* ==========================================================
    DOM 取得
========================================================== */
const spinsDisplay = document.getElementById("spinsDisplay");
const spinButton = document.getElementById("spinButton");
const spin10Button = document.getElementById("spin10Button");
const completeText = document.getElementById("completeText");

const gachaImage = document.getElementById("gachaImage");
const videoArea = document.getElementById("videoArea");

const myCollectionArea = document.getElementById("myCollection");

// マイコレレア度ブロック
const rowSuper = document.getElementById("row-superrare");
const rowRare = document.getElementById("row-rare");
const rowCommon = document.getElementById("row-common");
const rowNormal = document.getElementById("row-normal");

/* ==========================================================
    初期読込
========================================================== */
loadSpins();
loadMyCollection();

/* ==========================================================
    回数読込
========================================================== */
async function loadSpins() {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const data = await res.json();
    spinsDisplay.textContent = data.spins ?? 0;
}

/* ==========================================================
    コンプリート残数表示
========================================================== */
async function updateCompleteCount() {
    const prizeRes = await fetch(`/api/admin/prizes`, { 
        headers: { Authorization: "" } 
    });
    const allPrizes = await prizeRes.json();

    const myRes = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const myPrizes = await myRes.json();

    const remain = allPrizes.length - myPrizes.length;
    if (remain <= 10) {
        completeText.style.color = "red";
    } else {
        completeText.style.color = "black";
    }
    completeText.textContent = `コンプリートまで残り ${remain} 種類！`;
}

/* ==========================================================
    マイコレ読込（4段スライド）
========================================================== */
async function loadMyCollection() {
    myCollectionArea.innerHTML = "";

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
    ▼ 共通：動画再生ヘルパー
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

/* ==========================================================
    ▼ サムネだけ表示（重複時）
========================================================== */
function showThumbnail(url) {
    return new Promise(resolve => {
        gachaImage.style.display = "none";
        videoArea.innerHTML = "";
        
        const img = document.createElement("video");
        img.src = url;
        img.className = "thumb-video-large";
        img.autoplay = false;
        img.controls = false;

        // 1フレーム目だけ表示する
        img.addEventListener("loadeddata", () => {
            resolve();
        });

        videoArea.appendChild(img);
    });
}

/* ==========================================================
    ▼ 単発ガチャ
========================================================== */
spinButton.addEventListener("click", async () => {
    const res = await fetch("/api/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId })
    });

    const data = await res.json();
    if (!data.ok) {
        alert(data.error || "エラー");
        return;
    }

    spinsDisplay.textContent = Number(spinsDisplay.textContent) - 1;

    // ① 演出（レア度.mp4）
    await playVideo(data.effect);

    // ② 景品動画（初ゲット）
    //    重複はサムネのみ
    const colRes = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const beforeList = await colRes.json();
    const already = beforeList.some(x => x.video_path === data.prize.video_path);

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
        headers: { "Content-Type": "application/json" },
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

        // ▼ ① 演出
        await playVideo(result.effect);

        // デバイスの所持リスト読込
        const myBefore = await fetch(`/api/my-collection?deviceId=${deviceId}`);
        const beforeList = await myBefore.json();
        const already = beforeList.some(item => item.video_path === result.prize.video_path);

        // ▼ ② 新規 → 動画再生
        if (!already) {
            await playVideo(result.prize.url);
        }
        // ▼ 重複 → サムネのみ
        else {
            await showThumbnail(result.prize.url);
        }
    }

    gachaImage.style.display = "block";
    loadMyCollection();
});
