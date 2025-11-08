const $ = (sel) => document.querySelector(sel);

// --- Tab switching ---
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    if ((target === 'serial' || target === 'stock') && !sessionStorage.getItem('adminToken')) {
      alert('最初に「管理ログイン」してください');
      return;
    }
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#tab-${target}`).classList.add('active');

    if (target === 'collection') loadCollection();
    if (target === 'gacha') loadSpins();
    if (target === 'stock') renderPrizeList();
  });
});

// --- Device ID ---
function ensureDeviceId(){
  let id = localStorage.getItem('deviceId');
  if(!id){
    id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now())+'-'+Math.random().toString(36).slice(2);
    localStorage.setItem('deviceId', id);
  }
  return id;
}
const deviceId = ensureDeviceId();

// --- API Helper ---
async function api(url, opt={}) {
  const r = await fetch(url, {headers:{'Content-Type':'application/json'}, ...opt});
  return r.json();
}

// Simple admin login prompt -> returns token
async function adminToken(){
  let token = sessionStorage.getItem('adminToken');
  if (token) return token;
  const pass = prompt('管理パスワードを入力');
  if (!pass) return null;
  let j;
  try{
    const r = await fetch('/api/admin/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({password:pass})
    });
    if (r.status === 404) {
      alert('404: /api/admin/login が見つかりません。Railway が「Static」になっていませんか？必ず「Service(Node)」で起動し、Start= npm start, Port=PORT で公開してください。');
      return null;
    }
    j = await r.json();
  }catch(e){
    alert('接続に失敗しました: ' + e);
    return null;
  }
  if (!j.token){ alert(j.error || '認証失敗'); return null; }
  sessionStorage.setItem('adminToken', j.token);
  document.body.classList.add('admin-visible');
  $('#btn-admin-login').classList.add('hidden');
  $('#btn-admin-logout').classList.remove('hidden');
  return j.token;
}

function adminLogout(){
  sessionStorage.removeItem('adminToken');
  document.body.classList.remove('admin-visible');
  $('#btn-admin-login').classList.remove('hidden');
  $('#btn-admin-logout').classList.add('hidden');
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('#tab-gacha').classList.add('active');
}

// Admin buttons
$('#btn-admin-login').addEventListener('click', adminToken);
$('#btn-admin-logout').addEventListener('click', adminLogout);

// initial admin state
if (sessionStorage.getItem('adminToken')){
  document.body.classList.add('admin-visible');
  $('#btn-admin-login').classList.add('hidden');
  $('#btn-admin-logout').classList.remove('hidden');
}

// Spins
async function loadSpins(){
  try {
    const j = await api(`/api/device?deviceId=${encodeURIComponent(deviceId)}`);
    if (j.spins != null) $('#spins').textContent = j.spins;
  } catch (e) { /* noop */ }
}
loadSpins();

// --- Roll Gacha ---
$('#btn-roll').addEventListener('click', async ()=>{
  const res = await api('/api/spin', {method:'POST', body:JSON.stringify({deviceId})});
  if(!res.ok){ alert(res.error); return; }

  await loadSpins(); // update counter

  const rarity = res.prize.rarity;
  const anim = $('#rarity-anim');
  const sfx = new Audio(`sfx/${rarity}.mp3`);
  anim.src = `animations/${rarity}.mp4`;
  anim.classList.remove('hidden');
  anim.play().catch(()=>{});
  setTimeout(()=>{ sfx.play().catch(()=>{}); }, 1000);

  anim.onended = ()=>{ sfx.pause(); anim.classList.add('hidden'); playResult(); };

  function playResult(){
    const v = $('#result-video');
    v.src = res.prize.video_url;
    v.classList.remove('hidden');
    v.play();
    v.onended = ()=>{ v.pause(); v.classList.add('hidden'); };
  }
});

// --- Redeem Serial ---
$('#btn-redeem').addEventListener('click', async ()=>{
  const code = $('#serial').value.trim();
  if(!code) return alert('コードを入力してください');
  const res = await api('/api/redeem-serial',{method:'POST',body:JSON.stringify({code,deviceId})});
  if(res.ok){
    alert('追加されました');
    await loadSpins();
  } else alert(res.error);
});

// --- Issue Serial (Admin) ---
$('#btn-issue-serial').addEventListener('click', async ()=>{
  const code = $('#serial-code').value.trim();
  const spins = +$('#serial-spins').value || 1;
  if (!code) return alert('シリアル番号を入力してください');
  const token = await adminToken();
  if (!token) return;

  const res = await fetch('/api/admin/serials/issue',{
    method:'POST',
    headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({code,spins})
  });
  if (res.status === 404){
    alert('404: /api/admin/serials/issue が見つかりません。Railway のサービス種別を確認してください（StaticではなくNode Service）。');
    return;
  }
  const d = await res.json();
  alert(d.ok ? '発行しました' : d.error || '失敗しました');
});

// --- Prize Create (Admin upload) ---
document.querySelector('#form-prize').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const token = await adminToken();
  if (!token) return;

  const fd = new FormData();
  fd.append('title', document.querySelector('#p-title').value || '');
  fd.append('percent', document.querySelector('#p-percent').value || '0');
  fd.append('rarity', document.querySelector('#p-rarity').value || 'normal');
  const file = document.querySelector('#p-video').files[0];
  if (!file) return alert('動画を選択してください');
  fd.append('video', file);

  const res = await fetch('/api/admin/prizes/create',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+token },
    body: fd
  });
  if (res.status === 404){
    alert('404: /api/admin/prizes/create が見つかりません。Railway のサービス種別を確認してください（StaticではなくNode Service）。');
    return;
  }
  const d = await res.json();
  alert(d.ok ? '登録しました' : d.error || '失敗しました');
  if (d.ok) {
    document.querySelector('#form-prize').reset();
    renderPrizeList(); // refresh list
  }
});

// --- Admin prize list (edit/delete) ---
async function renderPrizeList(){
  const wrap = $('#prize-list');
  wrap.innerHTML = '読み込み中...';
  const token = await adminToken();
  if (!token){ wrap.innerHTML = '管理者ログインが必要です'; return; }

  const res = await fetch('/api/admin/prizes', { headers:{'Authorization':'Bearer '+token} });
  if (res.status === 404){
    wrap.innerHTML = '404: /api/admin/prizes が見つかりません。Railway のサービス種別を確認してください（StaticではなくNode Service）。';
    return;
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) { wrap.innerHTML = '読み込み失敗'; return; }

  const el = document.createElement('table');
  el.className = 'table';
  el.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>タイトル</th>
        <th>確率(%)</th>
        <th>レア</th>
        <th>動画(差替え)</th>
        <th>有効</th>
        <th>プレビュー</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = el.querySelector('tbody');

  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.id}</td>
      <td><input type="text" value="${r.title ?? ''}"></td>
      <td><input type="number" step="0.01" value="${r.weight ?? 0}"></td>
      <td>
        <select>
          ${['normal','common','rare','superrare'].map(x=>`<option value="${x}" ${r.rarity===x?'selected':''}>${x}</option>`).join('')}
        </select>
      </td>
      <td><input type="file" accept="video/*"></td>
      <td><input type="checkbox" ${r.enabled? 'checked':''}></td>
      <td><span class="badge">${r.video_path || ''}</span></td>
      <td class="actions">
        <button class="secondary btn-save">保存</button>
        <button class="secondary btn-del">削除</button>
      </td>
    `;
    const [titleI, percentI, rarityS, fileI, enabledI] = [
      tr.children[1].querySelector('input'),
      tr.children[2].querySelector('input'),
      tr.children[3].querySelector('select'),
      tr.children[4].querySelector('input[type="file"]'),
      tr.children[5].querySelector('input[type="checkbox"]'),
    ];

    tr.querySelector('.btn-save').addEventListener('click', async ()=>{
      const fd = new FormData();
      fd.append('id', r.id);
      fd.append('title', titleI.value);
      fd.append('percent', percentI.value);
      fd.append('rarity', rarityS.value);
      fd.append('enabled', enabledI.checked ? 1 : 0);
      if (fileI.files[0]) fd.append('video', fileI.files[0]);

      const resp = await fetch('/api/admin/prizes/update',{
        method:'POST',
        headers:{ 'Authorization':'Bearer '+(sessionStorage.getItem('adminToken')||'') },
        body: fd
      });
      const j = await resp.json();
      alert(j.ok ? '保存しました' : j.error || '保存失敗');
      if (j.ok) renderPrizeList();
    });

    tr.querySelector('.btn-del').addEventListener('click', async ()=>{
      if (!confirm('削除してよろしいですか？')) return;
      const resp = await fetch('/api/admin/prizes/delete',{
        method:'POST',
        headers:{ 'Authorization':'Bearer '+(sessionStorage.getItem('adminToken')||''), 'Content-Type':'application/json' },
        body: JSON.stringify({ id: r.id })
      });
      const j = await resp.json();
      alert(j.ok ? '削除しました' : j.error || '削除失敗');
      if (j.ok) renderPrizeList();
    });

    tb.appendChild(tr);
  });

  wrap.innerHTML = '';
  wrap.appendChild(el);
}

// --- My Collection ---
async function loadCollection(){
  const list = $('#collection-list');
  list.innerHTML = '<li>読み込み中...</li>';
  const rows = await api(`/api/my-collection?deviceId=${encodeURIComponent(deviceId)}`);
  list.innerHTML = '';
  if (!rows.length){
    list.innerHTML = '<li>まだコレクションがありません</li>';
    return;
  }
  rows.forEach(r=>{
    const li = document.createElement('li');
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `${r.title} / ${r.rarity} / ${new Date(r.obtained_at).toLocaleString()}`;
    const v = document.createElement('video');
    v.src = `/uploads/${r.video_path}`;
    v.controls = true;
    li.appendChild(meta);
    li.appendChild(v);
    list.appendChild(li);
  });
}
