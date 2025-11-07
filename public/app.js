(() => {
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
  const state = {
    token: null,
    deviceId: null,
    prizes: [],
  };

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
    if(!id){
      id = crypto.randomUUID();
      localStorage.setItem('deviceId', id);
    }
    state.deviceId = id;
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

  // Gacha animation + spin
  let spinning = false;
  $('#btn-spin').addEventListener('click', async () => {
    if (spinning) return;
    spinning = true;
    try {
      // spin animation (needle fixed, wheel rotates)
      const wheel = $('#wheel');
      const capsule = $('#capsule');
      const duration = 2200;
      const turns = 3 + Math.random()*2;
      wheel.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${turns*360}deg)` }], { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });

      // call API in parallel then wait end
      const req = fetch('/api/spin', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ deviceId: state.deviceId })
      }).then(r=>r.json());

      await new Promise(res=>setTimeout(res, duration));

      const j = await req;
      if(!j.ok) throw new Error(j.error || 'spin failed');
      $('#spins').textContent = j.spins;
      $('#result-title').textContent = j.prize.title;
      const video = $('#result-video');
      video.src = j.prize.video_url;
      video.play().catch(()=>{});

      // capsule drop
      capsule.animate([
        { transform:'translate(-50%, 0)', bottom: '220px', opacity: 0 },
        { transform:'translate(-50%, 0)', bottom: '80px', opacity: 1 },
        { transform:'translate(-50%, 20px)', bottom: '20px', opacity: 1 },
        { transform:'translate(-50%, 0)', bottom: '16px', opacity: 1 }
      ], { duration: 600, easing:'cubic-bezier(.2,.9,.2,1)' });

      loadCollection();
    } catch(e){
      alert(e.message);
    } finally {
      spinning = false;
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
  // restore token
  const saved = localStorage.getItem('adminToken');
  if(saved){ state.token = saved; /* let UI show on first action */ }

  $$('button[data-login-target]').forEach(b=>{
    b.addEventListener('click', ()=> adminLogin(b.dataset.loginTarget));
  });

  // Serial issuance
  $('#btn-make-serials').addEventListener('click', async ()=>{
    if(!state.token) return alert('ログインしてください');
    const spins = +$('#serial-spins').value || 1;
    const quantity = +$('#serial-qty').value || 1;
    const note = $('#serial-note').value;
    const expiresAt = $('#serial-exp').value || null;
    const r = await fetch('/api/admin/serials/create', {
      method:'POST',
      headers:{'Content-Type':'application/json', 'Authorization': 'Bearer ' + state.token},
      body: JSON.stringify({ spins, quantity, note, expiresAt })
    });
    const j = await r.json();
    if(j.codes){
      $('#serials-output').value = j.codes.join('\n');
    }else{
      alert(j.error || 'failed');
    }
  });

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
    // bind
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
    // sum visible percents for enabled items
    const rows = $$('#prize-body tr');
    let sum = 0;
    for(const tr of rows){
      const en = $('input[data-k="enabled"]', tr).checked;
      const pct = +$('input[data-k="percent"]', tr).value || 0;
      if(en) sum += pct;
    }
    $('#percent-sum').textContent = Math.round(sum*10)/10;
  }

  $('#add-prize').addEventListener('click', ()=>{
    const title = $('#new-title').value.trim();
    const url = $('#new-url').value.trim();
    const percent = +$('#new-percent').value || 0;
    if(!title || !url) return;
    const id = Math.max(0, ...state.prizes.map(p=>p.id||0)) + 1 + Math.floor(Math.random()*1000);
    state.prizes.push({ id, title, video_url: url, weight: percent, enabled: 1 });
    $('#new-title').value=''; $('#new-url').value=''; $('#new-percent').value='0';
    renderPrizes();
  });

  $('#save-prizes').addEventListener('click', async ()=>{
    if(!state.token) return alert('ログインしてください');
    // read table back
    const rows = $$('#prize-body tr');
    const edited = [];
    for(const tr of rows){
      const id = +$('input[data-k="title"]', tr).dataset.id;
      const title = $('input[data-k="title"]', tr).value;
      const video_url = $('input[data-k="video_url"]', tr).value;
      const percent = +$('input[data-k="percent"]', tr).value || 0;
      const enabled = $('input[data-k="enabled"]', tr).checked ? 1 : 0;
      edited.push({ id, title, video_url, percent, enabled });
    }
    // normalize -> sum to 100 by weights proportional to percents
    const sumPct = edited.filter(x=>x.enabled).reduce((s,x)=>s+x.percent,0);
    if(Math.round(sumPct*10)/10 !== 100.0){
      if(!confirm(`合計が ${sumPct}% です。自動で正規化して保存します。よろしいですか？`)) return;
    }
    const weights = edited.map(x=>{
      const w = x.enabled ? (x.percent <= 0 ? 0 : x.percent) : 0;
      return { ...x, weight: Math.round(w) }; // integer weights
    });

    // compute ops: update vs create vs delete
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
    // leftovers are deleted
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
