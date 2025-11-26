//------------------------------------------------------------
//  server.js v7.6  (ガチャポン完全安定版 / Railway対応)
//------------------------------------------------------------

import express from "express";
import fileUpload from "express-fileupload";
import cors from "cors";
import fs from "fs";
import path from "path";

//------------------------------------------------------------
// Express 基本設定
//------------------------------------------------------------
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(fileUpload());

//------------------------------------------------------------
// ★ 永続化フォルダ設定（Railway でも消えない）
//------------------------------------------------------------
const DATA_DIR = "./";  // ← これが決定打（永続化される）

//------------------------------------------------------------
// ▼ public/prizes フォルダを必ず作成（Railway対策）
//------------------------------------------------------------
const PUBLIC_DIR = "./public";
const PRIZE_DIR = "./public/prizes";

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR);
if (!fs.existsSync(PRIZE_DIR)) fs.mkdirSync(PRIZE_DIR);

// 公開フォルダ
app.use(express.static("public"));

//------------------------------------------------------------
// JSON  LOAD / SAVE
//------------------------------------------------------------
function load(file, fallback) {
    try {
        return JSON.parse(fs.readFileSync(`${DATA_DIR}/${file}`, "utf8"));
    } catch {
        return fallback;
    }
}

function save(file, data) {
    fs.writeFileSync(`${DATA_DIR}/${file}`, JSON.stringify(data, null, 2));
}

//------------------------------------------------------------
// データロード
//------------------------------------------------------------
let devices     = load("devices.json", {});       // deviceId → spins
let prizes      = load("prizes.json", []);        // 景品
let collections = load("collections.json", []);   // マイコレ
let serials     = load("serials.json", []);       // シリアル
let rates       = load("rates.json", {
    superrare: 2,
    rare: 20,
    common: 50,
    normal: 28
});

//------------------------------------------------------------
// 管理パスワード
//------------------------------------------------------------
const ADMIN_PASS = process.env.ADMIN_PASS || "admin";

//------------------------------------------------------------
// 管理ログイン
//------------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
    if (req.body.password !== ADMIN_PASS) {
        return res.json({ ok: false });
    }
    res.json({ ok: true });
});

//------------------------------------------------------------
// デバイス情報
//------------------------------------------------------------
app.get("/api/device", (req, res) => {
    const id = req.query.deviceId;

    if (!devices[id]) devices[id] = { spins: 0 };

    save("devices.json", devices);
    res.json(devices[id]);
});

//------------------------------------------------------------
// ▼ シリアル「使用」
//   - 同名でも複数発行OK
//   - 最新の未使用コードを優先使用
//------------------------------------------------------------
app.post("/api/redeem-serial", (req, res) => {
    const { code, deviceId } = req.body;

    // 最新の未使用コードを抽出
    const s = serials
        .filter(x => x.code === code && !x.used)
        .sort((a, b) => b.id - a.id)[0];

    if (!s) {
        return res.json({ ok: false, error: "使用可能なコードがありません" });
    }

    if (!devices[deviceId]) devices[deviceId] = { spins: 0 };

    devices[deviceId].spins += s.spins;

    s.used = true;
    s.usedAt = new Date().toISOString();

    save("devices.json", devices);
    save("serials.json", serials);

    res.json({ ok: true, spins: devices[deviceId].spins });
});

//------------------------------------------------------------
// ▼ シリアル「発行」（同じ文字でも無限に発行OK）
//------------------------------------------------------------
app.post("/api/admin/serials/issue", (req, res) => {
    const { code, spins } = req.body;

    if (!code || !spins) {
        return res.status(400).json({ ok: false, error: "必要項目が空です" });
    }

    serials.push({
        id: Date.now(),  // ← ユニークID
        code,
        spins,
        used: false,
        usedAt: null
    });

    save("serials.json", serials);

    res.json({ ok: true });
});

// 直近ログ10件
app.get("/api/admin/serials", (req, res) => {
    res.json(serials.slice(-10).reverse());
});

//------------------------------------------------------------
// ▼ 景品一覧取得
//------------------------------------------------------------
app.get("/api/admin/prizes", (req, res) => {
    res.json(prizes);
});

//------------------------------------------------------------
// ▼ 景品登録（動画アップロード）
//   public/prizes/ に保存される（永続化OK）
//------------------------------------------------------------
app.post("/api/admin/prizes", async (req, res) => {
    const file = req.files?.file;
    const rarity = req.body.rarity;

    if (!file || !rarity) {
        return res.json({ ok: false, error: "ファイルまたはレア度がありません" });
    }

    const filename = `${Date.now()}_${file.name}`;
    const savePath = `${PRIZE_DIR}/${filename}`;

    try {
        await file.mv(savePath);
    } catch (err) {
        console.error("File Upload Error:", err);
        return res.json({ ok: false, error: "アップロードに失敗しました" });
    }

    prizes.push({
        id: Date.now(),
        rarity,
        video_path: `/prizes/${filename}`
    });

    save("prizes.json", prizes);

    res.json({ ok: true });
});

//------------------------------------------------------------
// ▼ マイコレ取得
//------------------------------------------------------------
app.get("/api/my-collection", (req, res) => {
    const deviceId = req.query.deviceId;
    const list = collections.filter(x => x.deviceId === deviceId);
    res.json(list);
});

//------------------------------------------------------------
// レア度抽選
//------------------------------------------------------------
function getRarityByRate() {
    const r = Math.random() * 100;

    if (r < rates.superrare) return "superrare";
    if (r < rates.superrare + rates.rare) return "rare";
    if (r < rates.superrare + rates.rare + rates.common) return "common";
    return "normal";
}

// ランダム景品取得
function pickPrize(rarity) {
    const list = prizes.filter(p => p.rarity === rarity);
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

//------------------------------------------------------------
// ▼ 単発ガチャ
//------------------------------------------------------------
app.post("/api/spin", (req, res) => {
    const deviceId = req.body.deviceId;

    if (!devices[deviceId] || devices[deviceId].spins <= 0) {
        return res.json({ ok: false, error: "回数がありません" });
    }

    devices[deviceId].spins--;
    save("devices.json", devices);

    const rarity = getRarityByRate();
    const prize = pickPrize(rarity);

    if (!prize) return res.json({ ok: false, error: "no prize" });

    const exists = collections.find(
        x => x.deviceId === deviceId && x.video_path === prize.video_path
    );

    const already = Boolean(exists);

    if (!already) {
        collections.push({
            deviceId,
            rarity,
            video_path: prize.video_path,
            url: prize.video_path
        });
        save("collections.json", collections);
    }

    res.json({
        ok: true,
        rarity,
        effect: `/effects/video/${rarity}.mp4`,
        prize: {
            rarity,
            video_path: prize.video_path,
            url: prize.video_path,
            already
        }
    });
});

//------------------------------------------------------------
// ▼ 10連ガチャ
//------------------------------------------------------------
app.post("/api/spin10", (req, res) => {
    const deviceId = req.body.deviceId;

    if (!devices[deviceId] || devices[deviceId].spins < 10) {
        return res.json({ ok: false, error: "回数が足りません" });
    }

    devices[deviceId].spins -= 10;
    save("devices.json", devices);

    const results = [];

    for (let i = 0; i < 10; i++) {
        const rarity = getRarityByRate();
        const prize = pickPrize(rarity);

        if (!prize) {
            results.push({ error: "no prize" });
            continue;
        }

        const exists = collections.find(
            x => x.deviceId === deviceId && x.video_path === prize.video_path
        );

        const already = Boolean(exists);

        if (!already) {
            collections.push({
                deviceId,
                rarity,
                video_path: prize.video_path,
                url: prize.video_path
            });
        }

        results.push({
            rarity,
            effect: `/effects/video/${rarity}.mp4`,
            prize: {
                rarity,
                video_path: prize.video_path,
                url: prize.video_path,
                already
            }
        });
    }

    save("collections.json", collections);

    res.json({ ok: true, results });
});

//------------------------------------------------------------
// ▼ レア度確率
//------------------------------------------------------------
app.get("/api/admin/rates", (req, res) => {
    res.json(rates);
});

app.post("/api/admin/rates", (req, res) => {
    rates = req.body;
    save("rates.json", rates);
    res.json({ ok: true });
});

//------------------------------------------------------------
app.listen(PORT, () => {
    console.log("Gachapon server running on port", PORT);
});
