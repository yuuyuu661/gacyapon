document.addEventListener("DOMContentLoaded", () => {
    const spinBtn = document.getElementById("spinButton");
    const spin10Btn = document.getElementById("spin10Button");
    const addSerialBtn = document.getElementById("serialAddButton");
    const adminLoginBtn = document.getElementById("adminLoginBtn");

    const serialInput = document.getElementById("serialInput");
    const remainSpan = document.getElementById("remainCount");

    const API = "/api";

    // ==========================
    //  残り回数読み込み
    // ==========================
    async function loadSpins() {
        const res = await fetch(`${API}/spins?user=default`);
        const data = await res.json();

        remainSpan.textContent = data.spins ?? 0;
    }

    loadSpins();

    // ==========================
    //  シリアル入力 → 回数追加
    // ==========================
    addSerialBtn.addEventListener("click", async () => {
        const code = serialInput.value.trim();
        if (!code) {
            alert("シリアルコードを入力してください！");
            return;
        }

        const res = await fetch(`${API}/redeem-serial`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user: "default", code })
        });

        if (!res.ok) {
            alert("コードが無効です！");
            return;
        }

        const data = await res.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        alert("回数が追加されました！");
        serialInput.value = "";
        loadSpins();
    });

    // ==========================
    //  単発ガチャ
    // ==========================
    spinBtn.addEventListener("click", async () => {
        const remain = Number(remainSpan.textContent);

        if (remain < 1) {
            alert("回数が足りません");
            return;
        }

        await playGacha(1);
        loadSpins();
    });

    // ==========================
    //  10連ガチャ（アラート1回だけ）
    // ==========================
    spin10Btn.addEventListener("click", async () => {
        const remain = Number(remainSpan.textContent);

        if (remain < 10) {
            alert("回数が足りません（10連には10回必要です）");
            return;
        }

        await playGacha(10);
        loadSpins();
    });

    // ==========================
    //  ガチャ本体
    // ==========================
    async function playGacha(count) {
        const res = await fetch(`${API}/spin?count=${count}&user=default`);
        const data = await res.json();

        if (data.error) {
            alert(data.error);
            return;
        }

        console.log("ガチャ結果:", data);
        // ここで演出 → 景品動画処理
    }

    // ==========================
    //  管理ログイン
    // ==========================
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener("click", async () => {
            const pwd = document.getElementById("adminPassword").value.trim();
            if (!pwd) {
                alert("パスワードを入力してください");
                return;
            }

            const res = await fetch(`${API}/admin/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pwd })
            });

            if (!res.ok) {
                alert("ログイン失敗");
                return;
            }

            const data = await res.json();
            if (data.success) {
                alert("ログイン成功！");
                document.getElementById("adminPanel").style.display = "block";
            } else {
                alert("パスワードが違います");
            }
        });
    }
});
