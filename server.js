// ===============================
//  Server.js（最新版）
// ===============================
import express from "express";
import fs from "fs";
import path from "path";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const DATA_FILE = "./data.json";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

// ===============================
//  データ読み込み
// ===============================
function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        return { users: {}, prizes: {}, serials: {}, rates: {} };
    }
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===============================
//  残り回数取得
// ===============================
app.get("/api/spins", (req, res) => {
    const user = req.query.user;
    const db = loadData();

    const spins = db.users[user]?.spins ?? 0;
    res.json({ spins });
});

// ===============================
//  シリアルコード消費 → 回数追加
//  app.js の仕様に合わせて /api/redeem-serial
// ===============================
app.post("/api/redeem-serial", (req, res) => {
    const { user, code } = req.body;
    if (!user || !code) return res.json({ error: "invalid" });

    const db = loadData();

    if (!db.serials[code]) {
        return res.json({ error: "無効なシリアルコード" });
    }
    if (db.serials[code].used) {
        return res.json({ error: "すでに使われています" });
    }

    // 追加回数
    const add = db.serials[code].add ?? 1;

    // ユーザー作成
    db.users[user] ??= { spins: 0, collection: [] };
    db.users[user].spins += add;

    db.serials[code].used = true;

    saveData(db);

    res.json({ success: true, added: add });
});

// ===============================
//  管理ログイン
//  app.js が /api/admin/login を使っている
// ===============================
app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;
    if (!password) return res.json({ success: false });

    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true });
    }

    return res.json({ success: false });
});

// ===============================
//  ガチャ実行
// ===============================
app.get("/api/spin", (req, res) => {
    const user = req.query.user;
    const count = Number(req.query.count ?? 1);

    const db = loadData();
    db.users[user] ??= { spins: 0, collection: [] };

    if (db.users[user].spins < count) {
        return res.json({ error: "回数が足りません" });
    }

    // 回数減算
    db.users[user].spins -= count;

    // まだ景品はランダム固定（後で改善する）
    const result = [];
    for (let i = 0; i < count; i++) {
        result.push({ rarity: "normal", id: "placeholder" });
    }

    saveData(db);

    res.json({ success: true, results: result });
});

// ===============================
//  サーバー起動
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server Started:", PORT);
});
