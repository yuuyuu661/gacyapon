import 'dotenv/config';
import express from 'express';
import path from 'path';
import cors from 'cors';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import multer from 'multer';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());
app.use(morgan('dev'));

const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

/* --------------------------------------------
   DB SETUP
-------------------------------------------- */
const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

/* レア度をまとめ管理するテーブルを追加 */
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
  rarity TEXT DEFAULT 'normal',
  enabled INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS collections(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT,
  prize_id INTEGER,
  obtained_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_col_unique ON collections(device_id, prize_id);
`);

/* --------------------------------------------
   画像・動画アップロード系
-------------------------------------------- */
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) =>
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + (file.originalname.split('.').pop() || 'mp4'))
});
const upload = multer({ storage });

/* --------------------------------------------
   STATIC
-------------------------------------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

function signToken(p) {
  return jwt.sign(p, JWT_SECRET, { expiresIn: '2h' });
}
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error: 'no token' });
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch (e) {
    res.status(401).json({ error: 'invalid token' });
  }
}

/* --------------------------------------------
   レア度抽選
-------------------------------------------- */
function pickRarity() {
  const rows = db.prepare(`SELECT rarity, rate FROM rarity_rates`).all();
  const total = rows.reduce((a, b) => a + b.rate, 0);

  let r = Math.random() * total;
  for (const row of rows) {
    r -= row.rate;
    if (r <= 0) return row.rarity;
  }
  return rows[rows.length - 1].rarity; // fallback
}

/* ランダムで動画を選ぶ */
function pickPrizeByRarity(rarity) {
  const rows = db.prepare(`SELECT * FROM prizes WHERE rarity=? AND enabled=1`).all(rarity);
  if (rows.length === 0) return null;
  return rows[Math.floor(Math.random() * rows.length)];
}

/* --------------------------------------------
   ADMIN API
-------------------------------------------- */
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'wrong password' });
  res.json({ token: signToken({ role: 'admin' }) });
});

/* レア度確率の取得 */
app.get('/api/admin/rarity-rates', auth, (_, res) => {
  const rows = db.prepare(`SELECT * FROM rarity_rates`).all();
  res.json(rows);
});

/* レア度確率の更新 */
app.post('/api/admin/rarity-rates/update', auth, (req, res) => {
  const { superrare, rare, common, normal } = req.body;
  const upd = db.prepare(`UPDATE rarity_rates SET rate=? WHERE rarity=?`);
  upd.run(superrare, 'superrare');
  upd.run(rare, 'rare');
  upd.run(common, 'common');
  upd.run(normal, 'normal');
  res.json({ ok: true });
});

/* 景品一覧 */
app.get('/api/admin/prizes', auth, (_, res) => {
  const rows = db.prepare(`SELECT * FROM prizes ORDER BY
    CASE rarity
      WHEN 'superrare' THEN 1
      WHEN 'rare' THEN 2
      WHEN 'common' THEN 3
      WHEN 'normal' THEN 4
    END,
    id DESC
  `).all();
  res.json(rows);
});

/* 景品登録（タイトルなし） */
app.post('/api/admin/prizes/create', auth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'video required' });
  const { rarity } = req.body;
  db.prepare(`INSERT INTO prizes(video_path, rarity, enabled) VALUES (?,?,1)`)
    .run(req.file.filename, rarity);
  res.json({ ok: true });
});

/* 景品更新（動画差し替え + レア度変更 + 有効/無効） */
app.post('/api/admin/prizes/update', auth, upload.single('video'), (req, res) => {
  const { id, rarity = 'normal', enabled = 1 } = req.body;
  const row = db.prepare(`SELECT * FROM prizes WHERE id=?`).get(id);
  if (!row) return res.status(404).json({ error: 'not found' });

  let video_path = row.video_path;
  if (req.file) {
    try {
      const old = path.join(uploadsDir, row.video_path);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    } catch {}
    video_path = req.file.filename;
  }

  db.prepare(`UPDATE prizes SET video_path=?, rarity=?, enabled=? WHERE id=?`)
    .run(video_path, rarity, enabled ? 1 : 0, id);

  res.json({ ok: true });
});

/* 景品削除 */
app.post('/api/admin/prizes/delete', auth, (req, res) => {
  const { id } = req.body;
  const row = db.prepare(`SELECT * FROM prizes WHERE id=?`).get(id);
  if (!row) return res.status(404).json({ error: 'not found' });

  try {
    const file = path.join(uploadsDir, row.video_path);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}

  db.prepare(`DELETE FROM prizes WHERE id=?`).run(id);
  res.json({ ok: true });
});
/* --------------------------------------------
    DEVICE / SERIAL
-------------------------------------------- */

/* 端末ごとのスピン数取得 */
app.get('/api/device', (req, res) => {
  const d = (req.query.deviceId || '').trim();
  if (!d) return res.status(400).json({ error: 'deviceId required' });
  db.prepare(`INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)`).run(d);
  const row = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(d);
  res.json({ spins: row?.spins ?? 0 });
});

/* シリアル使用 */
app.post('/api/redeem-serial', (req, res) => {
  const { code, deviceId } = req.body;
  if (!code || !deviceId) return res.status(400).json({ error: 'code and deviceId required' });

  const row = db.prepare(`SELECT * FROM serials WHERE code=?`).get(code.toUpperCase());
  if (!row) return res.status(404).json({ error: 'invalid code' });
  if (row.used) return res.status(409).json({ error: 'already used' });

  db.prepare(`INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)`).run(deviceId);
  db.prepare(`UPDATE devices SET spins=spins+? WHERE device_id=?`).run(row.spins, deviceId);

  db.prepare(`UPDATE serials SET used=1, used_by_device=?, used_at=datetime('now') WHERE code=?`)
    .run(deviceId, code.toUpperCase());

  const dev = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(deviceId);
  res.json({ ok: true, spins: dev.spins });
});

/* --------------------------------------------
    SPIN（単発ガチャ）
-------------------------------------------- */
app.post('/api/spin', (req, res) => {
  const device = req.body.deviceId;
  if (!device) return res.status(400).json({ error: 'deviceId required' });

  db.prepare(`INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)`).run(device);
  const dev = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(device);
  if (dev.spins <= 0) return res.status(402).json({ error: 'no spins left' });

  /* スピン消費 */
  db.prepare(`UPDATE devices SET spins=spins-1 WHERE device_id=?`).run(device);

  /* レア度抽選 → そのレア度の景品からランダム1つ選ぶ */
  const rarity = pickRarity();
  const prize = pickPrizeByRarity(rarity);
  if (!prize) return res.status(500).json({ error: 'no prize for rarity ' + rarity });

  /* コレクション登録（重複は1件だけ保持、個数は別カウント） */
  db.prepare(`INSERT OR IGNORE INTO collections(device_id, prize_id) VALUES (?,?)`)
    .run(device, prize.id);

  res.json({
    ok: true,
    prize: {
      id: prize.id,
      rarity,
      video_url: '/uploads/' + prize.video_path,
      video_path: prize.video_path
    }
  });
});

/* --------------------------------------------
    10連ガチャ（/api/spin10）
-------------------------------------------- */
app.post('/api/spin10', (req, res) => {
  const device = req.body.deviceId;
  if (!device) return res.status(400).json({ error: 'deviceId required' });

  db.prepare(`INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)`).run(device);
  const dev = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(device);

  if (dev.spins < 10) return res.status(402).json({ error: 'not enough spins' });

  /* 10回まとめて消費 */
  db.prepare(`UPDATE devices SET spins=spins-10 WHERE device_id=?`).run(device);

  const results = [];

  for (let i = 0; i < 10; i++) {
    const rarity = pickRarity();
    const prize = pickPrizeByRarity(rarity);

    if (!prize) {
      results.push({ error: 'no prize for ' + rarity });
      continue;
    }

    /* コレクション登録 */
    const before = db.prepare(`SELECT * FROM collections WHERE device_id=? AND prize_id=?`)
      .get(device, prize.id);

    const isNew = !before;

    db.prepare(`INSERT OR IGNORE INTO collections(device_id, prize_id) VALUES (?,?)`)
      .run(device, prize.id);

    results.push({
      id: prize.id,
      rarity,
      video_path: prize.video_path,
      video_url: '/uploads/' + prize.video_path,
      isNew
    });
  }

  res.json({ ok: true, results });
});

/* --------------------------------------------
    My Collection（レア度ごとに返す）
-------------------------------------------- */
app.get('/api/my-collection', (req, res) => {
  const d = req.query.deviceId;
  if (!d) return res.status(400).json({ error: 'deviceId required' });

  const rows = db.prepare(`
    SELECT p.title,
           p.video_path,
           p.rarity,
           MAX(c.obtained_at) AS obtained_at,
           COUNT(*) AS owned_count
    FROM collections c
    JOIN prizes p ON c.prize_id = p.id
    WHERE c.device_id = ?
    GROUP BY c.prize_id
    ORDER BY obtained_at DESC
  `).all(d);

  res.json(rows);
});

/* --------------------------------------------
    ダウンロード（スマホ対応）
-------------------------------------------- */
app.get('/download/:file', (req, res) => {
  const f = req.params.file;
  if (f.includes('..') || f.includes('/') || f.includes('\\'))
    return res.status(400).json({ error: 'bad filename' });

  const abs = path.join(uploadsDir, f);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'not found' });

  res.download(abs, f);
});

/* --------------------------------------------
    HEALTHCHECK
-------------------------------------------- */
app.get('/api/health', (_, res) => res.json({ ok: true }));

/* --------------------------------------------
    SPA Fallback
-------------------------------------------- */
app.get('*', (_, res) =>
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
);

/* --------------------------------------------
    SERVER RUN
-------------------------------------------- */
app.listen(PORT, () =>
  console.log('Server running on :' + PORT)
);
