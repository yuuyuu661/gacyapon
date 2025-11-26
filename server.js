import express from "express";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());

// ====================
// データ保存
// ====================
const DB_PATH = "./database.json";
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(DB_PATH, JSON.stringify({
    users: {},
    prizes: []   // 景品登録データ
  }, null, 2));
}

function loadDB() {
  return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}
function saveDB(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// ====================
// 静的ファイル
// ====================
app.use(express.static("public"));

// ====================
// 回数取得
// ====================
app.get("/api/spins", (req, res) => {
  const user = req.query.user;
  const db = loadDB();
  const spins = db.users[user]?.spins ?? 0;
  res.json({ spins });
});

// ====================
// シリアルコード追加
// ====================
app.post("/api/redeem-serial", (req, res) => {
  const { user, code } = req.body;

  const db = loadDB();

  if (!db.users[user]) db.users[user] = { spins: 0, collection: [] };

  // 仮: 1回追加
  db.users[user].spins += 1;

  saveDB(db);

  res.json({ ok: true });
});

// ====================
// ガチャ実行
// ====================
app.post("/api/spin", (req, res) => {
  const { user } = req.body;
  const db = loadDB();

  if (!db.users[user]) db.users[user] = { spins: 0, collection: [] };

  if (db.users[user].spins <= 0) {
    return res.status(400).json({ error: "回数がありません" });
  }

  db.users[user].spins--;

  // ランダムに景品選ぶ
  const prize = db.prizes[Math.floor(Math.random() * db.prizes.length)];

  const already = db.users[user].collection.includes(prize.id);

  if (!already) {
    db.users[user].collection.push(prize.id);
  }

  saveDB(db);

  res.json({
    prize: {
      id: prize.id,
      rarity: prize.rarity,
      thumbnail: prize.thumbnail,
      video: prize.video,
      duplicate: already
    }
  });
});

// ====================
// マイコレ一覧
// ====================
app.get("/api/collection", (req, res) => {
  const user = req.query.user;
  const db = loadDB();

  if (!db.users[user]) return res.json([]);

  const col = db.users[user].collection.map(id => {
    return db.prizes.find(p => p.id === id);
  });

  res.json(col);
});

// ====================
// サーバー起動
// ====================
app.listen(3000, () => console.log("Server started"));
