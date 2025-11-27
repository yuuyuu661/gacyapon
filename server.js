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

/* -------------------------------------------------------------
    DB
------------------------------------------------------------- */
const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_col_unique
ON collections(device_id, prize_id);

CREATE TABLE IF NOT EXISTS rarity_weights(
  rarity TEXT PRIMARY KEY,
  weight INTEGER DEFAULT 0
);

INSERT OR IGNORE INTO rarity_weights(rarity, weight) VALUES
('normal', 50),
('common', 30),
('rare', 15),
('superrare', 5);

/* ★ 特別景品（bonus video）*/
CREATE TABLE IF NOT EXISTS bonus_video(
  id INTEGER PRIMARY KEY CHECK (id = 1),
  video_path TEXT
);
`);

/* -------------------------------------------------------------
    Upload
------------------------------------------------------------- */
const uploadsDir = path.join(__dirname, 'public', 'uploads');
const bonusDir = path.join(__dirname, 'public', 'bonus');

if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(bonusDir)) fs.mkdirSync(bonusDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadsDir),
  filename: (_, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'mp4');
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext);
  }
});
const upload = multer({ storage });

const bonusStorage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, bonusDir),
  filename: (_, file, cb) => {
    const ext = (file.originalname.split('.').pop() || 'mp4');
    cb(null, 'bonus.' + ext);
  }
});
const uploadBonus = multer({ storage: bonusStorage });

/* -------------------------------------------------------------
    Static
------------------------------------------------------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));
app.use('/bonus', express.static(bonusDir));

/* -------------------------------------------------------------
    Auth
------------------------------------------------------------- */
function signToken(p){ return jwt.sign(p, JWT_SECRET, { expiresIn: '4h' }); }

function auth(req, res, next){
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!t) return res.status(401).json({ error:'no token' });
  try {
    req.user = jwt.verify(t, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error:'invalid token' });
  }
}

/* Admin Login */
app.post('/api/admin/login', (req, res)=>{
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error:'wrong password' });

  return res.json({ token: signToken({ role:'admin' }) });
});

/* -------------------------------------------------------------
    Serial
------------------------------------------------------------- */
app.get('/api/admin/serials', auth, (req,res)=>{
  const rows = db.prepare(`
    SELECT code, spins, used, used_by_device, used_at
    FROM serials ORDER BY rowid DESC LIMIT 200
  `).all();
  res.json(rows);
});

app.post('/api/admin/serials/issue', auth, (req,res)=>{
  let { code, spins } = req.body;

  const n = Number(spins);
  if (!Number.isFinite(n) || n <= 0)
    return res.status(400).json({ error:'invalid spins' });

  let c = (code || '').trim().toUpperCase();

  if (!c){
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    function gen(){
      let s=''; for (let i=0;i<8;i++) s+=chars[Math.floor(Math.random()*chars.length)];
      return s;
    }
    do { c = gen(); } while(db.prepare('SELECT 1 FROM serials WHERE code=?').get(c));
  }

  const existing = db.prepare('SELECT used FROM serials WHERE code=?').get(c);

  if (existing){
    db.prepare(`
      UPDATE serials SET spins=?, used=0, used_by_device=NULL, used_at=NULL
      WHERE code=?
    `).run(n, c);
  } else {
    db.prepare(`INSERT INTO serials(code, spins, used) VALUES (?,?,0)`).run(c, n);
  }

  res.json({ ok:true, code:c, spins:n });
});

/* -------------------------------------------------------------
    Prizes
------------------------------------------------------------- */
app.get('/api/admin/prizes', auth, (req,res)=>{
  res.json(db.prepare('SELECT * FROM prizes ORDER BY id').all());
});

app.post('/api/admin/prizes/create', auth, upload.single('video'), (req,res)=>{
  if (!req.file) return res.status(400).json({ error:'video required' });

  const rarity = req.body.rarity || 'normal';
  db.prepare(`
    INSERT INTO prizes(video_path, rarity, enabled)
    VALUES (?,?,1)
  `).run(req.file.filename, rarity);

  res.json({ ok:true });
});

app.post('/api/admin/prizes/update', auth, upload.single('video'), (req,res)=>{
  const { id, rarity = 'normal', enabled = 1 } = req.body;
  if (!id) return res.status(400).json({ error:'id required' });

  const row = db.prepare('SELECT * FROM prizes WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error:'not found' });

  let video_path = row.video_path;

  if (req.file){
    const old = path.join(uploadsDir, row.video_path);
    if (fs.existsSync(old)) fs.unlinkSync(old);
    video_path = req.file.filename;
  }

  db.prepare(`
    UPDATE prizes SET video_path=?, rarity=?, enabled=? WHERE id=?
  `).run(video_path, rarity, String(enabled)==='1'?1:0, id);

  res.json({ ok:true });
});

app.post('/api/admin/prizes/delete', auth, (req,res)=>{
  const { id } = req.body;
  if (!id) return res.status(400).json({ error:'id required' });

  const row = db.prepare('SELECT * FROM prizes WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error:'not found' });

  const f = path.join(uploadsDir, row.video_path);
  if (fs.existsSync(f)) fs.unlinkSync(f);

  db.prepare('DELETE FROM prizes WHERE id=?').run(id);

  res.json({ ok:true });
});

/* -------------------------------------------------------------
    特別景品（bonus video）
------------------------------------------------------------- */
app.post('/api/admin/bonus/upload', auth, uploadBonus.single('bonus'), (req,res)=>{
  if (!req.file) return res.status(400).json({ error:'bonus video required' });

  db.prepare(`
    INSERT INTO bonus_video(id, video_path)
    VALUES (1, ?) 
    ON CONFLICT(id) DO UPDATE SET video_path=excluded.video_path
  `).run(req.file.filename);

  res.json({ ok:true, path:req.file.filename });
});

app.get('/api/bonus', (req,res)=>{
  const row = db.prepare(`SELECT video_path FROM bonus_video WHERE id=1`).get();
  if (!row || !row.video_path)
    return res.status(404).json({ error:'bonus not found' });

  res.json({ ok:true, url:'/bonus/'+row.video_path });
});

/* -------------------------------------------------------------
    Rarity weights
------------------------------------------------------------- */
app.get('/api/admin/rarity-weights', auth, (req,res)=>{
  const rows = db.prepare(`SELECT rarity, weight FROM rarity_weights`).all();
  const data = {};
  rows.forEach(r => data[r.rarity] = r.weight);
  res.json({ ok:true, data });
});

app.post('/api/admin/rarity-weights/update', auth, (req,res)=>{
  const { normal, common, rare, superrare } = req.body;

  db.prepare("UPDATE rarity_weights SET weight=? WHERE rarity='normal'")
    .run(Number(normal)||0);
  db.prepare("UPDATE rarity_weights SET weight=? WHERE rarity='common'")
    .run(Number(common)||0);
  db.prepare("UPDATE rarity_weights SET weight=? WHERE rarity='rare'")
    .run(Number(rare)||0);
  db.prepare("UPDATE rarity_weights SET weight=? WHERE rarity='superrare'")
    .run(Number(superrare)||0);

  res.json({ ok:true });
});

/* -------------------------------------------------------------
    Device
------------------------------------------------------------- */
app.get('/api/device', (req,res)=>{
  const d = (req.query.deviceId || '').trim();
  if (!d) return res.status(400).json({ error:'deviceId required' });

  db.prepare('INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)').run(d);
  const row = db.prepare('SELECT spins FROM devices WHERE device_id=?').get(d);

  res.json({ spins: row?.spins ?? 0 });
});

/* -------------------------------------------------------------
    抽選ロジック
------------------------------------------------------------- */
function pickRarity(){
  const rows = db.prepare(`SELECT rarity, weight FROM rarity_weights`).all();
  const total = rows.reduce((a,b)=> a + b.weight, 0);

  if (total <= 0) return 'normal';

  let r = Math.random() * total;
  for (const rw of rows){
    r -= rw.weight;
    if (r <= 0) return rw.rarity;
  }
  return rows[0]?.rarity || 'normal';
}

function pickPrizeByRarity(rarity){
  const list = db.prepare(`
    SELECT * FROM prizes
    WHERE rarity=? AND enabled=1
  `).all(rarity);

  if (!list.length) return null;

  const idx = Math.floor(Math.random()*list.length);
  return list[idx];
}

/* -------------------------------------------------------------
    Serial Redeem
------------------------------------------------------------- */
app.post('/api/redeem-serial', (req,res)=>{
  const { code, deviceId } = req.body;
  if (!code || !deviceId)
    return res.status(400).json({ error:'code and deviceId required' });

  const row = db.prepare(`SELECT * FROM serials WHERE code = ?`).get(code);
  if (!row) return res.status(404).json({ error:'invalid code' });
  if (row.used) return res.status(400).json({ error:'already used' });

  const tx = db.transaction(()=>{
    db.prepare(`
      UPDATE serials
      SET used=1, used_by_device=?, used_at=datetime('now')
      WHERE code=?
    `).run(deviceId, code);

    db.prepare(`INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)`)
      .run(deviceId);

    db.prepare(`UPDATE devices SET spins=spins+? WHERE device_id=?`)
      .run(row.spins, deviceId);
  });

  tx();
  res.json({ ok:true, added: row.spins });
});

/* -------------------------------------------------------------
    Spin
------------------------------------------------------------- */
app.post('/api/spin', (req,res)=>{
  const device = req.body.deviceId;
  if (!device) return res.status(400).json({ error:'deviceId required' });

  db.prepare(`INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)`).run(device);

  const dev = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(device);
  if (dev.spins <= 0) return res.status(402).json({ error:'no spins left' });

  const rarity = pickRarity();
  let prize = pickPrizeByRarity(rarity);

  if (!prize && rarity !== 'normal')
    prize = pickPrizeByRarity('normal');

  if (!prize) return res.status(500).json({ error:'no prize available' });

  const tx = db.transaction(()=>{
    db.prepare(`UPDATE devices SET spins=spins-1 WHERE device_id=?`).run(device);
    db.prepare(`INSERT OR IGNORE INTO collections(device_id, prize_id)
                VALUES (?,?)`).run(device, prize.id);
  });
  tx();

  res.json({
    ok:true,
    prize:{
      rarity: prize.rarity,
      video_url: '/uploads/'+prize.video_path,
      file: prize.video_path
    }
  });
});

/* -------------------------------------------------------------
    マイコレ
------------------------------------------------------------- */
app.get('/api/my-collection', (req,res)=>{
  const d = req.query.deviceId;
  if (!d) return res.status(400).json({ error:'deviceId required' });

  const rows = db.prepare(`
    SELECT p.video_path, p.rarity,
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

/* -------------------------------------------------------------
    コンプリート判定 API
------------------------------------------------------------- */
app.get('/api/complete-status', (req,res)=>{
  const device = req.query.deviceId;
  if (!device) return res.status(400).json({ error:'deviceId required' });

  const total = db.prepare(`SELECT COUNT(*) AS n FROM prizes WHERE enabled=1`)
                .get().n;

  const owned = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT DISTINCT prize_id
      FROM collections
      WHERE device_id=?
    )
  `).get(device).n;

  const remain = Math.max(0, total - owned);

  // ボーナス動画があるかチェック
  const bonus = db.prepare(`SELECT video_path FROM bonus_video WHERE id=1`).get();
  const hasBonus = bonus && bonus.video_path;

  res.json({
    ok:true,
    total,
    owned,
    remain,
    completed: remain === 0,
    hasBonus
  });
});

/* -------------------------------------------------------------
    Download
------------------------------------------------------------- */
app.get('/download/:file', (req,res)=>{
  const f = req.params.file;
  if (f.includes('..')) return res.status(400).json({ error:'bad filename' });

  const abs = path.join(uploadsDir, f);
  if (!fs.existsSync(abs)) return res.status(404).json({ error:'not found' });

  res.download(abs, f);
});

/* -------------------------------------------------------------
    SPA fallback
------------------------------------------------------------- */
app.get('*', (_,res)=> res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, ()=> console.log('Server started :' + PORT));
