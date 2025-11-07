\
import 'dotenv/config'
import express from 'express'
import path from 'path'
import cors from 'cors'
import morgan from 'morgan'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({limit:'2mb'}));
app.use(cors());
app.use(morgan('dev'));

// --- ENV ---
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

// --- DB INIT ---
const dbPath = path.join(__dirname, 'data.sqlite');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  spins INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS serials (
  code TEXT PRIMARY KEY,
  spins INTEGER NOT NULL,
  note TEXT,
  expires_at TEXT, -- ISO datetime or null
  used INTEGER NOT NULL DEFAULT 0,
  used_by_device TEXT,
  used_at TEXT
);
CREATE TABLE IF NOT EXISTS prizes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  video_url TEXT NOT NULL,
  weight INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  prize_id INTEGER NOT NULL,
  obtained_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (prize_id) REFERENCES prizes(id)
);
`);

// ---- helpers ----
function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
}
function authMiddleware(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
function pickWeighted(prizes) {
  const total = prizes.reduce((s,p)=>s+(p.enabled? p.weight:0),0);
  if (total <= 0) return null;
  let r = Math.floor(Math.random()*total)+1;
  for (const p of prizes) {
    if (!p.enabled) continue;
    r -= p.weight;
    if (r<=0) return p;
  }
  return null;
}

// ---- static ----
app.use(express.static(path.join(__dirname, 'public')));

// ---- API ----

// Admin login
app.post('/api/admin/login', (req,res)=>{
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'password required' });
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'wrong password' });
  const token = signToken({ role:'admin' });
  res.json({ token });
});

// Admin: prizes
app.get('/api/admin/prizes', authMiddleware, (req,res)=>{
  const rows = db.prepare(`SELECT id,title,video_url,weight,enabled FROM prizes ORDER BY id`).all();
  res.json(rows);
});
app.post('/api/admin/prizes/bulk', authMiddleware, (req,res)=>{
  // expects items: [{id?, title, video_url, weight, enabled, _op:'create'|'update'|'delete'}]
  const { items } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items required' });
  const insert = db.prepare(`INSERT INTO prizes (title,video_url,weight,enabled) VALUES (?,?,?,?)`);
  const update = db.prepare(`UPDATE prizes SET title=?, video_url=?, weight=?, enabled=? WHERE id=?`);
  const del = db.prepare(`DELETE FROM prizes WHERE id=?`);
  const tx = db.transaction((arr)=>{
    for (const it of arr) {
      if (it._op === 'create') {
        insert.run(it.title, it.video_url, it.weight|0, it.enabled?1:0);
      } else if (it._op === 'update') {
        update.run(it.title, it.video_url, it.weight|0, it.enabled?1:0, it.id);
      } else if (it._op === 'delete') {
        del.run(it.id);
      }
    }
  });
  tx(items);
  res.json({ ok:true });
});

// Admin: serial issuance
app.post('/api/admin/serials/create', authMiddleware, (req,res)=>{
  const { spins=1, quantity=1, note='', expiresAt=null } = req.body || {};
  const ins = db.prepare(`INSERT INTO serials (code,spins,note,expires_at,used) VALUES (?,?,?,?,0)`);
  const codes = [];
  const gen = ()=> crypto.randomBytes(6).toString('base64url').upper().slice(0,12);
  for (let i=0;i<quantity;i++){
    let code;
    while(true){
      code = gen();
      try {
        ins.run(code, spins|0, note, expiresAt);
        break;
      } catch(e){
        // collision, regen
      }
    }
    codes.push(code);
  }
  res.json({ codes, spins, quantity, note, expiresAt });
});

app.get('/api/admin/serials', authMiddleware, (req,res)=>{
  const rows = db.prepare(`SELECT code,spins,note,expires_at,used,used_by_device,used_at FROM serials ORDER BY used, code`).all();
  res.json(rows);
});

// Redeem serial
app.post('/api/redeem-serial', (req,res)=>{
  const { code, deviceId } = req.body || {};
  if (!code || !deviceId) return res.status(400).json({ error: 'code and deviceId required' });
  const row = db.prepare(`SELECT code,spins,expires_at,used FROM serials WHERE code=?`).get(code);
  if (!row) return res.status(404).json({ error: 'invalid code' });
  if (row.used) return res.status(409).json({ error: 'already used' });
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    return res.status(410).json({ error: 'code expired' });
  }
  const dev = db.prepare(`SELECT device_id,spins FROM devices WHERE device_id=?`).get(deviceId);
  if (!dev) db.prepare(`INSERT INTO devices (device_id,spins) VALUES (?,0)`).run(deviceId);
  db.prepare(`UPDATE devices SET spins = spins + ? WHERE device_id=?`).run(row.spins, deviceId);
  db.prepare(`UPDATE serials SET used=1, used_by_device=?, used_at=datetime('now') WHERE code=?`).run(deviceId, code);
  const spins = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(deviceId).spins;
  res.json({ ok:true, added: row.spins, spins });
});

// Spin
app.post('/api/spin', (req,res)=>{
  const { deviceId } = req.body || {};
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  const dev = db.prepare(`SELECT device_id,spins FROM devices WHERE device_id=?`).get(deviceId);
  if (!dev) db.prepare(`INSERT INTO devices (device_id,spins) VALUES (?,0)`).run(deviceId);
  const current = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(deviceId).spins;
  if (current <= 0) return res.status(402).json({ error: 'no spins left' });
  const prizes = db.prepare(`SELECT id,title,video_url,weight,enabled FROM prizes`).all();
  const pick = pickWeighted(prizes);
  if (!pick) return res.status(500).json({ error: 'no prizes configured' });
  const tx = db.transaction(()=>{
    db.prepare(`UPDATE devices SET spins = spins - 1 WHERE device_id=?`).run(deviceId);
    db.prepare(`INSERT INTO collections (device_id,prize_id) VALUES (?,?)`).run(deviceId, pick.id);
  });
  tx();
  const spins = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(deviceId).spins;
  res.json({ ok:true, spins, prize: pick });
});

// Collection
app.get('/api/my-collection', (req,res)=>{
  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  const rows = db.prepare(`
    SELECT c.id, c.obtained_at, p.title, p.video_url
    FROM collections c
    JOIN prizes p ON p.id = c.prize_id
    WHERE c.device_id = ?
    ORDER BY c.id DESC
  `).all(deviceId);
  res.json(rows);
});

// Spins left
app.get('/api/spins', (req,res)=>{
  const { deviceId } = req.query;
  if (!deviceId) return res.status(400).json({ error: 'deviceId required' });
  const row = db.prepare(`SELECT spins FROM devices WHERE device_id=?`).get(deviceId);
  res.json({ spins: row ? row.spins : 0 });
});

// Fallback to SPA
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, ()=>{
  console.log('Server listening on :' + PORT);
});
