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

// === DB Setup ===
const db = new Database(path.join(__dirname, 'data.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS devices(device_id TEXT PRIMARY KEY, spins INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS serials(code TEXT PRIMARY KEY, spins INTEGER, used INTEGER DEFAULT 0, used_by_device TEXT, used_at TEXT);
CREATE TABLE IF NOT EXISTS prizes(id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, video_path TEXT, rarity TEXT DEFAULT 'normal', weight INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS collections(id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, prize_id INTEGER, obtained_at TEXT DEFAULT (datetime('now')));
`);

// === File Uploads ===
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + (file.originalname.split('.').pop() || 'mp4'))
});
const upload = multer({ storage });

// === Middleware ===
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
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}

// === Helper ===
function pickWeighted(prizes) {
  const total = prizes.reduce((a, p) => a + (p.enabled ? p.weight : 0), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const p of prizes) {
    if (!p.enabled) continue;
    r -= p.weight;
    if (r <= 0) return p;
  }
  return null;
}

// === Admin APIs ===
app.post('/api/admin/login', (req, res) => {
  if (req.body.password !== ADMIN_PASSWORD)
    return res.status(401).json({ error: 'wrong password' });
  res.json({ token: signToken({ role: 'admin' }) });
});

app.post('/api/admin/serials/issue', auth, (req, res) => {
  const { code, spins } = req.body || {};
  const n = Number(spins);
  const c = (code || '').trim();
  if (!c || !Number.isFinite(n) || n <= 0) {
    return res.status(400).json({ error: 'invalid code or spins' });
  }
  const row = db.prepare('SELECT used FROM serials WHERE code=?').get(c);
  if (row && row.used) {
    return res.status(409).json({ error: 'already used code' });
  }
  if (row) {
    db.prepare('UPDATE serials SET spins=?, used=0, used_by_device=NULL, used_at=NULL WHERE code=?').run(n, c);
  } else {
    db.prepare('INSERT INTO serials(code, spins, used) VALUES (?,?,0)').run(c, n);
  }
  res.json({ ok: true });
});

app.get('/api/admin/prizes', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM prizes ORDER BY id').all());
});

app.post('/api/admin/prizes/create', auth, upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'video required' });
  const { title = '', percent = '0', rarity = 'normal' } = req.body;
  const weight = parseFloat(percent) || 0;
  db.prepare('INSERT INTO prizes(title, video_path, rarity, weight) VALUES (?,?,?,?)')
    .run(title, req.file.filename, rarity, weight);
  res.json({ ok: true });
});

app.post('/api/admin/prizes/update', auth, upload.single('video'), (req, res) => {
  const { id, title = '', percent = '0', rarity = 'normal', enabled = 1 } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const row = db.prepare('SELECT * FROM prizes WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'not found' });

  let video_path = row.video_path;
  if (req.file) {
    try {
      const oldPath = path.join(uploadsDir, row.video_path || '');
      if (row.video_path && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    } catch {}
    video_path = req.file.filename;
  }
  const weight = parseFloat(percent) || 0;
  const en = String(enabled)==='0' ? 0 : 1;
  db.prepare('UPDATE prizes SET title=?, video_path=?, rarity=?, weight=?, enabled=? WHERE id=?')
    .run(title, video_path, rarity, weight, en, id);
  res.json({ ok: true });
});

app.post('/api/admin/prizes/delete', auth, (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'id required' });
  const row = db.prepare('SELECT * FROM prizes WHERE id=?').get(id);
  if (!row) return res.status(404).json({ error: 'not found' });
  try {
    const p = path.join(uploadsDir, row.video_path || '');
    if (row.video_path && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {}
  db.prepare('DELETE FROM prizes WHERE id=?').run(id);
  res.json({ ok: true });
});

// === Public APIs ===
app.get('/api/health', (_, res)=> res.json({ ok:true }));

app.get('/api/device', (req, res) => {
  const d = (req.query.deviceId || '').trim();
  if (!d) return res.status(400).json({ error: 'deviceId required' });
  db.prepare('INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)').run(d);
  const row = db.prepare('SELECT spins FROM devices WHERE device_id=?').get(d);
  res.json({ spins: row?.spins ?? 0 });
});

app.post('/api/spin', (req, res) => {
  const device = req.body.deviceId;
  if (!device) return res.status(400).json({ error: 'deviceId required' });
  db.prepare('INSERT OR IGNORE INTO devices(device_id, spins) VALUES (?,0)').run(device);
  const dev = db.prepare('SELECT spins FROM devices WHERE device_id=?').get(device);
  if (dev.spins <= 0) return res.status(402).json({ error: 'no spins left' });

  const prizes = db.prepare('SELECT * FROM prizes').all().filter(p=>p.enabled);
  const pick = pickWeighted(prizes);
  if (!pick) return res.status(500).json({ error: 'no prize' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE devices SET spins=spins-1 WHERE device_id=?').run(device);
    db.prepare('INSERT INTO collections(device_id, prize_id) VALUES (?,?)').run(device, pick.id);
  });
  tx();
  res.json({
    ok: true,
    prize: {
      title: pick.title,
      video_url: '/uploads/' + pick.video_path,
      rarity: pick.rarity
    }
  });
});

app.post('/api/redeem-serial', (req, res) => {
  const { code, deviceId } = req.body;
  if (!code || !deviceId) return res.status(400).json({ error: 'code and deviceId required' });
  const row = db.prepare('SELECT * FROM serials WHERE code=?').get(code);
  if (!row) return res.status(404).json({ error: 'invalid code' });
  if (row.used) return res.status(409).json({ error: 'already used' });
  db.prepare('INSERT OR IGNORE INTO devices(device_id,spins) VALUES (?,0)').run(deviceId);
  db.prepare('UPDATE devices SET spins=spins+? WHERE device_id=?').run(row.spins, deviceId);
  db.prepare("UPDATE serials SET used=1, used_by_device=?, used_at=datetime('now') WHERE code=?").run(deviceId, code);
  const dev = db.prepare('SELECT spins FROM devices WHERE device_id=?').get(deviceId);
  res.json({ ok: true, spins: dev.spins });
});

app.get('/api/my-collection', (req, res) => {
  const d = req.query.deviceId;
  if (!d) return res.status(400).json({ error: 'deviceId required' });
  const rows = db.prepare(`
    SELECT c.id, p.title, p.video_path, p.rarity, c.obtained_at
    FROM collections c JOIN prizes p ON c.prize_id=p.id
    WHERE device_id=? ORDER BY c.id DESC
  `).all(d);
  res.json(rows);
});

app.get('*', (_, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log('Server running on :' + PORT));
