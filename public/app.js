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

// ✅ 初期ロードで回数表示
loadSpins();

async function loadSpins(){
  const res = await api(`/api/my-collection?deviceId=${deviceId}`);
  const spins = (await fetch(`/api/devices?deviceId=${deviceId}`).then(r=>r.json())).spins;
  $('#spins').textContent = spins;
}

// --- Roll Gacha ---
$('#btn-roll').addEventListener('click', async ()=>{
  const res = await api('/api/spin', {method:'POST', body:JSON.stringify({deviceId})});
  if(!res.ok){ alert(res.error); return; }

  // ✅ 回数更新
  loadSpins();

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
    loadSpins(); // ✅ 回数更新
  } else alert(res.error);
});

// ✅ My Collection Load
async function loadCollection(){
  const list = $('#collection-list');
  const rows = await api(`/api/my-collection?deviceId=${deviceId}`);
  list.innerHTML = '';
  rows.forEach(r=>{
    const li = document.createElement('li');
    li.textContent = `${r.title} (${r.rarity})`;
    list.appendChild(li);
  });
}
