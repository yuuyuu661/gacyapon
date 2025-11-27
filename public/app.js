/* =============================
    基本ユーティリティ
============================= */
const $ = sel => document.querySelector(sel);
const api = (url, opt={}) =>
  fetch(url, {
    headers:{ 'Content-Type':'application/json' },
    ...opt
  }).then(r=>r.json());

/* デバイスID */
let deviceId = localStorage.getItem('deviceId');
if (!deviceId){
  deviceId = 'd'+Math.random().toString(36).slice(2);
  localStorage.setItem('deviceId', deviceId);
}

/* 管理ログイン */
let adminToken = null;

/* =============================
    タブ切り替え
============================= */
document.querySelectorAll('#tabs button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab')
      .forEach(t => t.classList.remove('active'));

    $('#tab-' + btn.dataset.tab).classList.add('active');

    if (btn.dataset.tab === 'collection') loadCollection();
    if (btn.dataset.tab === 'gacha') updateCompleteStatus();
    if (btn.dataset.tab === 'admin') loadAdminData();
  });
});
document.querySelector('#tabs button').click();

/* =============================
    残り回数
============================= */
async function loadSpins(){
  const res = await api(`/api/device?deviceId=${deviceId}`);
  $('#spins').textContent = res.spins ?? 0;
}

/* =============================
    マイコレクション
============================= */
async function loadCollection(){
  const res = await api(`/api/my-collection?deviceId=${deviceId}`);
  const ul = $('#collection-list');
  ul.innerHTML = '';

  res.forEach(x=>{
    const li = document.createElement('li');
    li.innerHTML = `
      <strong>${x.rarity}</strong>
      <div class="meta">${x.video_path}</div>
      <div class="meta">所持数: ${x.owned_count}</div>
    `;
    ul.appendChild(li);
  });
}

/* =============================
    コンプリート判定
============================= */
async function updateCompleteStatus(){
  const all = await api('/api/all-prizes');
  const owned = await api(`/api/my-collection?deviceId=${deviceId}`);

  const allIds = all.all.map(x=>x.id);
  const ownedIds = owned.map(x=>x.id);

  const missing = allIds.filter(id => !ownedIds.includes(id)).length;
  const el = $('#complete-status');

  if (missing === 0){
    el.className = 'complete-done';
    el.textContent = 'コンプリートおめでとう！特典動画プレゼントするね！';
    $('#btn-bonus').classList.remove('hidden');
  } else {
    $('#btn-bonus').classList.add('hidden');
    el.textContent = `コンプリートまで残り ${missing} 種類！`;

    if (missing <= 9) el.className = 'complete-warning';
    else el.className = 'complete-normal';
  }
}

/* =============================
    特典動画再生
============================= */
$('#btn-bonus').addEventListener('click', async ()=>{
  const res = await api('/api/bonus-video');
  if (!res.ok) return alert('特典動画がありません');

  const rv = $('#result-video');
  rv.src = res.video_url;
  rv.classList.remove('hidden');
  await rv.play();
  rv.classList.add('hidden');
});

/* =============================
    初出チェック
============================= */
async function checkIsNew(prizeId){
  const owned = await api(`/api/my-collection?deviceId=${deviceId}`);
  const ids = owned.map(x=>x.id);
  return !ids.includes(prizeId);
}

/* =============================
    初獲得 → 動画再生
============================= */
async function playNormalResult(res){
  const rarity = res.prize.rarity;
  const anim = $('#rarity-anim');

  anim.src = `animations/${rarity}.mp4`;
  anim.classList.remove('hidden');
  await anim.play();
  anim.classList.add('hidden');

  const rv = $('#result-video');
  rv.src = res.prize.video_url;
  rv.classList.remove('hidden');
  await rv.play();
  rv.classList.add('hidden');
}

/* =============================
    かぶり → サムネ2秒
============================= */
async function playDuplicateResult(res){
  const temp = document.createElement('video');
  temp.src = res.prize.video_url;
  temp.currentTime = 1.0;

  await new Promise(ok => temp.onseeked = ok);

  const cvs = document.createElement('canvas');
  cvs.width = temp.videoWidth;
  cvs.height = temp.videoHeight;
  cvs.getContext('2d').drawImage(temp, 0, 0);

  const img = $('#thumb-preview');
  img.src = cvs.toDataURL();
  img.style.display = 'block';

  await new Promise(ok => setTimeout(ok, 2000));

  img.style.display = 'none';
}

/* =============================
    単発ガチャ
============================= */
$('#btn-roll').addEventListener('click', async ()=>{
  $('#btn-roll').disabled = true;
  $('#btn-roll10').disabled = true;

  const res = await api('/api/spin',{
    method:'POST',
    body: JSON.stringify({ deviceId })
  });
  await loadSpins();

  const isNew = await checkIsNew(res.prize.id);
  if (isNew) await playNormalResult(res);
  else await playDuplicateResult(res);

  updateCompleteStatus();
  $('#btn-roll').disabled = false;
  $('#btn-roll10').disabled = false;
});

/* =============================
    10連ガチャ
============================= */
$('#btn-roll10').addEventListener('click', async ()=>{
  const current = Number($('#spins').textContent);
  if (current < 10) return alert('回数が足りません');

  $('#btn-roll').disabled = true;
  $('#btn-roll10').disabled = true;

  for (let i=0; i<10; i++){
    const res = await api('/api/spin',{
      method:'POST',
      body: JSON.stringify({ deviceId })
    });

    await loadSpins();

    const isNew = await checkIsNew(res.prize.id);
    if (isNew) await playNormalResult(res);
    else await playDuplicateResult(res);
  }

  updateCompleteStatus();
  $('#btn-roll').disabled = false;
  $('#btn-roll10').disabled = false;
});

/* =============================
    シリアル回数追加
============================= */
$('#btn-redeem').addEventListener('click', async ()=>{
  const code = $('#serial').value.trim();
  if (!code) return alert('入力してください');

  const res = await api('/api/redeem-serial',{
    method:'POST',
    body: JSON.stringify({ code, deviceId })
  });

  if (res.error) return alert(res.error);

  alert(`${res.added} 回追加しました！`);
  $('#serial').value = '';

  await loadSpins();
  await updateCompleteStatus();
});

/* =============================
    管理画面ロード
============================= */
async function loadAdminData(){
  if (!adminToken) return;

  const headers = { 'Authorization':'Bearer '+adminToken };

  /* レア設定 */
  const rw = await fetch('/api/admin/rarity-weights',{ headers }).then(r=>r.json());
  if (rw.ok){
    $('#rw-normal').value = rw.data.normal;
    $('#rw-common').value = rw.data.common;
    $('#rw-rare').value = rw.data.rare;
    $('#rw-superrare').value = rw.data.superrare;
  }

  /* 景品一覧 */
  const plist = await fetch('/api/admin/prizes',{ headers }).then(r=>r.json());
  const wrap = $('#prize-list');
  wrap.innerHTML = '';
  plist.forEach(p=>{
    const d = document.createElement('div');
    d.textContent = `ID:${p.id} ${p.rarity} ${p.video_path}`;
    wrap.appendChild(d);
  });

  /* シリアル一覧 */
  const serials = await fetch('/api/admin/serials',{ headers }).then(r=>r.json());
  const sl = $('#serial-list');
  sl.innerHTML = '';
  serials.forEach(s=>{
    const row = document.createElement('div');
    row.textContent = `${s.code} (${s.spins}) used:${s.used}`;
    sl.appendChild(row);
  });
}

/* =============================
    レア保存
============================= */
$('#btn-save-rarity').addEventListener('click', async ()=>{
  const res = await api('/api/admin/rarity-weights/update',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+adminToken },
    body: JSON.stringify({
      normal: $('#rw-normal').value,
      common: $('#rw-common').value,
      rare: $('#rw-rare').value,
      superrare: $('#rw-superrare').value
    })
  });

  if (res.ok) alert('保存しました');
});

/* =============================
    景品登録
============================= */
$('#form-prize').addEventListener('submit', async e=>{
  e.preventDefault();

  const fd = new FormData();
  fd.append('rarity', $('#p-rarity').value);
  fd.append('video', $('#p-video').files[0]);

  const res = await fetch('/api/admin/prizes/create',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+adminToken },
    body: fd
  }).then(r=>r.json());

  if (!res.ok) return alert(res.error);
  alert('登録しました');
  $('#p-video').value = '';
  loadAdminData();
});

/* =============================
    特典動画アップロード
============================= */
$('#form-bonus').addEventListener('submit', async e=>{
  e.preventDefault();

  const fd = new FormData();
  fd.append('video', $('#bonus-video').files[0]);

  const res = await fetch('/api/admin/bonus-video',{
    method:'POST',
    headers:{ 'Authorization':'Bearer '+adminToken },
    body: fd
  }).then(r=>r.json());

  if (!res.ok) return alert(res.error);
  alert('保存しました');
  $('#bonus-video').value = '';
});

/* 初期ロード */
loadSpins();
updateCompleteStatus();
