const $ = (sel) => document.querySelector(sel);

// --- Tab switching ---
document.querySelectorAll('nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`#tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// --- Device ID ---
function ensureDeviceId(){
  let id = localStorage.getItem('deviceId');
  if(!id){ id = crypto.randomUUID(); localStorage.setItem('deviceId', id); }
  return id;
}
const deviceId = ensureDeviceId();

// --- admin token store ---
function setToken(tok){ localStorage.setItem('adminToken', tok); }
function getToken(){ return localStorage.getItem('adminToken') || ''; }

// --- API helper ---
async function api(url, opt={}) {
  const r = await fetch(url, { headers: {'Content-Type':'application/json'}, ...opt });
  return r.json();
}

// --- init spins ---
(async ()=>{
  try{
    const r = await fetch('/api/spins?deviceId='+encodeURIComponent(deviceId));
    if(r.ok){ const j = await r.json(); $('#spins').textContent = j.spins ?? 0; }
  }catch{}
})();

// --- Roll Gacha ---
$('#btn-roll').addEventListener('click', async ()=>{
  const res = await api('/api/spin', {method:'POST', body:JSON.stringify({deviceId})});
  if(!res.ok){ alert(res.error); return; }

  const rarity = res.prize.rarity;
  const anim = $('#rarity-anim');
  const sfx = new Audio(`sfx/${rarity}.mp3`);
  anim.src = `animations/${rarity}.mp4`;
  anim.classList.remove('hidden');
  anim.play().catch(()=>{});
  setTimeout(()=>{ sfx.play().catch(()=>{}); }, 1000);

  anim.onended = ()=>{
    sfx.pause();
    anim.classList.add('hidden');
    playResult();
  };

  async function playResult(){
    const v = $('#result-video');
    v.src = res.prize.video_url;
    v.classList.remove('hidden');
    try{ await v.play(); }catch{}
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
    // 残回数更新
    const r = await fetch('/api/spins?deviceId='+encodeURIComponent(deviceId));
    const j = await r.json(); $('#spins').textContent = j.spins ?? 0;
  } else {
    alert(res.error);
  }
});

// --- Admin login (Serial tab) ---
$('#btn-admin-login-serial')?.addEventListener('click', async ()=>{
  const pass = $('#admin-pass-serial').value;
  const r = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
  const j = await r.json();
  if(j.token){
    setToken(j.token);
    $('#admin-status-serial').textContent = 'ログイン済み';
    $('#serial-admin-area').classList.remove('hidden');
  }else{
    $('#admin-status-serial').textContent = j.error || 'ログイン失敗';
  }
});

// --- Admin login (Stock tab) ---
$('#btn-admin-login-stock')?.addEventListener('click', async ()=>{
  const pass = $('#admin-pass-stock').value;
  const r = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
  const j = await r.json();
  if(j.token){
    setToken(j.token);
    $('#admin-status-stock').textContent = 'ログイン済み';
    $('#stock-admin-area').classList.remove('hidden');
  }else{
    $('#admin-status-stock').textContent = j.error || 'ログイン失敗';
  }
});

// --- Issue Serial (Admin) ---
$('#btn-issue-serial')?.addEventListener('click', async ()=>{
  const token = getToken();
  if(!token) return alert('先にログインしてください');
  const code = $('#serial-code').value.trim();
  const spins = +$('#serial-spins').value || 1;
  const reissue = $('#serial-reissue').checked;
  if(!code) return alert('シリアル番号を入力してください');

  const res = await fetch('/api/admin/serials/issue',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
    body:JSON.stringify({code,spins,reissue})
  });
  const d = await res.json();
  alert(d.ok ? '発行しました' : d.error);
  if(d.ok){ $('#serial-code').value=''; }
});

// --- Prize create (Admin) ---
$('#form-prize')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const token = getToken();
  if(!token) return alert('先にログインしてください');

  const fd = new FormData(e.currentTarget);
  const res = await fetch('/api/admin/prizes/create',{ method:'POST', headers:{'Authorization':'Bearer '+token}, body: fd });
  const j = await res.json();
  alert(j.ok ? '登録しました' : (j.error || '失敗しました'));
  if(j.ok){ e.currentTarget.reset(); }
});
