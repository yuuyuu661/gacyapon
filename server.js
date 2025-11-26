import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------------
// Static files
// --------------------------------------------------------
app.use(express.static(path.join(__dirname, "public")));

// --------------------------------------------------------
// DB file
// --------------------------------------------------------
const DB_PATH = path.join(__dirname, "data.json");

// --------------------------------------------------------
// Load DB
// --------------------------------------------------------
function loadDB() {
    if (!fs.existsSync(DB_PATH)) {
        return {
            users: {},
            prizes: [],
            serials: []
        };
    }
    return JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
}

// --------------------------------------------------------
// Save DB
// --------------------------------------------------------
function saveDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

// --------------------------------------------------------
// Get spins
// --------------------------------------------------------
app.get("/api/spins", (req, res) => {
    const user = req.query.user;
    const db = loadDB();

    if (!db.users[user]) db.users[user] = { spins: 0 };

    return res.json({ spins: db.users[user].spins });
});

// --------------------------------------------------------
// Spin gacha
// --------------------------------------------------------
app.get("/api/spin", (req, res) => {
    const user = req.query.user;
    const count = Number(req.query.count || 1);

    const db = loadDB();

    if (!db.users[user]) db.users[user] = { spins: 0 };

    if (db.users[user].spins < count) {
        return res.status(400).json({ error: "not enough spins" });
    }

    db.users[user].spins -= count;

    const prize = db.prizes.length
        ? db.prizes[Math.floor(Math.random() * db.prizes.length)]
        : null;

    saveDB(db);

    return res.json({
        success: true,
        spins: db.users[user].spins,
        prize: prize
    });
});

// --------------------------------------------------------
// Issue serial (admin)
// --------------------------------------------------------
app.post("/api/admin/serials/issue", (req, res) => {
    const { code, amount } = req.body;

    if (!code) {
        return res.status(400).json({ error: "code required" });
    }

    const db = loadDB();

    db.serials.push({
        id: Date.now(),
        code,
        amount: Number(amount || 1),
        used: false,
        usedAt: null
    });

    saveDB(db);

    return res.json({ success: true });
});

// --------------------------------------------------------
// Redeem serial
// --------------------------------------------------------
app.post("/api/redeem-serial", (req, res) => {
    const { user, code } = req.body;

    if (!code) {
        return res.status(400).json({ error: "invalid serial" });
    }

    const db = loadDB();

    if (!db.users[user]) db.users[user] = { spins: 0 };

    const serial = db.serials.find(
        (s) => s.code === code && s.used === false
    );

    if (!serial) {
        return res.status(400).json({ error: "invalid or used serial" });
    }

    serial.used = true;
    serial.usedAt = Date.now();

    db.users[user].spins += serial.amount;

    saveDB(db);

    return res.json({
        success: true,
        added: serial.amount,
        spins: db.users[user].spins
    });
});

// --------------------------------------------------------
// Register prize
// --------------------------------------------------------
app.post("/api/admin/prizes", (req, res) => {
    const { name, rarity, url } = req.body;

    if (!name || !rarity || !url) {
        return res.status(400).json({ error: "missing fields" });
    }

    const db = loadDB();

    db.prizes.push({
        id: Date.now(),
        name,
        rarity,
        url
    });

    saveDB(db);

    return res.json({ success: true });
});

// --------------------------------------------------------
// Get all prizes
// --------------------------------------------------------
app.get("/api/collection", (req, res) => {
    const db = loadDB();
    return res.json(db.prizes || []);
});

// --------------------------------------------------------
// Admin login
// --------------------------------------------------------
app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;

    if (password === process.env.ADMIN_PASSWORD) {
        return res.json({ success: true });
    }

    return res.status(400).json({ success: false });
});

// --------------------------------------------------------
// Start server
// --------------------------------------------------------
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
