import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
app.use(express.json());
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

/* =========================================================
   SQLite 初期化
   ========================================================= */
let db;
async function initDB() {
  db = await open({
    filename: "./data.db",
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS devices(
      deviceId TEXT PRIMARY KEY,
      spins INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS serials(
      code TEXT PRIMARY KEY,
      spins INTEGER,
      used INTEGER DEFAULT 0,
      used_by_device TEXT,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS prizes(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rarity TEXT,
      video_path TEXT,
      enabled INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS collections(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deviceId TEXT,
      video_path TEXT,
      rarity TEXT,
      obtained_at TEXT
    );

    CREATE TABLE IF NOT EXISTS rarity_weights(
      id INTEGER PRIMARY KEY CHECK (id = 1),
      normal INTEGER DEFAULT 50,
      common INTEGER DEFAULT 30,
      rare INTEGER DEFAULT 15,
      superrare INTEGER DEFAULT 5
    );
  `);

  const chk = await db.get("SELECT COUNT(*) AS c FROM rarity_weights");
  if (chk.c === 0) {
    await db.run(`
      INSERT INTO rarity_weights(id, normal, common, rare, superrare)
      VALUES(1, 50, 30, 15, 5)
    `);
  }
}
await initDB();

/* =========================================================
   認証（簡易版）
   ========================================================= */
const ADMIN_PASSWORD = "yuu";

function auth(req, res, next) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (token !== "OK") {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  next();
}

/* =========================================================
   管理ログイン
   ========================================================= */
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    return res.json({ token: "OK" });
  }
  return res.status(403).json({ ok: false, error: "パスワード不正" });
});

/* =========================================================
   デバイス情報取得
   ========================================================= */
app.get("/api/device", async (req, res) => {
  const { deviceId } = req.query;
  let d = await db.get("SELECT * FROM devices WHERE deviceId = ?", deviceId);

  if (!d) {
    await db.run("INSERT INTO devices(deviceId, spins) VALUES(?,0)", deviceId);
    d = { deviceId, spins: 0 };
  }
  res.json(d);
});

/* =========================================================
   シリアル使用
   ========================================================= */
app.post("/api/redeem-serial", async (req, res) => {
  const { code, deviceId } = req.body;

  const row = await db.get("SELECT * FROM serials WHERE code=?", code);
  if (!row) return res.json({ ok: false, error: "シリアルが存在しません" });
  if (row.used) return res.json({ ok: false, error: "使用済みです" });

  await db.run(
    "UPDATE serials SET used=1, used_by_device=?, used_at=datetime('now','localtime') WHERE code=?",
    deviceId, code
  );

  await db.run(
    "UPDATE devices SET spins = spins + ? WHERE deviceId=?",
    row.spins, deviceId
  );

  res.json({ ok: true });
});

/* =========================================================
   レアリティ抽選
   ========================================================= */
async function getRarity() {
  const w = await db.get("SELECT * FROM rarity_weights WHERE id=1");

  const list = [
    { r: "normal", w: w.normal },
    { r: "common", w: w.common },
    { r: "rare", w: w.rare },
    { r: "superrare", w: w.superrare }
  ];

  const total = list.reduce((a, b) => a + b.w, 0);
  let rnd = Math.random() * total;

  for (const x of list) {
    if (rnd < x.w) return x.r;
    rnd -= x.w;
  }
  return "normal";
}

/* =========================================================
   1回スピン
   ========================================================= */
app.post("/api/spin", async (req, res) => {
  const { deviceId } = req.body;

  const dev = await db.get("SELECT spins FROM devices WHERE deviceId=?", deviceId);
  if (!dev || dev.spins <= 0) {
    return res.json({ ok: false, error: "回数が足りません" });
  }

  // 消費
  await db.run("UPDATE devices SET spins = spins - 1 WHERE deviceId=?", deviceId);

  const rarity = await getRarity();
  const prize = await db.get(
    "SELECT * FROM prizes WHERE rarity=? AND enabled=1 ORDER BY RANDOM() LIMIT 1",
    rarity
  );

  if (!prize) {
    return res.json({ ok: false, error: "景品がありません" });
  }

  // コレクションに追加
  await db.run(
    `INSERT INTO collections(deviceId, video_path, rarity, obtained_at)
     VALUES(?,?,?,datetime('now','localtime'))`,
    deviceId, prize.video_path, rarity
  );

  res.json({
    ok: true,
    prize: {
      id: prize.id,
      rarity,
      video_url: "/uploads/" + prize.video_path,
      file: prize.video_path
    }
  });
});

/* =========================================================
   マイコレクション一覧
   ========================================================= */
app.get("/api/my-collection", async (req, res) => {
  const { deviceId } = req.query;
  const rows = await db.all(
    `SELECT video_path, rarity, obtained_at,
       (SELECT COUNT(*) FROM collections c2 WHERE c2.video_path = c1.video_path AND c2.deviceId = c1.deviceId) AS owned_count
     FROM collections c1
     WHERE deviceId=?
     ORDER BY obtained_at DESC`,
    deviceId
  );
  res.json(rows);
});

/* =========================================================
   管理：シリアル一覧
   ========================================================= */
app.get("/api/admin/serials", auth, async (req, res) => {
  const rows = await db.all("SELECT * FROM serials ORDER BY used_at DESC");
  res.json(rows);
});

app.post("/api/admin/serials/issue", auth, async (req, res) => {
  let { code, spins } = req.body;
  if (!code) code = Math.random().toString(36).slice(2, 10);

  await db.run("INSERT INTO serials(code, spins, used) VALUES(?,?,0)", code, spins);
  res.json({ ok: true, code, spins });
});

/* =========================================================
   景品（動画）アップロード
   ========================================================= */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "_" + Math.random().toString(36).slice(2) + ext);
  }
});
const upload = multer({ storage });

app.post("/api/admin/prizes/create", auth, upload.single("video"), async (req, res) => {
  const rarity = req.body.rarity;
  const file = req.file.filename;

  await db.run("INSERT INTO prizes(rarity, video_path, enabled) VALUES(?,?,1)", rarity, file);
  res.json({ ok: true });
});

app.get("/api/admin/prizes", auth, async (req, res) => {
  const rows = await db.all("SELECT * FROM prizes ORDER BY id DESC");
  res.json(rows);
});

app.post("/api/admin/prizes/update", auth, upload.single("video"), async (req, res) => {
  const { id, rarity, enabled } = req.body;

  if (req.file) {
    const f = req.file.filename;
    await db.run(
      "UPDATE prizes SET rarity=?, enabled=?, video_path=? WHERE id=?",
      rarity, enabled, f, id
    );
  } else {
    await db.run(
      "UPDATE prizes SET rarity=?, enabled=? WHERE id=?",
      rarity, enabled, id
    );
  }

  res.json({ ok: true });
});

app.post("/api/admin/prizes/delete", auth, async (req, res) => {
  await db.run("DELETE FROM prizes WHERE id=?", req.body.id);
  res.json({ ok: true });
});

/* =========================================================
   ★ 軽量版：景品リスト all-lite（video_path & enabled だけ）
   ========================================================= */
app.get("/api/admin/prizes/all-lite", auth, async (req, res) => {
  const rows = await db.all("SELECT video_path, enabled FROM prizes");
  res.json(rows);
});

/* =========================================================
   ★ 特別景品（ボーナス動画）
   ========================================================= */
app.get("/api/bonus-video", async (req, res) => {
  const bonus = await db.get("SELECT video_path FROM prizes WHERE rarity='bonus' LIMIT 1");

  if (!bonus) return res.json({ ok: false, error: "bonus動画がありません" });

  res.json({
    ok: true,
    url: "/uploads/" + bonus.video_path
  });
});

/* =========================================================
   レアリティ確率 読込・保存
   ========================================================= */
app.get("/api/admin/rarity-weights", auth, async (req, res) => {
  const d = await db.get("SELECT * FROM rarity_weights WHERE id=1");
  res.json({ ok: true, data: d });
});

app.post("/api/admin/rarity-weights/update", auth, async (req, res) => {
  const { normal, common, rare, superrare } = req.body;

  await db.run(
    "UPDATE rarity_weights SET normal=?, common=?, rare=?, superrare=? WHERE id=1",
    normal, common, rare, superrare
  );

  res.json({ ok: true });
});

/* =========================================================
   サーバー起動
   ========================================================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
