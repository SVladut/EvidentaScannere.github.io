// ===== Config & State =====
const LS_DATA = 'evidenta_scannere_data_v2';
const LS_LOG  = 'evidenta_scannere_log_v2';

// Endpoint fix hardcodat — inlocuieste cu URL-ul tau real:
const ENDPOINT_URL = 'https://workers-auto.sarsamavladut.workers.dev';

const state = {
  data: [], // [{id, nume, TC, UROVO}]
  log: [],
  history: [],
  endpoint: ENDPOINT_URL,
  online: false,
};

let pendingSync = false;

// ===== Helpers =====
const $ = (sel) => document.querySelector(sel);
const fmtDate = (d=new Date()) => {
  const pad = (n) => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};
const download = (filename, text) => {
  const blob = new Blob([text], {type: 'text/plain;charset=utf-8'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); },0);
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// ===== Storage =====
function saveLS(){
  localStorage.setItem(LS_DATA, JSON.stringify(state.data));
  localStorage.setItem(LS_LOG, JSON.stringify(state.log));
}
function loadLS(){
  try{
    const d = JSON.parse(localStorage.getItem(LS_DATA)||'null');
    const l = JSON.parse(localStorage.getItem(LS_LOG)||'null');
    state.data = Array.isArray(d) ? d : [];
    state.log  = Array.isArray(l) ? l : [];
  }catch(_){
    state.data = [];
    state.log  = [];
  }
}

// ===== Logs pretty renderer =====
function detectType(text) {
  if (/PREDARE/.test(text)) return { t: 'PREDARE', cls: 'tag-out' };
  if (/PRIMIRE/.test(text)) return { t: 'PRIMIRE', cls: 'tag-in' };
  if (/AJUSTARE/.test(text)) return { t: 'AJUSTARE', cls: 'tag-adj' };
  if (/IMPORT/.test(text))   return { t: 'IMPORT',   cls: 'tag-imp' };
  if (/ADAUGA ANGAJAT/.test(text)) return { t: 'ADAUGA', cls: 'tag-add' };
  return { t: 'INFO', cls: '' };
}
function parseLogLine(line) {
  // format: [YYYY-MM-DD HH:MM:SS] restul
  const m = line.match(/^\[(.*?)\]\s*(.*)$/);
  if (m) {
    const date = m[1].trim();
    const rest = m[2].trim();
    const { t, cls } = detectType(rest);
    return { date, type: t, cls, text: rest };
  }
  const { t, cls } = detectType(line);
  return { date: '', type: t, cls, text: line };
}
function renderLogs() {
  const box = document.getElementById('logList');
  if (!box) return;
  const logs = state.log || [];
  if (!logs.length) {
    box.textContent = '(fara inregistrari)';
    return;
  }
  box.innerHTML = '';
  for (const line of logs) {
    const { date, type, cls, text } = parseLogLine(line);
    const item = document.createElement('div');
    item.className = 'log-item';

    const dateEl = document.createElement('span');
    dateEl.className = 'log-date';
    dateEl.textContent = date || '—';

    const textEl = document.createElement('span');
    textEl.className = 'log-text';

    const tag = document.createElement('span');
    tag.className = `tag ${cls}`;
    tag.textContent = type;

    const msg = document.createElement('span');
    msg.textContent = text;

    textEl.appendChild(tag);
    textEl.appendChild(msg);

    item.appendChild(dateEl);
    item.appendChild(textEl);
    box.appendChild(item);
  }
  // scroll-ul este controlat din CSS prin max-height + overflow
}

// ===== Undo =====
function pushHistory(){
  state.history.push({ data: clone(state.data), logLen: state.log.length });
  if (state.history.length > 50) state.history.shift();
}
function undo(){
  const prev = state.history.pop();
  if (!prev) return false;
  state.data = prev.data; state.log = state.log.slice(0, prev.logLen);
  saveLS(); render(); return true;
}

// ===== Rendering =====
function render(){
  const op = $('#opOperator');
  const dest = $('#opDest');

  const prevOp = op?.value || '';
  const prevDest = dest?.value || '';

  if (op) op.innerHTML='';
  if (dest) dest.innerHTML='';

  const sorted = [...state.data].sort((a,b)=>a.nume.localeCompare(b.nume));
  for (const p of sorted){
    if (op)   { const o1 = document.createElement('option'); o1.value=p.id; o1.textContent=p.nume; op.appendChild(o1); }
    if (dest) { const o2 = document.createElement('option'); o2.value=p.id; o2.textContent=p.nume; dest.appendChild(o2); }
  }

  if (op && prevOp && [...op.options].some(o=>o.value===prevOp)) op.value = prevOp;
  if (dest && prevDest && [...dest.options].some(o=>o.value===prevDest)) dest.value = prevDest;

  const tb=$('#tbl tbody'); if (tb) tb.innerHTML='';
  let sumTC=0,sumU=0;
  for(const p of sorted){
    if (tb){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td>${p.nume}</td><td class="right qty">${p.TC}</td><td class="right qty">${p.UROVO}</td><td class="right qty">${p.TC+p.UROVO}</td>`;
      tb.appendChild(tr);
    }
    sumTC+=p.TC; sumU+=p.UROVO;
  }
  $('#sumTC') && ($('#sumTC').textContent = sumTC);
  $('#sumUROVO') && ($('#sumUROVO').textContent = sumU);
  $('#sumTot') && ($('#sumTot').textContent = sumTC + sumU);
  $('#kpiTC') && ($('#kpiTC').textContent = sumTC);
  $('#kpiUROVO') && ($('#kpiUROVO').textContent = sumU);
  $('#kpiAng') && ($('#kpiAng').textContent = state.data.length);

  // logs cu design nou
  renderLogs();

  if (op && dest && op.value===dest.value && dest.options.length>1) {
    dest.selectedIndex=(op.selectedIndex+1)%dest.options.length;
  }

  $('#modeBadge') && ($('#modeBadge').textContent = state.online ? 'online' : 'offline');
}

function setStatus(msg){ const el=$('#syncStatus'); if(el) el.textContent = msg; }
function currentUserName(){
  const sel = $('#opOperator');
  const id = sel?.value; const p = state.data.find(x=>x.id===id);
  return p?.nume || '';
}

// ===== Sync API =====
async function fetchRemote(){
  if (!state.endpoint) return false;
  setStatus('Se incarca din server...');
  try{
    const r = await fetch(state.endpoint + '/data', { cache:'no-store' });
    if(!r.ok) throw new Error('HTTP '+r.status);
    const json = await r.json();
    if(Array.isArray(json.data)) state.data = json.data;
    if(Array.isArray(json.log)) state.log = json.log; // array de linii din log.txt
    state.online = true; setStatus('Sincronizat (pull).');
    saveLS(); render();
    return true;
  }catch(e){
    console.warn('fetchRemote error', e);
    state.online = false; setStatus('Eroare '+e.message+' - verifica URL-ul si rutele /data, /commit.');
    render(); return false;
  }
}

// IMPORTANT: trimite DOAR linia noua de log (append), nu tot state.log!
async function pushRemote(message, newLogLine){
  if (!state.endpoint) return false;
  try{
    const body = {
      data: state.data,
      log: newLogLine ? [newLogLine] : [],   // <— DOAR linia noua
      authorName: currentUserName() || 'sistem',
      message: message || 'update evidenta'
    };
    const r = await fetch(state.endpoint + '/commit', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if(!r.ok) throw new Error('HTTP '+r.status);
    state.online = true; setStatus('Salvat in repo (commit).');
    return true;
  }catch(e){
    console.warn('pushRemote error', e);
    setStatus('Eroare la commit. Datele au ramas local.');
    state.online=false;
    return false;
  }
}

// ===== Business rules =====
async function applyOperation(){
  const type = $('#opTip')?.value;
  const scanner = $('#opScanner')?.value;
  const qty = Math.max(1, parseInt($('#opQty')?.value||'1',10));
  const opId = $('#opOperator')?.value;
  const destId = $('#opDest')?.value;

  const from = state.data.find(p=>p.id===opId);
  const to = state.data.find(p=>p.id===destId);
  if (!from || !to){ alert('Selectati operatorul si destinatarul.'); return; }

  pushHistory();

  const key = scanner;
  let logLine = '';
  if (type === 'PREDARE'){
    if (from[key] < qty){ alert(`${from.nume} nu are suficiente scannere ${key}.`); state.history.pop(); return; }
    if (from.id === to.id){ alert('Destinatarul trebuie sa fie alta persoana.'); state.history.pop(); return; }
    from[key] -= qty; to[key] += qty;
    logLine = `[${fmtDate()}] ${from.nume} PREDARE ${qty} x ${key} catre ${to.nume}`;
  } else if (type === 'PRIMIRE'){
    if (to[key] < qty){ alert(`${to.nume} nu are suficiente scannere ${key}.`); state.history.pop(); return; }
    if (from.id === to.id){ alert('Sursa trebuie sa fie alta persoana.'); state.history.pop(); return; }
    to[key] -= qty; from[key] += qty;
    logLine = `[${fmtDate()}] ${from.nume} PRIMIRE ${qty} x ${key} de la ${to.nume}`;
  } else if (type === 'AJUSTARE'){
    const sign = prompt('Introduceti noua valoare totala pentru ' + key + ' la ' + from.nume + ':', from[key]);
    const newVal = Number(sign);
    if (!Number.isFinite(newVal) || newVal<0){ alert('Valoare invalida.'); state.history.pop(); return; }
    const diff = newVal - from[key];
    from[key] = newVal;
    logLine = `[${fmtDate()}] AJUSTARE ${key} la ${from.nume}: ${diff>=0?'+':''}${diff} (total ${newVal})`;
  }

  // update local + UI
  state.log.push(logLine);
  saveLS(); render();

  // push doar linia noua, apoi pull pentru aliniere
  if (state.endpoint) {
    const ok = await pushRemote('op update', logLine);
    if (ok) { await fetchRemote(); }
    else {
      setStatus('Offline. Se va sincroniza automat cand revine conexiunea.');
      pendingSync = true;
    }
  }
}

function addEmployee(){
  const name = ($('#newName')?.value||'').trim();
  if (!name){ alert('Introduceti un nume.'); return; }
  if (state.data.some(p=>p.nume.toLowerCase()===name.toLowerCase())){ alert('Exista deja un angajat cu acest nume.'); return; }
  pushHistory();
  state.data.push({ id: crypto.randomUUID?.() || ('id_'+Date.now()+Math.random()), nume: name, TC: 0, UROVO: 0 });
  const nameInput = $('#newName'); if (nameInput) nameInput.value='';
  const logLine = `[${fmtDate()}] ADAUGA ANGAJAT ${name}`;
  state.log.push(logLine);
  saveLS(); render();

  if (state.endpoint) { pushRemote('add employee', logLine).then(ok => { if (ok) fetchRemote(); else pendingSync = true; }); }
}

function exportJson(){ const json = JSON.stringify(state.data, null, 2); download('evidenta.json', json); }
function exportLog(){ const text = state.log.join('\n'); download('log.txt', text || '(fara inregistrari)'); }
function importJson(file){
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error('Format invalid');
      for (const x of parsed){
        if (!('id' in x && 'nume' in x && 'TC' in x && 'UROVO' in x)) throw new Error('Lipsesc campuri');
        x.TC = Number(x.TC)||0; x.UROVO = Number(x.UROVO)||0;
      }
      pushHistory(); state.data = parsed;
      const logLine = `[${fmtDate()}] IMPORT evidenta.json (${parsed.length} angajati)`;
      state.log.push(logLine);
      saveLS(); render();
      if (state.endpoint) { pushRemote('import data', logLine).then(ok => { if (ok) fetchRemote(); else pendingSync = true; }); }
    }catch(e){ alert('Eroare la import: '+e.message); }
  };
  reader.readAsText(file);
}
function importLog(file){
  const reader = new FileReader();
  reader.onload = () => {
    const lines = String(reader.result).split(/\r?\n/).filter(Boolean);
    pushHistory(); state.log = lines; saveLS(); render();
    // nu trimitem tot logul; urmatoarele operatiuni vor apenda normal
  };
  reader.readAsText(file);
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  loadLS(); saveLS(); render();

  $('#btnExec')?.addEventListener('click', applyOperation);
  $('#btnUndo')?.addEventListener('click', ()=>{ if(!undo()) alert('Nimic de anulat.'); });
  $('#btnAdd')?.addEventListener('click', addEmployee);
  $('#btnReset')?.addEventListener('click', () => {
    if (!confirm('Stergi toate datele locale?')) return;
    pushHistory(); state.data = []; state.log = []; saveLS(); render();
    // reset local: nu apendam nimic in logul din repo
  });
  $('#btnExportJson')?.addEventListener('click', exportJson);
  $('#btnExportLog')?.addEventListener('click', exportLog);
  $('#fileData')?.addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) importJson(f); e.target.value=''; });
  $('#fileLog')?.addEventListener('change', (e)=>{ const f=e.target.files[0]; if(f) importLog(f); e.target.value=''; });
  $('#opOperator')?.addEventListener('change', render);
  $('#btnSyncNow')?.addEventListener('click', async ()=>{ 
    // sync manual: nu vrem sa duplicam loguri, deci nu trimitem nicio linie noua
    await pushRemote('sync manual', null);
    await fetchRemote();
  });

  await fetchRemote();

  window.addEventListener('online', async () => {
    if (pendingSync && state.endpoint) {
      setStatus('Conexiune revenita. Sincronizez...');
      const ok = await pushRemote('retry after offline', null);
      if (ok) { await fetchRemote(); pendingSync = false; }
    }
  });
});



