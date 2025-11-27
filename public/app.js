/* =========================================================
   app.js（最新版）
   ・レアリティ抽選
   ・管理ログイン（prompt）
   ・10連ガチャ
   ・かぶりは2秒スキップ
   ・初獲得はフル再生
   ========================================================= */

const $ = (sel) => document.querySelector(sel);

/* ---------- Safe JSON ---------- */
async function safeJson(res){
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { return await res.json(); }
    catch { return { ok:false, error:'Invalid JSON', status: res.status }; }
  } else {
    const text = await res.text().catch(()=> '');
    return { ok:false, error: text || ('HTTP '+res.status), status: res.status };
  }
}

async function api(url, opt = {}){
  try {
    const r = await fetch(url, { headers:{'Content-Type':'application/json'}, ...opt });
    const data = await safeJson(r);
    if (!r.ok && data && !data.error) data.error = 'HTTP '+r.status;
    return data;
  } catch (e){
    return { ok:false, error:String(e) };
  }
}

/* ---------- Tabs ---------- */
function stopStageVideos(){
  ['rarity-anim','result-video'].forEach(id=>{
    const v = document.getElementById(id);
    v.pause?.();
    v.currentTime = 0;
    v.classList.add('hidden');
  });
  $('#gacha-illust').classList.remove('hidden');
}

function switchTo(tabName){
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  const target = document.querySelector(`#tab-${tabName}`);
  if (target) target.classList.add('active');

  if (tabName === 'collection') loadCollection();
  if (tabName === 'gacha') { stopStageVideos(); loadSpins(); }
  if (tabName === 'admin') {
    renderPrizeList();
    loadSerials();
    loadRarityWeights();
  }
}

document.getElementById('tabs').addEventListener('click', (e)=>{
  if (e.target.tagName !== 'BUTTON') return;
  const tab = e.target.dataset.tab;

  if (tab === 'admin' && !sessionStorage.getItem('adminToken')){
    alert('最初に「管理ログイン」してください');
    return;
  }
  switchTo(tab);
});

/* ---------- Device ID ---------- */
function ensureDeviceId(){
  let id = localStorage.getItem('deviceId');
  if (!id){
    id = (crypto && crypto.randomUUID) ? crypto.randomUUID() :
        (Date.now()+'-'+Math.random().toString(36).slice(2));
    localStorage.setItem('deviceId', id);
  }
  return id;
}
const deviceId = ensureDeviceId();

/* ---------- Admin Login ---------- */
async function adminToken(){
  let token = sessionStorage.getItem('adminToken');
  if (token) return token;

  const pass = prompt('管理パスワードを入力');
  if (!pass) return null;

  let r;
  try {
    r = await fetch('/api/admin/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({password: pass})
    });
  } catch (e){
    alert('接続に失敗: '+e);
    return null;
  }

  const j = await safeJson(r);
  if (!r.ok || !j.token){
    alert(j.error || '認証失敗');
    return null;
  }

  sessionStorage.setItem('adminToken', j.token);
  document.body.classList.add('admin-visible');
  $('#btn-admin-login').classList.add('hidden');
  $('#btn-admin-logout').classList.remove('hidden');
  switchTo('admin');
  return j.token;
}

function adminLogout(){
  sessionStorage.removeItem('adminToken');
  document.body.classList.remove('admin-visible');
  $('#btn-admin-login').classList.remove('hidden');
  $('#btn-admin-logout').classList.add('hidden');
  switchTo('gacha');
}
$('#btn-admin-login').addEventListener('click', adminToken);
$('#btn-admin-logout').addEventListener('click', adminLogout);

/* ---------- Spins ---------- */
async function loadSpins(){
  const j = await api(`/api/device?deviceId=${encodeURIComponent(deviceId)}`);
  if (j && j.spins != null) $('#spins').textContent = j.spins;
}
loadSpins();

/* =========================================================
   1回ガチャ
   ========================================================= */
$('#btn-roll').addEventListener('click', async ()=>{
  stopStageVideos();

  const res = await api('/api/spin',{
    method:'POST',
    body: JSON.stringify({ deviceId })
  });

  if (!res.ok){
    alert(res.error || '失敗しました');
    return;
  }

  await loadSpins();

  const rarity = res.prize.rarity;
  const anim = $('#rarity-anim');
  const result = $('#result-video');
  const illust = $('#gacha-illust');

  const sfx = new Audio(`sfx/${rarity}.mp3`);
  anim.src = `animations/${rarity}.mp4`;

  illust.classList.add('hidden');
  anim.classList.remove('hidden');
  anim.currentTime = 0;
  anim.muted = false;

  try { await anim.play(); } catch {}
  setTimeout(()=>{ sfx.play().catch(()=>{}); }, 300);

  anim.onended = async ()=>{
    anim.classList.add('hidden');
    try { sfx.pause(); sfx.currentTime = 0; } catch {}

    result.src = res.prize.video_url;
    result.classList.remove('hidden');
    result.currentTime = 0;
    try { await result.play(); } catch {}

    result.onended = ()=>{
      result.classList.add('hidden');
      illust.classList.remove('hidden');
    };
  };
});

/* =========================================================
   ★★★ 修正版：10回ガチャ（初回はフル再生 / かぶりは2秒）★★★
   ========================================================= */

document.getElementById('btn-roll10').addEventListener('click', async () => {

  const spins = Number(document.getElementById('spins').textContent);
  if (spins < 10) {
    alert('回数が足りません');
    return;
  }

  document.getElementById('btn-roll').disabled = true;
  document.getElementById('btn-roll10').disabled = true;

  for (let i = 0; i < 10; i++) {

    stopStageVideos();

    /* --- 抽選（スピン時点で DB へコレクション追加される） --- */
    const res = await api('/api/spin', {
      method: 'POST',
      body: JSON.stringify({ deviceId })
    });

    if (!res.ok) {
      alert(res.error || '失敗しました');
      break;
    }

    // 回数更新
    await loadSpins();

    const rarity = res.prize.rarity;
    const anim = $('#rarity-anim');
    const result = $('#result-video');
    const illust = $('#gacha-illust');

    /* --- 演出 --- */
    const sfx = new Audio(`sfx/${rarity}.mp3`);
    anim.src = `animations/${rarity}.mp4`;

    illust.classList.add('hidden');
    anim.classList.remove('hidden');
    anim.currentTime = 0;
    anim.muted = false;

    try { await anim.play(); } catch {}
    setTimeout(() => { sfx.play().catch(()=>{}); }, 300);

    await new Promise(resolve => {
      anim.onended = () => {
        anim.classList.add('hidden');
        try { sfx.pause(); sfx.currentTime = 0; } catch {}
        resolve();
      };
    });

    /* --- 🔥 ここで DB 更新後の最新マイコレを取得する --- */
    const collection = await api(`/api/my-collection?deviceId=${deviceId}`);

    // この video_path がコレクションの中に何件あるかを調べる
    const ownedCount = collection.filter(p => p.video_path === res.prize.file).length;

    // ownedCount が 1 → 今入ったばかりの最初の1個＝初回
    // ownedCount が 2以上 → すでに持っていた＝かぶり
    const isDuplicate = ownedCount >= 2;


    /* --- 初回フル再生 or かぶり2秒再生 --- */

    result.src = res.prize.video_url;
    result.classList.remove('hidden');
    result.currentTime = 0;
    result.play().catch(()=>{});

    if (isDuplicate) {
      // ⭐ かぶり：2秒だけ再生
      await new Promise(r => setTimeout(r, 2000));
      result.pause();
      result.classList.add('hidden');
    } else {
      // ⭐ 初回：フル再生
      await new Promise(resolve => {
        result.onended = () => {
          result.classList.add('hidden');
          resolve();
        };
      });
    }

    illust.classList.remove('hidden');
  }

  document.getElementById('btn-roll').disabled = false;
  document.getElementById('btn-roll10').disabled = false;
});


/* ---------- Serial Redeem ---------- */
$('#btn-redeem').addEventListener('click', async ()=>{
  const code = $('#serial').value.trim();
  if (!code) return alert('コードを入力してください');

  const res = await api('/api/redeem-serial',{
    method:'POST',
    body: JSON.stringify({ code, deviceId })
  });

  if (res.ok){
    alert('追加されました');
    await loadSpins();
  } else alert(res.error || '失敗しました');
});

/* ---------- Serial List ---------- */
async function loadSerials(){
  const wrap = $('#serial-list');
  wrap.innerHTML = '読み込み中...';

  const token = sessionStorage.getItem('adminToken') || await adminToken();
  if (!token){ wrap.innerHTML = '管理者ログインが必要です'; return; }

  const r = await fetch('/api/admin/serials',{ headers:{'Authorization':'Bearer '+token} });

  if (r.status === 404){
    wrap.innerHTML = '404: /api/admin/serials がありません';
    return;
  }

  const rows = await safeJson(r);
  const t = document.createElement('table');
  t.className = 'serial-list-table';
  t.innerHTML = `
    <thead><tr>
      <th>コード</th><th>回数</th><th>使用</th>
      <th>使用端末</th><th>使用日時</th>
    </tr></thead>
    <tbody></tbody>
  `;

  const tb = t.querySelector('tbody');
  (rows || []).forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="serial-badge">${r.code}</span></td>
      <td>${r.spins}</td>
      <td>${r.used ? '済' : '未'}</td>
      <td>${r.used_by_device || '-'}</td>
      <td>${r.used_at || '-'}</td>
    `;
    tb.appendChild(tr);
  });

  wrap.innerHTML = '';
  wrap.appendChild(t);
}

/* ---------- Serial Issue ---------- */
$('#btn-issue-serial').addEventListener('click', async ()=>{
  const code = $('#serial-code').value.trim();
  const spins = +$('#serial-spins').value || 1;

  const token = await adminToken();
  if (!token) return;

  const r = await fetch('/api/admin/serials/issue',{
    method:'POST',
    headers:{
      'Authorization':'Bearer '+token,
      'Content-Type':'application/json'
    },
    body: JSON.stringify({ code, spins })
  });

  const d = await safeJson(r);
  if (r.ok && d.ok){
    $('#serial-status').innerHTML = `<span class="serial-badge">${d.code}</span> を登録（${d.spins}回）`;
    if (!code) $('#serial-code').value = d.code;
    loadSerials();
  } else {
    $('#serial-status').textContent = d.error || '失敗';
  }
});

/* ---------- 景品アップロード ---------- */
document.querySelector('#form-prize').addEventListener('submit', async (e)=>{
  e.preventDefault();

  const token = await adminToken();
  if (!token) return;

  const fd = new FormData();
  fd.append('rarity', $('#p-rarity').value);
  const file = $('#p-video').files[0];
  if (!file) return alert('動画を選択してください');
  fd.append('video', file);

  const r = await fetch('/api/admin/prizes/create',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+token },
    body: fd
  });

  const j = await safeJson(r);
  alert(r.ok && j.ok ? '登録しました' : (j.error || '失敗'));

  if (r.ok && j.ok){
    $('#form-prize').reset();
    renderPrizeList();
  }
});

/* ---------- 景品一覧表示 ---------- */
async function renderPrizeList(){
  const wrap = $('#prize-list');
  wrap.innerHTML = '読み込み中...';

  const token = sessionStorage.getItem('adminToken') || await adminToken();
  if (!token){ wrap.innerHTML = 'ログイン必要'; return; }

  const r = await fetch('/api/admin/prizes',{ headers:{'Authorization':'Bearer '+token} });

  if (r.status === 404){
    wrap.innerHTML = '404: /api/admin/prizes が見つかりません';
    return;
  }

  const rows = await safeJson(r);
  if (!Array.isArray(rows)){ wrap.innerHTML = '読み込み失敗'; return; }

  const el = document.createElement('table');
  el.className = 'table';
  el.innerHTML = `
    <thead><tr>
      <th>ID</th>
      <th>レア</th>
      <th>動画</th>
      <th>有効</th>
      <th>プレビュー</th>
      <th>操作</th>
    </tr></thead>
    <tbody></tbody>
  `;

  const tb = el.querySelector('tbody');

  rows.forEach(r=>{
    const tr = document.createElement('tr');

    tr.innerHTML = `
      <td>${r.id}</td>

      <td>
        <select class="raritySel">
          ${['normal','common','rare','superrare']
            .map(x=>`<option value="${x}" ${r.rarity===x?'selected':''}>${x}</option>`).join('')}
        </select>
      </td>

      <td><input type="file" class="videoFile" accept="video/*"></td>

      <td><input type="checkbox" class="enChk" ${r.enabled?'checked':''}></td>

      <td><span class="badge">${r.video_path}</span></td>

      <td class="actions">
        <button class="secondary btn-save">保存</button>
        <button class="secondary btn-del">削除</button>
      </td>
    `;

    const raritySel = tr.querySelector('.raritySel');
    const fileI = tr.querySelector('.videoFile');
    const enChk = tr.querySelector('.enChk');

    tr.querySelector('.btn-save').addEventListener('click', async ()=>{
      const fd = new FormData();
      fd.append('id', r.id);
      fd.append('rarity', raritySel.value);
      fd.append('enabled', enChk.checked ? 1 : 0);
      if (fileI.files[0]) fd.append('video', fileI.files[0]);

      const resp = await fetch('/api/admin/prizes/update',{
        method:'POST',
        headers:{ 'Authorization':'Bearer '+sessionStorage.getItem('adminToken') },
        body: fd
      });

      const j = await safeJson(resp);
      alert(resp.ok && j.ok ? '保存しました' : (j.error || '失敗'));
      if (resp.ok && j.ok) renderPrizeList();
    });

    tr.querySelector('.btn-del').addEventListener('click', async ()=>{
      if (!confirm('削除しますか？')) return;

      const resp = await fetch('/api/admin/prizes/delete',{
        method:'POST',
        headers:{
          'Authorization':'Bearer '+sessionStorage.getItem('adminToken'),
          'Content-Type':'application/json'
        },
        body: JSON.stringify({ id: r.id })
      });

      const j = await safeJson(resp);
      alert(resp.ok && j.ok ? '削除しました' : (j.error || '失敗'));
      if (resp.ok && j.ok) renderPrizeList();
    });

    tb.appendChild(tr);
  });

  wrap.innerHTML = '';
  wrap.appendChild(el);
}

/* ---------- レアリティ確率 読込 ---------- */
async function loadRarityWeights(){
  const token = sessionStorage.getItem('adminToken') || await adminToken();
  if (!token) return;

  const r = await fetch('/api/admin/rarity-weights',{
    headers:{'Authorization':'Bearer '+token}
  });

  const j = await safeJson(r);
  if (!j || !j.ok) return;

  $('#rw-normal').value = j.data.normal;
  $('#rw-common').value = j.data.common;
  $('#rw-rare').value = j.data.rare;
  $('#rw-superrare').value = j.data.superrare;
}

/* ---------- レアリティ確率 保存 ---------- */
$('#btn-save-rarity').addEventListener('click', async ()=>{
  const token = await adminToken();
  if (!token) return;

  const data = {
    normal: +$('#rw-normal').value,
    common: +$('#rw-common').value,
    rare: +$('#rw-rare').value,
    superrare: +$('#rw-superrare').value
  };

  const r = await fetch('/api/admin/rarity-weights/update',{
    method:'POST',
    headers:{
      'Authorization':'Bearer '+token,
      'Content-Type':'application/json'
    },
    body: JSON.stringify(data)
  });

  const j = await safeJson(r);
  alert(r.ok && j.ok ? '保存しました' : (j.error || '保存失敗'));
});

/* ---------- コレクション ---------- */
async function loadCollection(){
  const list = $('#collection-list');
  list.innerHTML = '<li>読み込み中...</li>';

  const rows = await api(`/api/my-collection?deviceId=${deviceId}`);
  list.innerHTML = '';

  if (!rows.length){
    list.innerHTML = '<li>まだありません</li>';
    return;
  }

  rows.forEach(r=>{
    const li = document.createElement('li');

    const meta = document.createElement('div');
    meta.className = 'meta';
    const count = (r.owned_count>1) ? ` ×${r.owned_count}` : '';
    meta.textContent = `${r.rarity}${count} / ${r.obtained_at}`;

    const v = document.createElement('video');
    v.src = `/uploads/${r.video_path}`;
    v.controls = true;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = '保存';

    btn.addEventListener('click', async ()=>{
      const url = `/download/${encodeURIComponent(r.video_path)}`;
      window.location.href = url;
    });

    actions.appendChild(btn);
    li.appendChild(meta);
    li.appendChild(v);
    li.appendChild(actions);
    list.appendChild(li);
  });
}
