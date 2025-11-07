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
  if(!id){
    id = crypto.randomUUID();
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
  if(res.ok) alert('追加されました');
  else alert(res.error);
});

// --- Issue Serial (Admin) ---
$('#btn-issue-serial').addEventListener('click', async ()=>{
  const code = $('#serial-code').value.trim();
  const spins = +$('#serial-spins').value || 1;
  const reissue = $('#serial-reissue').checked;
  const pass = prompt('管理パスワードを入力');
  const r = await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:pass})});
  const j = await r.json();
  if(!j.token) return alert(j.error);
  const res = await fetch('/api/admin/serials/issue',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+j.token},
    body:JSON.stringify({code,spins,reissue})
  });
  const d = await res.json();
  alert(d.ok ? '発行しました' : d.error);
});
