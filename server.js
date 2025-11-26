//------------------------------------------------------------
// server.js  v7.3  （ガチャポン完全フル版）
//------------------------------------------------------------

import express from "express";
import fileUpload from "express-fileupload";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// 公開フォルダ
app.use(express.static("public"));

// データ保存フォルダ
const DATA_DIR = "./data";
const PRIZE_DIR = "./public/prizes";

// 必要なら作成
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(PRIZE_DIR)) fs.mkdirSync(PRIZE_DIR);

// JSONロード/保存関数
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
// ▼ DB 定義
//------------------------------------------------------------
let devices = load("devices.json", {});      // deviceId → {spins}
let prizes = load("prizes.json", []);        // [{id, rarity, video_path}]
let collections = load("collections.json", []); // [{deviceId, video_path, rarity}]
let serials = load("serials.json", []);      // [{code, spins, used, usedAt}]
let rates = load("rates.json", {
    superrare: 2,
    rare: 20,
    common: 50,
    normal: 28
});

//------------------------------------------------------------
// ▼ 認証（管理パスワード）
//------------------------------------------------------------
const ADMIN_PASS = process.env.ADMIN_PASS || "admin";

app.post("/api/admin/login", (req, res) => {
    if (req.body.password !== ADMIN_PASS) {
        return res.json({ ok: false });
    }
    res.json({ ok: true });
});

//------------------------------------------------------------
// ▼ デバイス情報取得
//------------------------------------------------------------
app.get("/api/device", (req, res) => {
    const id = req.query.deviceId;
    if (!devices[id]) devices[id] = { spins: 0 };
    save("devices.json", devices);

    res.json(devices[id]);
});

//------------------------------------------------------------
// ▼ シリアルコード使用（回数追加）
//------------------------------------------------------------
app.post("/api/redeem-serial", (req, res) => {
    const { code, deviceId } = req.body;
    const s = serials.find(x => x.code === code);

    if (!s) return res.json({ ok: false, error: "存在しないコード" });

    if (s.used)
        return res.json({ ok: false, error: "使用済みコードです" });

    // 回数追加
    if (!devices[deviceId]) devices[deviceId] = { spins: 0 };
    devices[deviceId].spins += s.spins;

    s.used = true;
    s.usedAt = new Date().toISOString();

    save("devices.json", devices);
    save("serials.json", serials);

    res.json({ ok: true, spins: devices[deviceId].spins });
});

//------------------------------------------------------------
// ▼ シリアルコード発行（好きな文字列）
//------------------------------------------------------------
app.post("/api/admin/serials/issue", (req, res) => {
    const { code, spins } = req.body;

    if (!code || !spins) {
        return res.status(400).json({ ok: false, error: "必要項目が空です" });
    }

    serials.push({
        code,
        spins,
        used: false,
        usedAt: null
    });

    save("serials.json", serials);

    res.json({ ok: true });
});

// シリアルログ
app.get("/api/admin/serials", (req, res) => {
    res.json(serials.slice(-10).reverse());
});

//------------------------------------------------------------
// ▼ 景品一覧
//------------------------------------------------------------
app.get("/api/admin/prizes", (req, res) => {
    res.json(prizes);
});

//------------------------------------------------------------
// ▼ 景品登録（動画アップロード）
//------------------------------------------------------------
app.post("/api/admin/prizes", async (req, res) => {
    const rarity = req.body.rarity;
    const file = req.files?.file;

    if (!rarity || !file) {
        return res.json({ ok: false, error: "動画ファイルがありません" });
    }

    const filename = `${Date.now()}_${file.name}`;
    const savePath = `${PRIZE_DIR}/${filename}`;
    await file.mv(savePath);

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
    const list = collections.filter(c => c.deviceId === deviceId);
    res.json(list);
});

//------------------------------------------------------------
// ★ レア度抽選ロジック
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

    if (!prize) {
        return res.json({ ok: false, error: "no prize" });
    }

    const collection = collections.find(
        x => x.deviceId === deviceId && x.video_path === prize.video_path
    );
    const already = Boolean(collection);

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

        const existing = collections.find(
            x => x.deviceId === deviceId && x.video_path === prize.video_path
        );
        const already = Boolean(existing);

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
// ▼ レア度確率保存
//------------------------------------------------------------
app.post("/api/admin/rates", (req, res) => {
    rates = req.body;
    save("rates.json", rates);
    res.json({ ok: true });
});

//------------------------------------------------------------
app.listen(PORT, () => {
    console.log("Gachapon server running on port", PORT);
});
