/* ==========================================================
    app.js v7.0
    - ガチャ単発 & 10連
    - マイコレクション：レア度 4 段 UI
    - コンプリート残数表示
    - スマホ対応
    - 管理タブ：レア度確率の編集
========================================================== */

const deviceId = (() => {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2);
    localStorage.setItem("deviceId", id);
  }
  return id;
})();

let spins = 0;  // 残り回数
let rarityRates = {}; // レア度確率（管理画面）

/* ==========================================================
    DOM 取得
========================================================== */
const spinBtn = document.getElementById("spinBtn");
const spin10Btn = document.getElementById("spin10Btn");
const spinCountText = document.getElementById("spinCount");
const completeText = document.getElementById("completeText");

// レア度ごとのマイコレブロック
const colSuperRare = document.getElementById("col-superrare");
const colRare = document.getElementById("col-rare");
const colCommon = document.getElementById("col-common");
const colNormal = document.getElementById("col-normal");

// レア度ラベル
const rateSuperrareInput = document.getElementById("rate-superrare");
const rateRareInput = document.getElementById("rate-rare");
const rateCommonInput = document.getElementById("rate-common");
const rateNormalInput = document.getElementById("rate-normal");
const saveRatesBtn = document.getElementById("saveRatesBtn");

// ガチャ演出の表示枠
const gachaDisplay = document.getElementById("gachaDisplay");
const gachaImage = document.getElementById("gachaImage");
const gachaVideo = document.getElementById("gachaVideo");

// エラー表示
function showError(msg) {
  alert(msg);
}

/* ==========================================================
    初期ロード
========================================================== */
async function init() {
  await loadSpins();
  await loadCollection();
  await loadRarityRates();
}
window.onload = init;

/* ---------------------------------------------
    残り回数を取得
--------------------------------------------- */
async function loadSpins() {
  try {
    const res = await fetch(`/api/device?deviceId=${deviceId}`);
    const json = await res.json();
    spins = json.spins || 0;
    spinCountText.textContent = spins;
  } catch (e) {
    console.error(e);
    showError("回数読み込みに失敗しました");
  }
}

/* ---------------------------------------------
    レア度率読み込み（管理）
--------------------------------------------- */
async function loadRarityRates() {
  try {
    const token = localStorage.getItem("adminToken");
    if (!token) return;

    const res = await fetch(`/api/admin/rarity-rates`, {
      headers: { "Authorization": "Bearer " + token }
    });
    const list = await res.json();

    list.forEach(r => {
      rarityRates[r.rarity] = r.rate;
    });

    rateSuperrareInput.value = rarityRates.superrare;
    rateRareInput.value = rarityRates.rare;
    rateCommonInput.value = rarityRates.common;
    rateNormalInput.value = rarityRates.normal;

  } catch (e) {
    console.error(e);
  }
}

/* ---------------------------------------------
    レア度確率更新
--------------------------------------------- */
saveRatesBtn?.addEventListener("click", async () => {
  try {
    const token = localStorage.getItem("adminToken");
    if (!token) return showError("管理者ログインが必要です");

    const body = {
      superrare: Number(rateSuperrareInput.value),
      rare: Number(rateRareInput.value),
      common: Number(rateCommonInput.value),
      normal: Number(rateNormalInput.value)
    };

    const res = await fetch(`/api/admin/rarity-rates/update`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    const json = await res.json();
    if (json.ok) {
      alert("保存しました！");
      loadRarityRates();
    } else {
      showError("保存に失敗");
    }

  } catch (e) {
    console.error(e);
    showError("保存時にエラー");
  }
});
/* ==========================================================
    マイコレクション取得（レア度4段で表示）
========================================================== */
async function loadCollection() {
  try {
    const res = await fetch(`/api/my-collection?deviceId=${deviceId}`);
    const list = await res.json();

    /* 4段ブロックを全部クリア */
    colSuperRare.innerHTML = "";
    colRare.innerHTML = "";
    colCommon.innerHTML = "";
    colNormal.innerHTML = "";

    /* 種類数カウント */
    const owned = new Set();
    list.forEach(item => owned.add(item.video_path));

    /* 全景品数を取得してコンプリート残数を算出 */
    const total = await fetchTotalPrizes();
    const remaining = total - owned.size;

    completeText.textContent = `コンプリートまで残り ${remaining} 種類！`;
    completeText.style.color = remaining <= 10 ? "red" : "black";

    /* レア度ごとに追加 */
    list.forEach(item => {
      const box = document.createElement("div");
      box.className = "collection-item";

      /* 動画の1フレーム目をサムネ化 */
      const thumb = document.createElement("video");
      thumb.src = "/uploads/" + item.video_path;
      thumb.className = "collection-thumb";
      thumb.muted = true;
      thumb.playsInline = true;
      thumb.preload = "metadata";

      box.appendChild(thumb);

      /* タップすると動画再生 */
      box.onclick = () => {
        playCollectionVideo(item.video_path);
      };

      switch (item.rarity) {
        case "superrare":
          colSuperRare.appendChild(box);
          break;
        case "rare":
          colRare.appendChild(box);
          break;
        case "common":
          colCommon.appendChild(box);
          break;
        default:
          colNormal.appendChild(box);
      }
    });

  } catch (e) {
    console.error(e);
    showError("マイコレクション読み込み失敗");
  }
}

/* ---------------------------------------------
    全景品数を取得（コンプリート判定用）
--------------------------------------------- */
async function fetchTotalPrizes() {
  try {
    const token = localStorage.getItem("adminToken");
    const res = await fetch(`/api/admin/prizes`, {
      headers: token ? { "Authorization": "Bearer " + token } : {}
    });
    const list = await res.json();
    return list.length;
  } catch {
    return 0;
  }
}

/* ---------------------------------------------
    マイコレ動画を再生
--------------------------------------------- */
function playCollectionVideo(videoPath) {
  gachaImage.style.display = "none";
  gachaVideo.style.display = "block";
  gachaVideo.src = "/uploads/" + videoPath;
  gachaVideo.play();

  gachaVideo.onended = () => {
    gachaVideo.style.display = "none";
    gachaImage.style.display = "block";
  };
}
/* ==========================================================
    ガチャ演出（単発）
========================================================== */
spinBtn.addEventListener("click", async () => {
  if (spins <= 0) return showError("回数がありません");

  try {
    const res = await fetch("/api/spin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId })
    });
    const json = await res.json();
    if (!json.ok) return showError(json.error || "ガチャ失敗");

    spins -= 1;
    spinCountText.textContent = spins;

    await playGachaResult(json.prize, true); // 新規動画は演出あり

    await loadCollection();
  } catch (e) {
    console.error(e);
    showError("ガチャ通信エラー");
  }
});

/* ==========================================================
    10連ガチャ
========================================================== */
spin10Btn.addEventListener("click", async () => {
  if (spins < 10) return showError("10回分の回数がありません");

  try {
    const res = await fetch("/api/spin10", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId })
    });
    const json = await res.json();
    if (!json.ok) return showError("10連に失敗");

    spins -= 10;
    spinCountText.textContent = spins;

    // 10件順番に演出
    for (const r of json.results) {
      if (r.isNew) {
        // 新規 → 普通に演出＋動画再生
        await playGachaResult(r, true);
      } else {
        // 重複 → サムネ表示のみ（スキップ）
        await playDuplicateThumb(r.video_path, r.rarity);
      }
    }

    await loadCollection();

  } catch (e) {
    console.error(e);
    showError("10連通信エラー");
  }
});

/* ==========================================================
    新規動画 → ガチャ演出 → 再生
========================================================== */
async function playGachaResult(prize, animate = true) {
  gachaVideo.pause();
  gachaVideo.style.display = "none";

  if (animate) {
    gachaImage.classList.add("gacha-anim");
    await wait(800);
    gachaImage.classList.remove("gacha-anim");
  }

  // 動画を同じ領域で再生
  gachaImage.style.display = "none";
  gachaVideo.style.display = "block";
  gachaVideo.src = "/uploads/" + prize.video_path;
  gachaVideo.play();

  await new Promise(res => {
    gachaVideo.onended = () => {
      gachaVideo.style.display = "none";
      gachaImage.style.display = "block";
      res();
    };
  });
}

/* ==========================================================
    重複 → サムネを一瞬出すだけの演出
========================================================== */
async function playDuplicateThumb(videoPath, rarity) {
  gachaVideo.pause();
  gachaVideo.style.display = "none";

  // 一瞬サムネ差し替え
  gachaImage.src = "/uploads/" + videoPath;
  gachaImage.classList.add("duplicate-flash");

  await wait(600);

  gachaImage.classList.remove("duplicate-flash");
  gachaImage.src = "./img/gachapon.png"; // 初期のガチャ画像に戻す
}

/* ---------------------------------------------
    待機用
--------------------------------------------- */
function wait(ms) {
  return new Promise(res => setTimeout(res, ms));
}
