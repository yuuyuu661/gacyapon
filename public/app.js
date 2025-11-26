// ====================
// 定数
// ====================
const API = "";

// 今回は固定ユーザー扱い（v7.6仕様）
const USER = "default_user";

// DOM取得
const spinCount = document.getElementById("spinCount");
const spinBtn = document.getElementById("spinBtn");
const spin10Btn = document.getElementById("spin10Btn");

const serialInput = document.getElementById("serialInput");
const addSpinBtn = document.getElementById("addSpinBtn");

const resultArea = document.getElementById("resultArea");
const effectVideo = document.getElementById("effectVideo");
const prizeVideo = document.getElementById("prizeVideo");
const duplicateImg = document.getElementById("duplicateImg");

const collectionContainer = document.getElementById("collectionContainer");

const adminPassBtn = document.getElementById("adminPassBtn");
const adminPassInput = document.getElementById("adminPassInput");
const adminContent = document.getElementById("adminContent");

const uploadPrizeBtn = document.getElementById("uploadPrizeBtn");
const prizeFile = document.getElementById("prizeFile");
const prizeRarity = document.getElementById("prizeRarity");
const prizeList = document.getElementById("prizeList");

// ====================
// 効果音
// ====================
const SE = {
  superrare: new Audio("effects/audio/superrare.mp3"),
  rare: new Audio("effects/audio/rare.mp3"),
  common: new Audio("effects/audio/common.mp3"),
  normal: new Audio("effects/audio/normal.mp3"),
};

// ====================
// 初期読み込み
// ====================
loadSpins();
loadCollection();
loadPrizeList();

// ====================
// 残り回数取得
// ====================
async function loadSpins() {
  const res = await fetch(`/api/spins?user=${USER}`);
  const data = await res.json();
  spinCount.textContent = `残り回数：${data.spins}`;
}

// ====================
// 回数追加（シリアル）
// ====================
addSpinBtn.addEventListener("click", async () => {
  const code = serialInput.value.trim();
  if (!code) return alert("コードを入力してね");

  // シリアルを登録する（v7.6仕様）
  await fetch(`/api/addSerial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  // 使用する
  const res = await fetch(`/api/useSerial`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: USER, code }),
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  serialInput.value = "";
  loadSpins();
});

// ====================
// ガチャボタン
// ====================
spinBtn.addEventListener("click", () => spin(1));
spin10Btn.addEventListener("click", () => spin(10));

// ====================
// ガチャ本体
// ====================
async function spin(times) {
  for (let i = 0; i < times; i++) {
    await spinOnce();
  }
  loadSpins();
  loadCollection();
}

// ====================
// 1回ガチャ処理
// ====================
async function spinOnce() {
  const res = await fetch(`/api/spin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user: USER }),
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error);
    return;
  }

  const prize = data.prize;

  // 表示エリア初期化
  effectVideo.style.display = "none";
  prizeVideo.style.display = "none";
  duplicateImg.style.display = "none";

  // 演出動画を再生（v7.6は rarity.mp4 のみ）
  effectVideo.src = `effects/video/${prize.rarity}.mp4`;
  effectVideo.style.display = "block";
  effectVideo.play();

  // 効果音は 1秒遅らせて再生
  setTimeout(() => {
    SE[prize.rarity]?.play();
  }, 1000);

  // 演出終了待ち
  await new Promise(resolve => {
    effectVideo.onended = resolve;
  });
  effectVideo.style.display = "none";

  // 新規動画
  if (!isDuplicate(prize.id)) {
    prizeVideo.src = prize.video;
    prizeVideo.style.display = "block";
    prizeVideo.play();
    await new Promise(resolve => (prizeVideo.onended = resolve));
    prizeVideo.style.display = "none";
  }

  // 被り → サムネ2秒表示
  else {
    duplicateImg.src = prize.thumbnail;
    duplicateImg.style.display = "block";
    await wait(2000);
    duplicateImg.style.display = "none";
  }
}

// 被りチェック
function isDuplicate(id) {
  const imgs = document.querySelectorAll(".collection-thumb");
  return [...imgs].some(img => img.dataset.id == id);
}

// 待機関数
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ====================
// マイコレ読み込み
// ====================
async function loadCollection() {
  const res = await fetch(`/api/collection?user=${USER}`);
  const data = await res.json();

  collectionContainer.innerHTML = "";
  data.forEach(p => {
    const wrap = document.createElement("div");
    wrap.className = "collection-item";

    const img = document.createElement("img");
    img.src = p.thumbnail;
    img.dataset.id = p.id;
    img.className = "collection-thumb";
    img.style.cursor = "pointer";

    img.addEventListener("click", () => {
      prizeVideo.src = p.video;
      prizeVideo.style.display = "block";
      prizeVideo.play();
      prizeVideo.onended = () => {
        prizeVideo.style.display = "none";
      };
    });

    wrap.appendChild(img);
    collectionContainer.appendChild(wrap);
  });
}

// ====================
// 管理パスワード
// ====================
adminPassBtn.addEventListener("click", () => {
  if (adminPassInput.value === "admin123") {
    adminContent.style.display = "block";
  } else {
    alert("パスワードが違います");
  }
});

// ====================
// 景品登録
// ====================
uploadPrizeBtn.addEventListener("click", async () => {
  const file = prizeFile.files[0];
  if (!file) return alert("動画を選んでね");

  const fd = new FormData();
  fd.append("video", file);
  fd.append("rarity", prizeRarity.value);

  const res = await fetch(`/api/admin/prizes`, {
    method: "POST",
    body: fd,
  });

  const data = await res.json();
  if (!res.ok) return alert(data.error);

  loadPrizeList();
});

// 景品一覧
async function loadPrizeList() {
  const res = await fetch(`/api/admin/prizes`);
  const data = await res.json();

  prizeList.innerHTML = "";
  data.forEach(p => {
    const img = document.createElement("img");
    img.src = p.thumbnail;
    img.className = "prize-thumb";
    prizeList.appendChild(img);
  });
}

// ====================
// タブ切替（v7.6仕様）
// ====================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    document.querySelectorAll(".tab-page").forEach(p => (p.style.display = "none"));
    document.getElementById(tab).style.display = "block";

    if (tab === "mycollection") loadCollection();
  });
});
