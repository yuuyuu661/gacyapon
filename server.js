import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import fileUpload from "express-fileupload";

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static("public"));

/* ===========================================
   データ保存ファイル
=========================================== */
const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const SPIN_FILE = DATA_DIR + "/spins.json";
const PRIZE_FILE = DATA_DIR + "/prizes.json";
const SERIAL_FILE = DATA_DIR + "/serials.json";
const COLLECTION_FILE = DATA_DIR + "/collection.json";
const PROBABILITY_FILE = DATA_DIR + "/probability.json";

/* ===========================================
   データ初期化
=========================================== */
function loadJSON(file, def) {
  if (!fs.existsSync(file)) return def;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return def;
  }
}

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// 初期値
let spins = loadJSON(SPIN_FILE, { spins: 0 });
let prizes = loadJSON(PRIZE_FILE, []); // { id, rarity, videoPath, thumbnail }
let serials = loadJSON(SERIAL_FILE, []); // { code, used:false, usedAt:null }
let collection = loadJSON(COLLECTION_FILE, []); // { id, video, thumbnail }
let probability = loadJSON(PROBABILITY_FILE, {
  superrare: 2,
  rare: 20,
  common: 50,
  normal: 28,
});

/* ===========================================
   スピン数
=========================================== */
app.get("/api/spins", (req, res) => {
  res.json(spins);
});

/* ===========================================
   シリアルコード → 回数付与
=========================================== */
app.post("/api/redeem-serial", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "コードが空です" });

  // 同じ文字列でも毎回新規発行扱いにする
  // → 「serials」内で “未使用のもの” を探す
  const serial = serials.find(s => s.code === code && !s.used);

  if (!serial) {
    // 新規作成扱いとして登録
    const newSerial = {
      code,
      used: false,
      usedAt: null,
      spins: 1, // 回数1付与
    };
    serials.push(newSerial);
    saveJSON(SERIAL_FILE, serials);

    // 回数追加
    spins.spins += 1;
    saveJSON(SPIN_FILE, spins);

    return res.json({ ok: true });
  }

  // 未使用なら使う
  serial.used = true;
  serial.usedAt = Date.now();
  saveJSON(SERIAL_FILE, serials);

  spins.spins += 1;
  saveJSON(SPIN_FILE, spins);

  res.json({ ok: true });
});

/* ===========================================
   景品登録（動画アップロード）
=========================================== */
app.post("/api/admin/prizes", (req, res) => {
  if (!req.files?.file) {
    return res.status(400).json({ error: "動画がありません" });
  }

  const file = req.files.file;
  const rarity = req.body.rarity;

  if (!rarity) return res.status(400).json({ error: "レア度が必要です" });

  const id = Date.now().toString();
  const ext = path.extname(file.name);
  const savePath = `public/prizes/${id}${ext}`;

  file.mv(savePath, err => {
    if (err) return res.status(500).json({ error: "保存失敗" });

    const thumbPath = `public/prizes/${id}.jpg`;

    // 1フレーム目をサムネにする簡略版
    // Railway で ffmpeg 不要
    const thumbnail = "/prizes/" + id + ".jpg";
    fs.copyFileSync(savePath, thumbPath); // ※簡易サムネ（動画と同名jpg）

    prizes.push({
      id,
      rarity,
      video: "/prizes/" + id + ext,
      thumbnail,
    });

    saveJSON(PRIZE_FILE, prizes);

    res.json({ ok: true });
  });
});

/* ===========================================
   登録済み景品一覧
=========================================== */
app.get("/api/admin/prizes", (req, res) => {
  res.json(prizes);
});

/* ===========================================
   レア度確率の保存
=========================================== */
app.post("/api/admin/probability", (req, res) => {
  probability = req.body;
  saveJSON(PROBABILITY_FILE, probability);
  res.json({ ok: true });
});

/* ===========================================
   マイコレ（重複なし）
=========================================== */
app.get("/api/collection", (req, res) => {
  res.json(collection);
});

/* ===========================================
   コンプリート残数
=========================================== */
app.get("/api/remain", (req, res) => {
  const remain = prizes.length - collection.length;
  res.json({ remain });
});

/* ===========================================
   ガチャ（spin）
=========================================== */
app.post("/api/spin", (req, res) => {
  if (spins.spins <= 0) {
    return res.status(400).json({ error: "回数がありません" });
  }

  spins.spins -= 1;
  saveJSON(SPIN_FILE, spins);

  // レア度抽選
  const r = Math.random() * 100;
  let rarity;

  if (r < probability.superrare) rarity = "superrare";
  else if (r < probability.superrare + probability.rare) rarity = "rare";
  else if (r < probability.superrare + probability.rare + probability.common)
    rarity = "common";
  else rarity = "normal";

  // 該当レア度の景品
  const list = prizes.filter(p => p.rarity === rarity);
  if (list.length === 0) {
    return res.status(200).json({
      rarity,
      effect: `/effects/video/${rarity}.mp4`,
      isNew: false,
      thumbnail: "",
      video: "",
    });
  }

  const prize = list[Math.floor(Math.random() * list.length)];

  // マイコレ追加（重複なし）
  let isNew = false;
  if (!collection.find(c => c.id === prize.id)) {
    collection.push({
      id: prize.id,
      video: prize.video,
      thumbnail: prize.thumbnail,
    });
    saveJSON(COLLECTION_FILE, collection);
    isNew = true;
  }

  res.json({
    rarity,
    effect: `/effects/video/${rarity}.mp4`,
    isNew,
    thumbnail: prize.thumbnail,
    video: prize.video,
  });
});

/* ===========================================
   サーバー起動
=========================================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server started on " + PORT));
