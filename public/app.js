const $ = (sel) => document.querySelector(sel);

// --- Tab switching ---
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');

    if (btn.dataset.tab === 'collection') loadCollection();
    if (btn.dataset.tab === 'gacha') loadSpins();
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

async function loadSpins(){
  try {
    const j = await api(`/api/device?deviceId=${encodeURIComponent(deviceId)}`);
    if (j.spins != null) $('#spins').textContent = j.spins;
  } catch (e) { /* noop */ }
}

// initial
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
  const reissue = $('#serial-reissue').checked;
  if (!code) return alert('シリアル番号を入力してください');
  const pass = prompt('管理パスワードを入力');
  if (!pass) return;

  const r = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
  const j = await r.json();
  if(!j.token) return alert(j.error || '認証失敗');

  const res = await fetch('/api/admin/serials/issue',{
    method:'POST',
    headers:{'Authorization':'Bearer '+j.token,'Content-Type':'application/json'},
    body:JSON.stringify({code,spins,reissue})
  });
  const d = await res.json();
  alert(d.ok ? '発行しました' : d.error || '失敗しました');
});

// --- Prize Create (Admin upload) ---
document.querySelector('#form-prize').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const pass = prompt('管理パスワードを入力');
  if (!pass) return;

  const r = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
  const j = await r.json();
  if(!j.token) return alert(j.error || '認証失敗');

  const fd = new FormData();
  fd.append('title', document.querySelector('#p-title').value || '');
  fd.append('percent', document.querySelector('#p-percent').value || '0');
  fd.append('rarity', document.querySelector('#p-rarity').value || 'normal');
  const file = document.querySelector('#p-video').files[0];
  if (!file) return alert('動画を選択してください');
  fd.append('video', file);

  const res = await fetch('/api/admin/prizes/create',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+j.token },
    body: fd
  });
  const d = await res.json();
  alert(d.ok ? '登録しました' : d.error || '失敗しました');
});

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
    v.src = r.video_path ? r.video_path : `/uploads/${r.video_path}`; // fallback if server returned path only
    v.src = `/uploads/${r.video_path}`;
    v.controls = true;
    li.appendChild(meta);
    li.appendChild(v);
    list.appendChild(li);
  });
}
