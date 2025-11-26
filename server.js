/* ==========================================================
    ガチャポン v7.1
    - レア度演出動画 → 景品動画 再生
    - 10連（新規：演出→景品 / 重複：演出→サムネ）
    - シリアル発行機能（5件スクロール）
    - マイコレ4段（superrare / rare / common / normal）
    - 景品登録（動画 & レア度のみ）
========================================================== */

import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '30mb' }));
app.use(cors());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin";
const JWT_SECRET = process.env.JWT_SECRET || "secret";

/* ==========================================================
    DB セットアップ
========================================================== */
const db = new Database(path.join(__dirname, "data.sqlite"));
db.pragma("journal_mode = WAL");

/* ---- DB テーブル ---- */
db.exec(`
CREATE TABLE IF NOT EXISTS rarity_rates(
  rarity TEXT PRIMARY KEY,
  rate INTEGER
);
INSERT OR IGNORE INTO rarity_rates(rarity, rate) VALUES
('superrare', 2),
('rare', 20),
('common', 50),
('normal', 28);

CREATE TABLE IF NOT EXISTS devices(
  device_id TEXT PRIMARY KEY,
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
  video_path TEXT,
  rarity TEXT,
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS collections(
  device_id TEXT,
  prize_id INTEGER,
  obtained_at TEXT DEFAULT (datetime('now')),
  UNIQUE(device_id, prize_id)
);
`);

/* ==========================================================
    アップロード設定（動画）
========================================================== */
const effectsDir = path.join(__dirname, "public/effects");
const uploadsDir = path.join(__dirname, "public/uploads");

[effectsDir, uploadsDir].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) =>
    cb(null, "p_" + Date.now() + "_" + Math.random().toString(36).slice(2) + "." + file.originalname.split(".").pop())
});
const upload = multer({ storage });

/* ==========================================================
    静的ファイル
========================================================== */
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(uploadsDir));
app.use("/effects", express.static(effectsDir));

/* ==========================================================
    共通ユーティリティ
========================================================== */
function signToken(data) {
  return jwt.sign(data, JWT_SECRET, { expiresIn: "2h" });
}

function auth(req, res, next) {
  try {
    const raw = req.headers.authorization || "";
    const token = raw.replace("Bearer ", "");
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "auth failed" });
  }
}

/* ----------------------------------------------------------
    レア度抽選
----------------------------------------------------------- */
function pickRarity() {
  const rates = db.prepare("SELECT * FROM rarity_rates").all();
  const total = rates.reduce((a, b) => a + b.rate, 0);

  let r = Math.random() * total;
  for (const row of rates) {
    r -= row.rate;
    if (r <= 0) return row.rarity;
  }
  return "normal";
}

/* ----------------------------------------------------------
    レア度ごとの景品からランダムで選ぶ
----------------------------------------------------------- */
function pickPrize(rarity) {
  const list = db.prepare("SELECT * FROM prizes WHERE rarity=? AND enabled=1").all(rarity);
  if (list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

/* ==========================================================
    ▼ 管理ログイン
========================================================== */
app.post("/api/admin/login", (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: "wrong password" });

  res.json({ token: signToken({ admin: true }) });
});

/* ==========================================================
    ▼ シリアル発行（v7.1）
========================================================== */
app.post("/api/admin/serials/issue", auth, (req, res) => {
  const spins = Number(req.body.spins);
  if (!spins || spins <= 0) return res.status(400).json({ error: "spins required" });

  const code = Math.random().toString(36).slice(2, 10).toUpperCase();

  db.prepare(`INSERT INTO serials(code, spins, used) VALUES (?, ?, 0)`).run(code, spins);

  res.json({ ok: true, code });
});

/* 直近5件を返す */
app.get("/api/admin/serials/latest", auth, (_, res) => {
  const list = db.prepare("SELECT * FROM serials ORDER BY rowid DESC LIMIT 5").all();
  res.json(list);
});

/* ==========================================================
    ▼ 景品入荷
========================================================== */
app.post("/api/admin/prizes/create", auth, upload.single("video"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "video required" });

  db.prepare("INSERT INTO prizes(video_path, rarity, enabled) VALUES (?, ?, 1)")
    .run(req.file.filename, req.body.rarity);

  res.json({ ok: true });
});

/* 景品一覧 */
app.get("/api/admin/prizes", auth, (_, res) => {
  const list = db.prepare(`
    SELECT *
    FROM prizes
    ORDER BY
      CASE rarity
        WHEN 'superrare' THEN 1
        WHEN 'rare' THEN 2
        WHEN 'common' THEN 3
        WHEN 'normal' THEN 4
      END, id DESC
  `).all();
  res.json(list);
});

/* 景品削除 */
app.post("/api/admin/prizes/delete", auth, (req, res) => {
  db.prepare("DELETE FROM prizes WHERE id=?").run(req.body.id);
  res.json({ ok: true });
});

/* ==========================================================
    ▼ 回数読み込み & シリアル利用
========================================================== */
app.get("/api/device", (req, res) => {
  const id = req.query.deviceId;
  if (!id) return res.status(400).json({ error: "deviceId required" });

  db.prepare("INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?, 0)").run(id);
  const row = db.prepare("SELECT spins FROM devices WHERE device_id=?").get(id);

  res.json({ spins: row?.spins ?? 0 });
});

app.post("/api/redeem-serial", (req, res) => {
  const { code, deviceId } = req.body;
  if (!code || !deviceId) return res.status(400).json({ error: "code & deviceId required" });

  const s = db.prepare("SELECT * FROM serials WHERE code=?").get(code);
  if (!s) return res.status(404).json({ error: "invalid code" });
  if (s.used) return res.status(409).json({ error: "already used" });

  db.prepare("UPDATE serials SET used=1, used_by_device=?, used_at=datetime('now') WHERE code=?")
    .run(deviceId, code);

  db.prepare("UPDATE devices SET spins = spins + ? WHERE device_id=?")
    .run(s.spins, deviceId);

  const dev = db.prepare("SELECT spins FROM devices WHERE device_id=?").get(deviceId);
  res.json({ ok: true, spins: dev.spins });
});

/* ==========================================================
    ▼ 単発ガチャ（演出 → 景品）
========================================================== */
app.post("/api/spin", (req, res) => {
  const id = req.body.deviceId;
  if (!id) return res.status(400).json({ error: "deviceId required" });

  const dev = db.prepare("SELECT * FROM devices WHERE device_id=?").get(id);
  if (!dev || dev.spins <= 0)
    return res.status(402).json({ error: "no spins" });

  db.prepare("UPDATE devices SET spins=spins-1 WHERE device_id=?").run(id);

  const rarity = pickRarity();
  const prize = pickPrize(rarity);
  if (!prize) return res.status(500).json({ error: "no prize" });

  db.prepare("INSERT OR IGNORE INTO collections(device_id, prize_id) VALUES (?, ?)").run(id, prize.id);

  res.json({
    ok: true,
    rarity,
    effect: `/effects/${rarity}.mp4`,
    prize: {
      id: prize.id,
      video_path: prize.video_path,
      url: "/uploads/" + prize.video_path
    }
  });
});

/* ==========================================================
    ▼ 10連ガチャ
========================================================== */
app.post("/api/spin10", (req, res) => {
  const id = req.body.deviceId;

  const dev = db.prepare("SELECT * FROM devices WHERE device_id=?").get(id);
  if (!dev || dev.spins < 10)
    return res.status(402).json({ error: "not enough spins" });

  db.prepare("UPDATE devices SET spins=spins-10 WHERE device_id=?").run(id);

  const results = [];

  for (let i = 0; i < 10; i++) {
    const rarity = pickRarity();
    const prize = pickPrize(rarity);
    if (!prize) {
      results.push({ error: true });
      continue;
    }

    const before = db.prepare(`
      SELECT * FROM collections WHERE device_id=? AND prize_id=?
    `).get(id, prize.id);

    db.prepare("INSERT OR IGNORE INTO collections(device_id, prize_id) VALUES (?, ?)")
      .run(id, prize.id);

    results.push({
      rarity,
      effect: `/effects/${rarity}.mp4`,
      prize: {
        id: prize.id,
        video_path: prize.video_path,
        url: "/uploads/" + prize.video_path
      },
      isNew: !before
    });
  }

  res.json({ ok: true, results });
});

/* ==========================================================
    ▼ マイコレクション（レア度順）
========================================================== */
app.get("/api/my-collection", (req, res) => {
  const id = req.query.deviceId;

  const rows = db.prepare(`
    SELECT p.video_path, p.rarity, MAX(c.obtained_at) AS obtained_at
    FROM collections c
    JOIN prizes p ON p.id = c.prize_id
    WHERE device_id=?
    GROUP BY prize_id
    ORDER BY obtained_at DESC
  `).all(id);

  res.json(rows);
});

/* ==========================================================
    その他
========================================================== */
app.get("*", (_, res) =>
  res.sendFile(path.join(__dirname, "public/index.html"))
);

/* ==========================================================
    起動
========================================================== */
app.listen(PORT, () => {
  console.log("Gachapon v7.1 running on PORT", PORT);
});
