// ====================
// 定数
// ====================
const USER = "default_user";

// DOM取得
const spinsDisplay = document.getElementById("spinsDisplay");

const spinBtn = document.getElementById("spinButton");
const spin10Btn = document.getElementById("spin10Button");

const serialInput = document.getElementById("serialInput");

const videoArea = document.getElementById("videoArea");

// マイコレ用行
const rowSuper = document.getElementById("row-superrare");
const rowRare = document.getElementById("row-rare");
const rowCommon = document.getElementById("row-common");
const rowNormal = document.getElementById("row-normal");

// 効果音
const SE = {
  superrare: new Audio("effects/audio/superrare.mp3"),
  rare: new Audio("effects/audio/rare.mp3"),
  common: new Audio("effects/audio/common.mp3"),
  normal: new Audio("effects/audio/normal.mp3"),
};

// ====================
// 初期
// ====================
loadSpins();
loadCollection();

// ====================
// タブ切り替え（index.html に合わせた修正版）
// ====================
document.querySelectorAll(".tab-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const tab = btn.dataset.tab;

    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));
    document.getElementById(tab).classList.add("active");

    if (tab === "collection") loadCollection();
  });
});

// ====================
// 残り回数
// ====================
async function loadSpins() {
  const res = await fetch(`/api/spins?user=${USER}`);
  const data = await res.json();
  spinsDisplay.textContent = data.spins;
}

// ====================
// シリアル追加
// ====================
async function redeemSerial() {
  const code = serialInput.value.trim();
  if (!code) return alert("コードを入力してね");

  const res = await fetch("/api/redeem-serial", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ user: USER, code })
  });

  const data = await res.json();

  if (!res.ok) return alert(data.error);

  serialInput.value = "";
  loadSpins();
}

// ====================
// ガチャ実行
// ====================
spinBtn.addEventListener("click", () => spin(1));
spin10Btn.addEventListener("click", () => spin(10));

async function spin(times) {
  for (let i = 0; i < times; i++) {
    await spinOnce();
  }
  loadSpins();
  loadCollection();
}

async function spinOnce() {
  const res = await fetch("/api/spin", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ user: USER })
  });

  const data = await res.json();
  if (!res.ok) {
    alert(data.error);
    return;
  }

  const p = data.prize;

  // 表示クリア
  videoArea.innerHTML = "";

  // ▼① 演出動画
  const effect = document.createElement("video");
  effect.src = `effects/video/${p.rarity}.mp4`;
  effect.autoplay = true;
  effect.className = "thumb-video-large";
  videoArea.appendChild(effect);

  // 効果音 1秒後
  setTimeout(() => {
    SE[p.rarity]?.play();
  }, 1000);

  await waitForEnd(effect);

  videoArea.innerHTML = "";

  // ▼② 新規 → 景品動画再生
  if (!p.duplicate) {
    const vid = document.createElement("video");
    vid.src = p.video;
    vid.autoplay = true;
    vid.controls = true;
    vid.className = "thumb-video-large";
    videoArea.appendChild(vid);

    await waitForEnd(vid);
    videoArea.innerHTML = "";
  }

  // ▼③ 被り → サムネ2秒
  else {
    const img = document.createElement("img");
    img.src = p.thumbnail;
    img.className = "thumb-video-large";
    videoArea.appendChild(img);

    await wait(2000);
    videoArea.innerHTML = "";
  }
}

function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}
function waitForEnd(video) {
  return new Promise(r => video.addEventListener("ended", r));
}

// ====================
// マイコレ表示（レア度別スライド対応版）
// ====================
async function loadCollection() {
  const res = await fetch(`/api/collection?user=${USER}`);
  const list = await res.json();

  // 初期化
  rowSuper.innerHTML = "";
  rowRare.innerHTML = "";
  rowCommon.innerHTML = "";
  rowNormal.innerHTML = "";

  list.forEach(p => {
    const v = document.createElement("video");
    v.src = p.video;
    v.className = "thumb-video";
    v.muted = true;

    v.onclick = () => {
      videoArea.innerHTML = "";
      const pv = document.createElement("video");
      pv.src = p.video;
      pv.className = "thumb-video-large";
      pv.autoplay = true;
      pv.controls = true;
      videoArea.appendChild(pv);
    };

    if (p.rarity === "superrare") rowSuper.appendChild(v);
    if (p.rarity === "rare") rowRare.appendChild(v);
    if (p.rarity === "common") rowCommon.appendChild(v);
    if (p.rarity === "normal") rowNormal.appendChild(v);
  });
}
