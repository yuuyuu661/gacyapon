(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const state = { token: null, deviceId: null, prizes: [] };

  // Tabs
  $$('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.tab-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $$('.tab').forEach(s=>s.classList.remove('active'));
      $('#tab-' + tab).classList.add('active');
    });
  });

  // DeviceId
  function ensureDeviceId(){
    let id = localStorage.getItem('deviceId');
    if(!id){ id = crypto.randomUUID(); localStorage.setItem('deviceId', id); }
    state.deviceId = id;
  }

  // Rarity detection (title tags override -> weight thresholds)
  function detectRarity(prize){
    const t = (prize.title || '').toUpperCase();
    if (t.includes('[SSR]') || t.includes('[SR]') || t.includes('[UR]')) return 'superrare';
    if (t.includes('[R]')) return 'rare';
    if (t.includes('[C]')) return 'common';
    if (t.includes('[N]')) return 'normal';
    const w = prize.weight || 0;
    if (w >= 30) return 'normal';
    if (w >= 15) return 'common';
    if (w >= 5) return 'rare';
    return 'superrare';
  }
  const rarityVideo = {
    normal: '/animations/normal.mp4',
    common: '/animations/common.mp4',
    rare: '/animations/rare.mp4',
    superrare: '/animations/superrare.mp4',
  };

  async function playRarityAnim(kind){
    const v = $('#rarity-anim');
    v.src = rarityVideo[kind] || rarityVideo.normal;
    v.currentTime = 0;
    v.classList.remove('hidden');
    try { await v.play(); } catch {}
    return new Promise(resolve => {
      const done = ()=>{
        v.classList.add('hidden');
        v.pause();
        v.currentTime = 0;
        v.removeEventListener('ended', done);
        resolve();
      };
      v.addEventListener('ended', done);
      setTimeout(done, 65_000);
    });
  }

  ensureDeviceId();

  // Spins
  async function refreshSpins(){
    const r = await fetch('/api/spins?deviceId=' + encodeURIComponent(state.deviceId));
    const j = await r.json();
    $('#spins').textContent = j.spins ?? 0;
  }
  refreshSpins();

  // Collection
  async function loadCollection(){
    const r = await fetch('/api/my-collection?deviceId=' + encodeURIComponent(state.deviceId));
    const list = await r.json();
    const wrap = $('#collection-list');
    wrap.innerHTML = '';
    for(const item of list){
      const card = document.createElement('div');
      card.className = 'card';
      card.innerHTML = `<h4>${item.title}</h4>
                        <time>${new Date(item.obtained_at).toLocaleString()}</time>
                        <video src="${item.video_url}" controls playsinline></video>`;
      wrap.appendChild(card);
    }
  }
  loadCollection();

  // Roll (抽選)
  let rolling = false;
  $('#btn-roll').addEventListener('click', async () => {
    if (rolling) return;
    rolling = true;
    try {
      const r = await fetch('/api/spin', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ deviceId: state.deviceId })
      });
      const j = await r.json();
      if(!j.ok) throw new Error(j.error || 'spin failed');
      $('#spins').textContent = j.spins;
      const rarity = detectRarity(j.prize);
      await playRarityAnim(rarity);
      $('#result-title').textContent = j.prize.title;
      const video = $('#result-video');
      video.src = j.prize.video_url;
      video.play().catch(()=>{});
      loadCollection();
    } catch(e){
      alert(e.message);
    } finally {
      rolling = false;
    }
  });

  // Redeem serial
  $('#btn-redeem').addEventListener('click', async () => {
    const code = $('#serial').value.trim();
    if(!code) return;
    const r = await fetch('/api/redeem-serial', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ code, deviceId: state.deviceId })
    });
    const j = await r.json();
    if(j.ok){
      $('#serial').value='';
      $('#spins').textContent = j.spins;
      alert(`回数+${j.added} になりました！`);
    }else{
      alert(j.error || 'redeem failed');
    }
  });

  // --- Admin login (shared) ---
  async function adminLogin(target){
    const field = target==='serials' ? $('#admin-password-serial') : $('#admin-password-inv');
    const password = field.value;
    const r = await fetch('/api/admin/login', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password })
    });
    const j = await r.json();
    if(j.token){
      state.token = j.token;
      localStorage.setItem('adminToken', j.token);
      if(target==='serials'){ $('#serials-login').classList.add('hidden'); $('#serials-area').classList.remove('hidden'); }
      else { $('#inventory-login').classList.add('hidden'); $('#inventory-area').classList.remove('hidden'); fetchPrizes(); }
    }else{
      alert(j.error || 'login failed');
    }
  }
  const saved = localStorage.getItem('adminToken');
  if(saved){ state.token = saved; }

  $$('button[data-login-target]').forEach(b=> b.addEventListener('click', ()=> adminLogin(b.dataset.loginTarget)));

  // Inventory
  async function fetchPrizes(){
    if(!state.token) return;
    const r = await fetch('/api/admin/prizes', { headers: { 'Authorization':'Bearer '+state.token } });
    const arr = await r.json();
    state.prizes = arr;
    renderPrizes();
  }

  function percentFromWeights(list){
    const total = list.filter(p=>p.enabled).reduce((s,p)=>s+p.weight,0) || 1;
    return list.map(p=>({ ...p, percent: Math.round((p.weight/total)*1000)/10 }));
  }

  function renderPrizes(){
    const body = $('#prize-body');
    if(!body) return;
    body.innerHTML = '';
    const withPct = percentFromWeights(state.prizes);
    for(const p of withPct){
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input data-k="title" data-id="${p.id}" value="${p.title}"></td>
        <td><input data-k="video_url" data-id="${p.id}" value="${p.video_url}"></td>
        <td><input data-k="percent" data-id="${p.id}" type="number" min="0" value="${p.enabled? p.percent: 0}"></td>
        <td class="center"><input data-k="enabled" data-id="${p.id}" type="checkbox" ${p.enabled? 'checked':''}></td>
        <td><button data-del="${p.id}">削除</button></td>
      `;
      body.appendChild(tr);
    }
    updatePercentSum();
    body.querySelectorAll('input,button').forEach(el=>{
      if(el.dataset.del){
        el.addEventListener('click', ()=>{
          const id = +el.dataset.del;
          state.prizes = state.prizes.filter(x=>x.id!==id);
          renderPrizes();
        });
      }else{
        el.addEventListener('input', updatePercentSum);
      }
    });
  }

  function updatePercentSum(){
    const body = $('#prize-body'); if(!body) return;
    const rows = [...body.querySelectorAll('tr')];
    let sum = 0;
    for(const tr of rows){
      const en = tr.querySelector('input[data-k="enabled"]').checked;
      const pct = +tr.querySelector('input[data-k="percent"]').value || 0;
      if(en) sum += pct;
    }
    const el = $('#percent-sum'); if(el) el.textContent = Math.round(sum*10)/10;
  }

  $('#add-prize')?.addEventListener('click', ()=>{
    const title = $('#new-title').value.trim();
    const url = $('#new-url').value.trim();
    const percent = +$('#new-percent').value || 0;
    if(!title || !url) return;
    const id = Math.max(0, ...state.prizes.map(p=>p.id||0)) + 1 + Math.floor(Math.random()*1000);
    state.prizes.push({ id, title, video_url: url, weight: percent, enabled: 1 });
    $('#new-title').value=''; $('#new-url').value=''; $('#new-percent').value='0';
    renderPrizes();
  });

  $('#save-prizes')?.addEventListener('click', async ()=>{
    if(!state.token) return alert('ログインしてください');
    const rows = [...document.querySelectorAll('#prize-body tr')];
    const edited = [];
    for(const tr of rows){
      const id = +tr.querySelector('input[data-k="title"]').dataset.id;
      const title = tr.querySelector('input[data-k="title"]').value;
      const video_url = tr.querySelector('input[data-k="video_url"]').value;
      const percent = +tr.querySelector('input[data-k="percent"]').value || 0;
      const enabled = tr.querySelector('input[data-k="enabled"]').checked ? 1 : 0;
      edited.push({ id, title, video_url, percent, enabled });
    }
    const sumPct = edited.filter(x=>x.enabled).reduce((s,x)=>s+x.percent,0);
    if(Math.round(sumPct*10)/10 !== 100.0){
      if(!confirm(`合計が ${sumPct}% です。自動で正規化して保存します。よろしいですか？`)) return;
    }
    const weights = edited.map(x=>{
      const w = x.enabled ? (x.percent <= 0 ? 0 : x.percent) : 0;
      return { ...x, weight: Math.round(w) };
    });

    const ops = [];
    const byId = new Map(state.prizes.map(p=>[p.id,p]));
    for(const e of weights){
      if(byId.has(e.id)){
        ops.push({ _op:'update', id:e.id, title:e.title, video_url:e.video_url, weight:e.weight, enabled:e.enabled });
        byId.delete(e.id);
      }else{
        ops.push({ _op:'create', title:e.title, video_url:e.video_url, weight:e.weight, enabled:e.enabled });
      }
    }
    for(const rest of byId.values()){
      ops.push({ _op:'delete', id: rest.id });
    }

    const r = await fetch('/api/admin/prizes/bulk', {
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+state.token},
      body: JSON.stringify({ items: ops })
    });
    const j = await r.json();
    if(j.ok){
      alert('保存しました');
      fetchPrizes();
    }else{
      alert(j.error || '保存に失敗しました');
    }
  });

})(); 
