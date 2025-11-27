/* =========================================================
   app.js（最新＋コンプリート表示＋bonus動画対応）
========================================================= */

const $ = (s)=>document.querySelector(s);

/* ---------- Safe JSON ---------- */
async function safeJson(res){
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")){
    try { return await res.json(); }
    catch { return { ok:false, error:"Invalid JSON" }; }
  }
  const text = await res.text();
  return { ok:false, error:text };
}

async function api(url,opt={}){
  try{
    const r = await fetch(url,{ headers:{'Content-Type':'application/json'}, ...opt });
    return await safeJson(r);
  }catch(e){
    return { ok:false, error:String(e) };
  }
}

/* ---------- Device ID ---------- */
function ensureDeviceId(){
  let id = localStorage.getItem("deviceId");
  if (!id){
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}
const deviceId = ensureDeviceId();

/* ---------- Stop videos ---------- */
function stopStageVideos(){
  for (const id of ["rarity-anim","result-video"]){
    const v = document.getElementById(id);
    v.pause();
    v.currentTime = 0;
    v.classList.add("hidden");
  }
  $("#gacha-illust").classList.remove("hidden");
}

/* ---------- Tabs ---------- */
function switchTo(tab){
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
  document.querySelector("#tab-"+tab)?.classList.add("active");

  if (tab==="gacha") { stopStageVideos(); loadSpins(); updateCompleteStatus(); }
  if (tab==="collection") loadCollection();
  if (tab==="admin") { renderPrizeList(); loadSerials(); loadRarityWeights(); }
}

$("#tabs").addEventListener("click",e=>{
  if (e.target.tagName!=="BUTTON") return;
  const t = e.target.dataset.tab;
  if (t==="admin" && !sessionStorage.getItem("adminToken")){
    alert("最初に管理ログインしてください");
    return;
  }
  switchTo(t);
});

/* ---------- Admin Login ---------- */
async function adminToken(){
  let t = sessionStorage.getItem("adminToken");
  if (t) return t;

  const pass = prompt("管理パスワードを入力");
  if (!pass) return null;

  const r = await fetch("/api/admin/login",{
    method:"POST",
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ password:pass })
  });

  const j = await safeJson(r);
  if (!r.ok || !j.token){
    alert(j.error || "認証失敗");
    return null;
  }

  sessionStorage.setItem("adminToken", j.token);
  document.body.classList.add("admin-visible");
  $("#btn-admin-login").classList.add("hidden");
  $("#btn-admin-logout").classList.remove("hidden");

  switchTo("admin");
  return j.token;
}

$("#btn-admin-login").addEventListener("click", adminToken);
$("#btn-admin-logout").addEventListener("click", ()=>{
  sessionStorage.removeItem("adminToken");
  document.body.classList.remove("admin-visible");
  $("#btn-admin-login").classList.remove("hidden");
  $("#btn-admin-logout").classList.add("hidden");
  switchTo("gacha");
});

/* ---------- Spins load ---------- */
async function loadSpins(){
  const j = await api(`/api/device?deviceId=${deviceId}`);
  if (j.spins != null) $("#spins").textContent = j.spins;
}

/* =========================================================
   ★ コンプリート状況
========================================================= */
async function updateCompleteStatus(){
  const box = $("#complete-status");
  const bonusBtn = $("#btn-bonus");

  const j = await api(`/api/complete-status?deviceId=${deviceId}`);
  if (!j.ok){
    box.textContent = "";
    bonusBtn.classList.add("hidden");
    return;
  }

  if (j.completed){
    box.textContent = "コンプリートおめでとう！！特別景品をプレゼントするね！";
    box.style.color = "gold";
    if (j.hasBonus) bonusBtn.classList.remove("hidden");
    return;
  }

  // 残り種類
  box.textContent = `コンプリートまで残り ${j.remain} 種類！`;

  if (j.remain <= 10){
    box.style.color = "red";
  }else{
    box.style.color = "black";
  }

  bonusBtn.classList.add("hidden");
}

/* =========================================================
   ★ 特別景品 再生
========================================================= */
$("#btn-bonus").addEventListener("click", async()=>{
  stopStageVideos();

  const r = await api("/api/bonus");
  if (!r.ok){
    alert("特別景品がありません");
    return;
  }

  const result = $("#result-video");
  $("#gacha-illust").classList.add("hidden");

  result.src = r.url;
  result.classList.remove("hidden");
  result.currentTime = 0;
  result.play();
});

/* =========================================================
   ★ 1回ガチャ
========================================================= */
$("#btn-roll").addEventListener("click", async()=>{
  stopStageVideos();

  const res = await api("/api/spin",{
    method:"POST",
    body:JSON.stringify({ deviceId })
  });

  if (!res.ok) return alert(res.error);

  await loadSpins();
  await updateCompleteStatus();

  const rarity = res.prize.rarity;
  const anim = $("#rarity-anim");
  const result = $("#result-video");

  const sfx = new Audio(`sfx/${rarity}.mp3`);
  anim.src = `animations/${rarity}.mp4`;

  $("#gacha-illust").classList.add("hidden");
  anim.classList.remove("hidden");
  anim.muted = false;

  anim.play().catch(()=>{});
  setTimeout(()=>sfx.play().catch(()=>{}), 300);

  anim.onended = ()=>{
    anim.classList.add("hidden");
    sfx.pause();

    result.src = res.prize.video_url;
    result.classList.remove("hidden");
    result.currentTime = 0;
    result.play();

    result.onended = ()=>{
      result.classList.add("hidden");
      $("#gacha-illust").classList.remove("hidden");
    };
  };
});

/* =========================================================
   ★ 10回ガチャ
========================================================= */
$("#btn-roll10").addEventListener("click", async()=>{

  const spins = Number($("#spins").textContent);
  if (spins < 10){
    alert("回数が足りません");
    return;
  }

  $("#btn-roll").disabled = true;
  $("#btn-roll10").disabled = true;

  for (let i=0;i<10;i++){

    stopStageVideos();

    const res = await api("/api/spin",{
      method:"POST",
      body:JSON.stringify({ deviceId })
    });

    if (!res.ok){
      alert(res.error);
      break;
    }

    await loadSpins();
    await updateCompleteStatus();

    const rarity = res.prize.rarity;
    const anim = $("#rarity-anim");
    const result = $("#result-video");

    const sfx = new Audio(`sfx/${rarity}.mp3`);
    anim.src = `animations/${rarity}.mp4`;

    $("#gacha-illust").classList.add("hidden");
    anim.classList.remove("hidden");

    await anim.play().catch(()=>{});
    setTimeout(()=>sfx.play().catch(()=>{}),300);

    await new Promise(r=>{
      anim.onended = ()=>{
        anim.classList.add("hidden");
        sfx.pause();
        r();
      };
    });

    // マイコレで重複チェック
    const col = await api(`/api/my-collection?deviceId=${deviceId}`);
    const owned = col.filter(p=>p.video_path === res.prize.file)[0]?.owned_count || 1;
    const duplicate = owned >= 2;

    result.src = res.prize.video_url;
    result.classList.remove("hidden");
    result.currentTime = 0;
    result.play();

    if (duplicate){
      await new Promise(r=>setTimeout(r,2000));
      result.pause();
      result.classList.add("hidden");
    }else{
      await new Promise(r=>{
        result.onended = ()=>{
          result.classList.add("hidden");
          r();
        };
      });
    }

    $("#gacha-illust").classList.remove("hidden");
  }

  $("#btn-roll").disabled = false;
  $("#btn-roll10").disabled = false;
});

/* =========================================================
   Serial Redeem
========================================================= */
$("#btn-redeem").addEventListener("click", async()=>{
  const code = $("#serial").value.trim();
  if (!code) return alert("コードを入力してね");

  const r = await api("/api/redeem-serial",{
    method:"POST",
    body:JSON.stringify({ code, deviceId })
  });

  if (r.ok){
    alert("追加したよ！");
    await loadSpins();
  }else{
    alert(r.error);
  }
});

/* =========================================================
   Serial List
========================================================= */
async function loadSerials(){
  const wrap = $("#serial-list");
  wrap.textContent = "読み込み中...";

  const token = sessionStorage.getItem("adminToken") || await adminToken();
  if (!token){
    wrap.textContent = "ログインしてね";
    return;
  }

  const r = await fetch("/api/admin/serials",{ headers:{Authorization:"Bearer "+token} });
  const rows = await safeJson(r);

  const table = document.createElement("table");
  table.className = "serial-list-table";
  table.innerHTML = `
    <thead><tr>
      <th>コード</th><th>回数</th><th>使用</th>
      <th>端末</th><th>日時</th>
    </tr></thead><tbody></tbody>
  `;

  const tb = table.querySelector("tbody");
  rows.forEach(x=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${x.code}</td>
      <td>${x.spins}</td>
      <td>${x.used?"済":"未"}</td>
      <td>${x.used_by_device||"-"}</td>
      <td>${x.used_at||"-"}</td>
    `;
    tb.appendChild(tr);
  });

  wrap.innerHTML = "";
  wrap.appendChild(table);
}

/* =========================================================
   景品 Upload
========================================================= */
$("#form-prize").addEventListener("submit", async(e)=>{
  e.preventDefault();

  const token = await adminToken();
  if (!token) return;

  const fd = new FormData();
  fd.append("rarity", $("#p-rarity").value);
  fd.append("video", $("#p-video").files[0]);

  const r = await fetch("/api/admin/prizes/create",{
    method:"POST",
    headers:{Authorization:"Bearer "+token},
    body: fd
  });

  const j = await safeJson(r);
  alert(j.ok?"登録したよ！":j.error);
  renderPrizeList();
});

/* =========================================================
   特別景品 Upload
========================================================= */
$("#form-bonus").addEventListener("submit", async e=>{
  e.preventDefault();

  const token = await adminToken();
  if (!token) return;

  const fd = new FormData();
  fd.append("bonus", $("#bonus-file").files[0]);

  const r = await fetch("/api/admin/bonus/upload",{
    method:"POST",
    headers:{Authorization:"Bearer "+token},
    body: fd
  });

  const j = await safeJson(r);
  $("#bonus-upload-status").textContent = j.ok ? "アップロード完了！" : j.error;
});

/* =========================================================
   美化：賞品一覧
========================================================= */
async function renderPrizeList(){
  const wrap = $("#prize-list");
  wrap.textContent = "読み込み中...";

  const token = sessionStorage.getItem("adminToken") || await adminToken();
  if (!token){
    wrap.textContent = "ログイン必要";
    return;
  }

  const r = await fetch("/api/admin/prizes",{ headers:{Authorization:"Bearer "+token} });
  const rows = await safeJson(r);

  if (!Array.isArray(rows)){
    wrap.textContent = "読み込み失敗";
    return;
  }

  const t = document.createElement("table");
  t.className = "table";
  t.innerHTML = `
    <thead><tr>
      <th>ID</th><th>レア</th><th>動画</th><th>有効</th><th>プレビュー</th><th>操作</th>
    </tr></thead>
    <tbody></tbody>
  `;

  const tb = t.querySelector("tbody");

  rows.forEach(r=>{
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.id}</td>

      <td>
        <select class="raritySel">
          ${["normal","common","rare","superrare"]
            .map(x=>`<option value="${x}" ${r.rarity===x?"selected":""}>${x}</option>`)
            .join("")}
        </select>
      </td>

      <td><input type="file" class="videoFile" accept="video/*"></td>

      <td><input type="checkbox" class="enChk" ${r.enabled?"checked":""}></td>

      <td><span class="badge">${r.video_path}</span></td>

      <td class="actions">
        <button class="secondary btn-save">保存</button>
        <button class="secondary btn-del">削除</button>
      </td>
    `;

    const sel = tr.querySelector(".raritySel");
    const file = tr.querySelector(".videoFile");
    const chk = tr.querySelector(".enChk");

    tr.querySelector(".btn-save").addEventListener("click", async()=>{
      const fd = new FormData();
      fd.append("id", r.id);
      fd.append("rarity", sel.value);
      fd.append("enabled", chk.checked ? 1 : 0);
      if (file.files[0]) fd.append("video", file.files[0]);

      const resp = await fetch("/api/admin/prizes/update",{
        method:"POST",
        headers:{Authorization:"Bearer "+token},
        body:fd
      });
      const j = await safeJson(resp);
      alert(j.ok?"保存したよ！":j.error);
      renderPrizeList();
    });

    tr.querySelector(".btn-del").addEventListener("click", async()=>{
      if (!confirm("削除していい？")) return;
      const resp = await fetch("/api/admin/prizes/delete",{
        method:"POST",
        headers:{
          Authorization:"Bearer "+token,
          "Content-Type":"application/json"
        },
        body:JSON.stringify({ id:r.id })
      });
      const j = await safeJson(resp);
      alert(j.ok?"消したよ！":j.error);
      renderPrizeList();
    });

    tb.appendChild(tr);
  });

  wrap.innerHTML = "";
  wrap.appendChild(t);
}

/* =========================================================
   レアリティ重み 読込・保存
========================================================= */
async function loadRarityWeights(){
  const token = sessionStorage.getItem("adminToken") || await adminToken();
  if (!token) return;

  const r = await fetch("/api/admin/rarity-weights",{ headers:{Authorization:"Bearer "+token} });
  const j = await safeJson(r);

  if (!j.ok) return;

  $("#rw-normal").value = j.data.normal;
  $("#rw-common").value = j.data.common;
  $("#rw-rare").value = j.data.rare;
  $("#rw-superrare").value = j.data.superrare;
}

$("#btn-save-rarity").addEventListener("click", async()=>{
  const token = await adminToken();
  if (!token) return;

  const payload = {
    normal:+$("#rw-normal").value,
    common:+$("#rw-common").value,
    rare:+$("#rw-rare").value,
    superrare:+$("#rw-superrare").value,
  };

  const r = await fetch("/api/admin/rarity-weights/update",{
    method:"POST",
    headers:{
      Authorization:"Bearer "+token,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });

  const j = await safeJson(r);
  alert(j.ok?"保存した！":j.error);
});

/* =========================================================
   コレクション
========================================================= */
async function loadCollection(){
  const list = $("#collection-list");
  list.innerHTML = "<li>読み込み中...</li>";

  const rows = await api(`/api/my-collection?deviceId=${deviceId}`);
  if (!rows.length){
    list.innerHTML = "<li>まだありません</li>";
    return;
  }

  list.innerHTML = "";
  rows.forEach(r=>{
    const li = document.createElement("li");

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = `${r.rarity} / ${r.obtained_at}`;

    const v = document.createElement("video");
    v.src = `/uploads/${r.video_path}`;
    v.controls = true;

    li.append(meta, v);
    list.appendChild(li);
  });
}

/* initial load */
loadSpins();
updateCompleteStatus();
