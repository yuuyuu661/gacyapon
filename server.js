import 'dotenv/config'
import express from 'express'
import path from 'path'
import cors from 'cors'
import morgan from 'morgan'
import jwt from 'jsonwebtoken'
import Database from 'better-sqlite3'
import multer from 'multer'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({limit:'10mb'}));
app.use(cors());
app.use(morgan('dev'));
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
const JWT_SECRET = process.env.JWT_SECRET || 'devsecret';

const db = new Database(path.join(__dirname,'data.sqlite'));
db.exec(`CREATE TABLE IF NOT EXISTS devices(device_id TEXT PRIMARY KEY,spins INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS serials(code TEXT PRIMARY KEY,spins INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0,used_by_device TEXT,used_at TEXT);
CREATE TABLE IF NOT EXISTS prizes(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,video_url TEXT,video_path TEXT,rarity TEXT NOT NULL DEFAULT 'normal',weight INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS collections(id INTEGER PRIMARY KEY AUTOINCREMENT,device_id TEXT NOT NULL,prize_id INTEGER NOT NULL,obtained_at TEXT NOT NULL DEFAULT (datetime('now')));`);

const uploadsDir = path.join(__dirname,'public','uploads');
if(!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir,{recursive:true});
const storage = multer.diskStorage({
  destination:(req,file,cb)=>cb(null,uploadsDir),
  filename:(req,file,cb)=>cb(null,Date.now()+'-'+Math.random().toString(36).slice(2)+'.'+(file.originalname.split('.').pop()||'mp4'))
});
const upload = multer({storage});

app.use(express.static(path.join(__dirname,'public')));
app.use('/uploads', express.static(uploadsDir));

function signToken(p){ return jwt.sign(p, JWT_SECRET, {expiresIn:'2h'}); }
function auth(req,res,next){
  const hdr=req.headers.authorization||''; const t=hdr.startsWith('Bearer ')?hdr.slice(7):null;
  if(!t) return res.status(401).json({error:'Unauthorized'});
  try{ req.user=jwt.verify(t, JWT_SECRET); next(); }catch{ return res.status(401).json({error:'Invalid token'}); }
}
function weighted(prizes){
  const total=prizes.reduce((s,p)=>s+(p.enabled?p.weight:0),0); if(total<=0) return null;
  let r=Math.floor(Math.random()*total)+1; for(const p of prizes){ if(!p.enabled) continue; r-=p.weight; if(r<=0) return p; } return null;
}

app.post('/api/admin/login',(req,res)=>{
  if((req.body?.password||'')!==ADMIN_PASSWORD) return res.status(401).json({error:'wrong password'});
  res.json({token:signToken({role:'admin'})});
});

app.get('/api/admin/prizes', auth, (req,res)=>{
  res.json(db.prepare('SELECT id,title,video_url,video_path,rarity,weight,enabled FROM prizes ORDER BY id').all());
});
app.post('/api/admin/prizes/bulk', auth, (req,res)=>{
  const items=req.body?.items||[];
  const up=db.prepare('UPDATE prizes SET title=?, rarity=?, weight=?, enabled=? WHERE id=?');
  const del=db.prepare('DELETE FROM prizes WHERE id=?');
  const tx=db.transaction(arr=>{ for(const it of arr){ if(it._op==='update') up.run(it.title,it.rarity||'normal',it.weight|0,it.enabled?1:0,it.id); else if(it._op==='delete') del.run(it.id); } });
  tx(items); res.json({ok:true});
});
app.post('/api/admin/prizes/create', auth, upload.single('video'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'video required'});
  const {title='',percent='0',rarity='normal'}=req.body||{}; const w=Math.round(parseFloat(percent)||0);
  const info=db.prepare('INSERT INTO prizes(title,video_path,rarity,weight,enabled) VALUES (?,?,?,?,1)').run(title,req.file.filename,rarity,w);
  res.json({ok:true,id:info.lastInsertRowid, video:'/uploads/'+req.file.filename});
});
app.post('/api/admin/prizes/:id/video', auth, upload.single('video'), (req,res)=>{
  if(!req.file) return res.status(400).json({error:'video required'});
  db.prepare('UPDATE prizes SET video_path=? WHERE id=?').run(req.file.filename, +req.params.id);
  res.json({ok:true, video:'/uploads/'+req.file.filename});
});

app.post('/api/admin/serials/issue', auth, (req,res)=>{
  const {code, spins=1, reissue=false}=req.body||{};
  if(!code) return res.status(400).json({error:'code required'});
  const ex=db.prepare('SELECT code FROM serials WHERE code=?').get(code);
  if(ex && !reissue) return res.status(409).json({error:'already exists'});
  if(ex && reissue){ db.prepare('UPDATE serials SET spins=?, used=0, used_by_device=NULL, used_at=NULL WHERE code=?').run(spins|0, code); return res.json({ok:true, code, spins, reissued:true}); }
  db.prepare('INSERT INTO serials(code,spins,used) VALUES (?,?,0)').run(code, spins|0);
  res.json({ok:true, code, spins});
});
app.post('/api/redeem-serial',(req,res)=>{
  const {code,deviceId}=req.body||{}; if(!code||!deviceId) return res.status(400).json({error:'code and deviceId required'});
  const row=db.prepare('SELECT code,spins,used FROM serials WHERE code=?').get(code);
  if(!row) return res.status(404).json({error:'invalid code'});
  if(row.used) return res.status(409).json({error:'already used'});
  const d=db.prepare('SELECT device_id FROM devices WHERE device_id=?').get(deviceId);
  if(!d) db.prepare('INSERT INTO devices(device_id,spins) VALUES (?,0)').run(deviceId);
  db.prepare('UPDATE devices SET spins=spins+? WHERE device_id=?').run(row.spins, deviceId);
  db.prepare('UPDATE serials SET used=1, used_by_device=?, used_at=datetime(''now'') WHERE code=?').run(deviceId, code);
  const spins=db.prepare('SELECT spins FROM devices WHERE device_id=?').get(deviceId).spins;
  res.json({ok:true, added:row.spins, spins});
});
app.get('/api/spins',(req,res)=>{
  const dev=req.query.deviceId; if(!dev) return res.status(400).json({error:'deviceId required'});
  const row=db.prepare('SELECT spins FROM devices WHERE device_id=?').get(dev);
  res.json({spins: row?row.spins:0});
});
app.post('/api/spin',(req,res)=>{
  const id=req.body?.deviceId; if(!id) return res.status(400).json({error:'deviceId required'});
  const d=db.prepare('SELECT device_id,spins FROM devices WHERE device_id=?').get(id);
  if(!d) db.prepare('INSERT INTO devices(device_id,spins) VALUES (?,0)').run(id);
  const left=db.prepare('SELECT spins FROM devices WHERE device_id=?').get(id).spins;
  if(left<=0) return res.status(402).json({error:'no spins left'});
  const prizes=db.prepare('SELECT id,title,video_url,video_path,rarity,weight,enabled FROM prizes').all();
  const pick=weighted(prizes); if(!pick) return res.status(500).json({error:'no prizes configured'});
  const tx=db.transaction(()=>{ db.prepare('UPDATE devices SET spins=spins-1 WHERE device_id=?').run(id); db.prepare('INSERT INTO collections(device_id,prize_id) VALUES (?,?)').run(id,pick.id); }); tx();
  const spins=db.prepare('SELECT spins FROM devices WHERE device_id=?').get(id).spins;
  const video= pick.video_url || (pick.video_path? '/uploads/'+pick.video_path : null);
  res.json({ok:true, spins, prize:{ id:pick.id, title:pick.title, rarity:pick.rarity, video }});
});
app.get('/api/my-collection',(req,res)=>{
  const dev=req.query.deviceId; if(!dev) return res.status(400).json({error:'deviceId required'});
  const rows=db.prepare("SELECT c.id,c.obtained_at,p.title,COALESCE(p.video_url,'/uploads/'||p.video_path) AS video FROM collections c JOIN prizes p ON p.id=c.prize_id WHERE c.device_id=? ORDER BY c.id DESC").all(dev);
  res.json(rows);
});

app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(PORT,()=>console.log('Server listening on :'+PORT));
