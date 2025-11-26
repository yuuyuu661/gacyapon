const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json());

// ====================
// DB
// ====================
const DB_PATH = "./database.json";
if (!fs.existsSync(DB_PATH)) {
  fs.writeFileSync(
    DB_PATH,
    JSON.stringify({ users: {}, prizes: [] }, null, 2)
  );
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
// スピン回数取得
// ====================
app.get("/api/spins", (req, res) => {
  const user = req.query.user;
  const db = loadDB();

  const spins = db.users[user]?.spins ?? 0;

  res.json({ spins });
});

// ====================
// シリアルコード → 回数追加
// ====================
app.post("/api/redeem-serial", (req, res) => {
  const { user, code } = req.body;

  const db = loadDB();

  if (!db.users[user]) {
    db.users[user] = {
      spins: 0,
      collection: []
    };
  }

  // 仮で 1 回追加
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

  if (!db.users[user]) {
    db.users[user] = {
      spins: 0,
      collection: []
    };
  }

  // 回数チェック
  if (db.users[user].spins <= 0) {
    return res.status(400).json({ error: "回数がありません" });
  }

  db.users[user].spins--;

  // ランダム景品
  const prizes = db.prizes;
  if (prizes.length === 0) {
    return res.status(500).json({ error: "景品が設定されていません" });
  }

  const prize = prizes[Math.floor(Math.random() * prizes.length)];

  const duplicate = db.users[user].collection.includes(prize.id);

  if (!duplicate) {
    db.users[user].collection.push(prize.id);
  }

  saveDB(db);

  res.json({
    prize: {
      id: prize.id,
      rarity: prize.rarity,
      video: prize.video,
      thumbnail: prize.thumbnail,
      duplicate
    }
  });
});

// ====================
// マイコレ
// ====================
app.get("/api/collection", (req, res) => {
  const user = req.query.user;
  const db = loadDB();

  if (!db.users[user]) return res.json([]);

  const list = db.users[user].collection.map((id) =>
    db.prizes.find((p) => p.id === id)
  );

  res.json(list);
});

// ====================
// サーバー起動
// ====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started on port " + PORT);
});
