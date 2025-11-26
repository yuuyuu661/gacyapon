import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import fileUpload from "express-fileupload";

const app = express();
app.use(cors());
app.use(express.json());
app.use(fileUpload());
app.use(express.static("public"));

const DATA_DIR = "./data";
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const USERS_FILE = "./data/users.json";
const PRIZES_FILE = "./data/prizes.json";
const SERIAL_FILE = "./data/serials.json";

// ---------- Utility（初期化） ----------
function loadJSON(file, def) {
    if (!fs.existsSync(file)) {
        fs.writeFileSync(file, JSON.stringify(def, null, 2));
        return def;
    }
    return JSON.parse(fs.readFileSync(file));
}
function saveJSON(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = loadJSON(USERS_FILE, {});        // { userName: { spins: 0, collection: [] } }
let prizes = loadJSON(PRIZES_FILE, []);      // { id, rarity, video, thumbnail }
let serials = loadJSON(SERIAL_FILE, []);     // { code, spins }

// ---------- シリアルコード登録 ----------
app.post("/api/addSerial", (req, res) => {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: "コードなし" });

    // v7.6仕様：同じコードでも毎回新規として扱う
    serials.push({ code, spins: 1 });
    saveJSON(SERIAL_FILE, serials);

    res.json({ success: true });
});

// シリアル使用 → 残り回数増加
app.post("/api/useSerial", (req, res) => {
    const { user, code } = req.body;
    if (!user || !code) return res.status(400).json({ error: "不正なリクエスト" });

    const entry = serials.find(s => s.code === code);
    if (!entry) return res.status(400).json({ error: "存在しないコード" });

    // 使用した分は削除（v7.6仕様）
    serials = serials.filter(s => s !== entry);
    saveJSON(SERIAL_FILE, serials);

    if (!users[user]) users[user] = { spins: 0, collection: [] };
    users[user].spins += entry.spins;
    saveJSON(USERS_FILE, users);

    res.json({ success: true, spins: users[user].spins });
});

// ---------- 残り回数取得 ----------
app.get("/api/spins", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).json({ error: "userなし" });

    if (!users[user]) users[user] = { spins: 0, collection: [] };
    res.json({ spins: users[user].spins });
});

// ---------- ガチャ実行 ----------
app.post("/api/spin", (req, res) => {
    const { user } = req.body;
    if (!user) return res.status(400).json({ error: "userなし" });

    if (!users[user]) users[user] = { spins: 0, collection: [] };
    if (users[user].spins <= 0) return res.status(400).json({ error: "回数0" });

    users[user].spins--;
    saveJSON(USERS_FILE, users);

    if (prizes.length === 0) return res.status(400).json({ error: "no_prize" });

    // 完全ランダム（v7.6）
    const prize = prizes[Math.floor(Math.random() * prizes.length)];

    // コレクション追加（重複OK）
    users[user].collection.push(prize.id);
    saveJSON(USERS_FILE, users);

    res.json({
        spins: users[user].spins,
        prize
    });
});

// ---------- マイコレ ----------
app.get("/api/collection", (req, res) => {
    const user = req.query.user;
    if (!user) return res.status(400).json({ error: "userなし" });

    if (!users[user]) users[user] = { spins: 0, collection: [] };

    const collected = users[user].collection.map(id => prizes.find(p => p.id === id));
    res.json(collected);
});

// ---------- 景品登録 ----------
app.post("/api/admin/prizes", (req, res) => {
    if (!req.files || !req.files.video || !req.body.rarity)
        return res.status(400).json({ error: "ファイル不足" });

    const video = req.files.video;
    const id = Date.now();
    const ext = path.extname(video.name);
    const fileName = `${id}${ext}`;

    // 保存先
    const savePath = `./public/videos/${fileName}`;
    if (!fs.existsSync("./public/videos")) fs.mkdirSync("./public/videos");

    video.mv(savePath);

    const newPrize = {
        id,
        rarity: req.body.rarity,
        video: `/videos/${fileName}`,
        thumbnail: req.body.thumbnail || ""
    };

    prizes.push(newPrize);
    saveJSON(PRIZES_FILE, prizes);

    res.json({ success: true, prize: newPrize });
});

// ---------- 景品一覧 ----------
app.get("/api/admin/prizes", (req, res) => {
    res.json(prizes);
});

// ---------- サーバー起動 ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running on " + PORT));
