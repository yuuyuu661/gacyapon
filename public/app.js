// =============================
// 定数
// =============================
const API_BASE = ""; // 同じオリジンなら空でOK

// 要素取得
const spinCountEl = document.getElementById("spinCount");
const completeTextEl = document.getElementById("completeText");
const addSpinBtn = document.getElementById("addSpinBtn");
const serialInput = document.getElementById("serialInput");

const spinBtn = document.getElementById("spinBtn");
const spin10Btn = document.getElementById("spin10Btn");

const effectVideo = document.getElementById("effectVideo");
const prizeVideo = document.getElementById("prizeVideo");
const duplicateThumb = document.getElementById("duplicateThumb");
const videoOverlay = document.getElementById("videoOverlay");

// マイコレ
const collectionContainer = document.getElementById("collectionContainer");
const viewOverlay = document.getElementById("viewOverlay");
const viewVideo = document.getElementById("viewVideo");
const closeViewBtn = document.getElementById("closeViewBtn");

// 管理
const adminPassBtn = document.getElementById("adminPassBtn");
const adminPassInput = document.getElementById("adminPassInput");
const adminContent = document.getElementById("adminContent");

const uploadPrizeBtn = document.getElementById("uploadPrizeBtn");
const prizeFile = document.getElementById("prizeFile");
const prizeRarity = document.getElementById("prizeRarity");
const prizeList = document.getElementById("prizeList");

const probSuper = document.getElementById("probSuper");
const probRare = document.getElementById("probRare");
const probCommon = document.getElementById("probCommon");
const probNormal = document.getElementById("probNormal");
const saveProbabilityBtn = document.getElementById("saveProbabilityBtn");

// 効果音
const seMap = {
  superrare: new Audio("effects/audio/superrare.mp3"),
  rare: new Audio("effects/audio/rare.mp3"),
  common: new Audio("effects/audio/common.mp3"),
  normal: new Audio("effects/audio/normal.mp3"),
};

// =============================
// 共通関数
// =============================

// スピン数読み込み
async function loadSpins() {
  try {
    const res = await fetch(`${API_BASE}/api/spins`);
    const data = await res.json();
    spinCountEl.textContent = `残り回数：${data.spins}`;
  } catch (e) {
    console.error("loadSpins error:", e);
  }
}

// マイコレ計算 & 表示
async function loadMyCollection() {
  try {
    const res = await fetch(`${API_BASE}/api/collection`);
    const data = await res.json();

    collectionContainer.innerHTML = "";

    data.forEach(item => {
      const wrap = document.createElement("div");
      wrap.className = "collection-item";

      const thumb = document.createElement("img");
      thumb.src = item.thumbnail;
      thumb.className = "collection-thumb";
      thumb.style.cursor = "pointer";

      thumb.addEventListener("click", () => {
        viewVideo.src = item.video;
        viewOverlay.style.display = "flex";
        viewVideo.play();
      });

      wrap.appendChild(thumb);
      collectionContainer.appendChild(wrap);
    });
  } catch (e) {
    console.error("loadMyCollection error:", e);
  }
}

closeViewBtn.addEventListener("click", () => {
  viewVideo.pause();
  viewOverlay.style.display = "none";
});

// 残り種類（コンプリート演出）更新
async function updateRemain() {
  try {
    const res = await fetch(`${API_BASE}/api/remain`);
    const data = await res.json();

    if (data.remain === 0) {
      completeTextEl.style.color = "#DAA520";
      completeTextEl.innerHTML = `✨✨ コンプリートおめでとう！！ ✨✨<br>✨ 受付の人に言って特別景品を貰おう！！！ ✨`;
    } else {
      completeTextEl.style.color = data.remain <= 10 ? "red" : "black";
      completeTextEl.textContent = `コンプリートまで残り ${data.remain} 種類！`;
    }
  } catch (e) {
    console.error("updateRemain error:", e);
  }
}
// =============================
// タブ切り替え
// =============================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    // 全タブ非表示
    document.querySelectorAll(".tab-page").forEach(p => p.style.display = "none");

    // 対象のみ表示
    document.getElementById(tab).style.display = "block";

    // マイコレ開いたときは再読み込み
    if (tab === "mycollection") {
      loadMyCollection();
    }
  });
});
// =============================
// シリアル → 回数追加
// =============================
addSpinBtn.addEventListener("click", async () => {
  const code = serialInput.value.trim();
  if (!code) return alert("シリアルコードを入力してね！");

  try {
    const res = await fetch(`${API_BASE}/api/redeem-serial`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error || "追加できませんでした");

    alert("回数を追加しました！");
    serialInput.value = "";
    loadSpins();
  } catch (e) {
    alert("通信エラー");
  }
});

// =============================
// ★ 演出 → 1秒後SE → 景品動画 → マイコレ反映
// =============================
async function playGacha(isTen = false) {
  const count = isTen ? 10 : 1;

  for (let i = 0; i < count; i++) {
    const result = await spinOnce();
    if (!result) return;
  }

  loadSpins();
  updateRemain();
  loadMyCollection();
}

spinBtn.addEventListener("click", () => playGacha(false));
spin10Btn.addEventListener("click", () => playGacha(true));

// =============================
// ★ 1回分のガチャ処理
// =============================
async function spinOnce() {
  try {
    const res = await fetch(`${API_BASE}/api/spin`, { method: "POST" });
    const data = await res.json();

    if (!res.ok) {
      alert(data.error || "回せません");
      return null;
    }

    const { rarity, effect, isNew, thumbnail, video } = data;

    // まず演出動画を再生
    prizeVideo.style.display = "none";
    duplicateThumb.style.display = "none";

    effectVideo.src = effect;
    effectVideo.style.display = "block";
    effectVideo.play();

    // → 1秒後に効果音
    setTimeout(() => {
      seMap[rarity]?.play().catch(() => {});
    }, 1000);

    // 演出終了を待つ
    await new Promise(resolve => {
      effectVideo.onended = resolve;
    });

    // 新規 → 景品動画再生
    if (isNew) {
      effectVideo.style.display = "none";
      prizeVideo.src = video;
      prizeVideo.style.display = "block";
      prizeVideo.play();

      await new Promise(resolve => {
        prizeVideo.onended = resolve;
      });

      prizeVideo.style.display = "none";
    }

    // 被り → 2秒だけサムネ表示
    else {
      effectVideo.style.display = "none";

      duplicateThumb.src = thumbnail;
      duplicateThumb.style.display = "block";

      await new Promise(resolve => setTimeout(resolve, 2000));

      duplicateThumb.style.display = "none";
    }

    return true;
  } catch (e) {
    console.error("spinOnce error", e);
    return null;
  }
}

// =============================
// 管理パスワード
// =============================
adminPassBtn.addEventListener("click", () => {
  if (adminPassInput.value === "admin123") {
    adminContent.style.display = "block";
  } else {
    alert("パスワードが違います");
  }
});

// =============================
// 景品登録
// =============================
uploadPrizeBtn.addEventListener("click", async () => {
  if (!prizeFile.files[0]) return alert("動画を選んでください");

  const fd = new FormData();
  fd.append("file", prizeFile.files[0]);
  fd.append("rarity", prizeRarity.value);

  try {
    const res = await fetch(`${API_BASE}/api/admin/prizes`, {
      method: "POST",
      body: fd,
    });
    const data = await res.json();

    if (!res.ok) return alert(data.error || "登録できませんでした");

    alert("登録しました！");
    loadPrizeList();
  } catch (e) {
    console.error("upload error", e);
  }
});

// 登録済み景品一覧
async function loadPrizeList() {
  prizeList.innerHTML = "";
  const res = await fetch(`${API_BASE}/api/admin/prizes`);
  const data = await res.json();

  data.forEach(p => {
    const img = document.createElement("img");
    img.src = p.thumbnail;
    prizeList.appendChild(img);
  });
}

// =============================
// レア度確率
// =============================
saveProbabilityBtn.addEventListener("click", async () => {
  try {
    const body = {
      superrare: Number(probSuper.value),
      rare: Number(probRare.value),
      common: Number(probCommon.value),
      normal: Number(probNormal.value),
    };

    const res = await fetch(`${API_BASE}/api/admin/probability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();
    if (!res.ok) return alert(data.error || "保存失敗");

    alert("保存しました！");
  } catch (e) {
    console.error(e);
  }
});

// =============================
// 初期ロード
// =============================
loadSpins();
updateRemain();
loadMyCollection();
loadPrizeList();
