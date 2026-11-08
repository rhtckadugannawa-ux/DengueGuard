/* DengueGuard shared helpers.
   Keep this file in the SAME folder as index.html, patient-entry.html, health-officer.html, field-officer.html */
(function () {
  const GN_LIST = [["Alagalla Watta","190"],["Amunupura","191"],["Arambegama East","164"],["Arambegama West","165"],["Balana","198"],["Bathgoda","212"],["Bulumulla","125"],["Danthure","161"],["Dehianga North","159"],["Dehianga South","160"],["Dehideniya East","153"],["Dehideniya West","154"],["Dehigama East","143"],["Dehigama North","144"],["Dehigama South","145"],["Deldeniya","218"],["Diyapalagoda","147"],["Doluwa East","213"],["Doluwa West","214"],["Edanduwawa East","131"],["Edanduwawa West","132"],["Embilmeegama North","166"],["Embilmeegama South","167"],["Gannoruwa Central","136"],["Gannoruwa East","133"],["Gannoruwa West","135"],["Giragama","180"],["Godigamuwa","187"],["Gondeniya","188"],["Govindala","171"],["Gurugama","158"],["Haliyadda","174"],["Ihala Alagalla","189"],["Ihala Dodamwala","155"],["Ihala Kobbekaduwa","142"],["Ilukwatta","173"],["Imbulmalgama","182"],["Kadawathgama","204"],["Kadugannawa Town","205"],["Kandangama North","208"],["Kandangama South","209"],["Karuwalawatta","128"],["Kavudupana","207"],["Kendakaduwa","134"],["Ketakumbura","202"],["Kiribathkumbura East","129"],["Kiribathkumbura West","130"],["Kirimetiya Watta","186"],["Kobbekaduwa","141"],["Kotabogoda","175"],["Kotaligoda North","215"],["Kotaligoda South","216"],["Kudaoya","170"],["Kurunduwatta","169"],["Madarangoda","176"],["Madiligama","195"],["Malgammana","149"],["Maligathenna","203"],["Mamudawala","201"],["Mangalagama","146"],["Menikdiwela","217"],["Moladanda","148"],["Moragolla Mahakanda","200"],["Motana Dekinda","199"],["Mudaliwatta","193"],["Munwathugoda","162"],["Pahala Dodamwala","156"],["Pahala Mudaliwatta","194"],["Pahala Rathmeewala","197"],["Pahala Yatigammana","184"],["Panabokka","210"],["Parakatawella","181"],["Pelawa Ihala Meda","139"],["Pelawa Ihalagama","138"],["Pelawa Pahalagama","137"],["Pilapitiya","126"],["Pilimathalawa","172"],["Pottepitiya","185"],["Ranawana","150"],["Siyambalagoda","163"],["Sooriyagoda","127"],["Thismada","219"],["Uda Eriyagama East","151"],["Uda Eriyagama West","152"],["Udarathmeewala","196"],["Udawela Nadithalawa","177"],["Udawela Pahalagama","179"],["Udawela Pallemaditta","178"],["Urapola","168"],["Walgampaya","211"],["Walgowwagoda","206"],["Wathurakumbura","157"],["Weralugolla","192"],["Yahalathenna","140"],["Yatigammana","183"]];   // all 95 Yatinuwara GN divisions: [name, code]

  const pad = n => String(n).padStart(2, '0');
  const dateStr = (ago = 0) => { const d = new Date(); d.setDate(d.getDate() - ago); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Firebase (Firestore) data layer ----------
  // Collections: cases, activities, officers. Data is kept in a live in-memory cache that Firestore updates in real time.
  const cache = { cases: [], activities: [], officers: [], activityTypes: [] };
  let fdb = null, listeners = [], timer = null, connected = false;
  const live = {};
  const cases = () => cache.cases, acts = () => cache.activities, officersList = () => cache.officers, activityTypesList = () => cache.activityTypes;
  function setStatus(kind, text) {
    const el = document.getElementById('dbStatus'); if (!el) return;
    el.className = 'badge rounded-pill text-bg-' + kind; el.textContent = text;
  }
  function banner(kind, html) {
    let box = document.getElementById('dgBanner');
    if (!box) { box = document.createElement('div'); box.id = 'dgBanner'; box.style.cssText = 'position:relative;z-index:2000'; document.body.prepend(box); }
    box.className = 'alert alert-' + kind + ' m-3'; box.innerHTML = html;
  }
  const clearBanner = () => { const b = document.getElementById('dgBanner'); if (b) b.remove(); };
  function showError(err) {
    console.error(err);
    setStatus('danger', 'Firebase error');
    banner('danger', '<b>Firebase problem:</b> ' + esc((err && err.message) || err) +
      '<br><small>Check firebase-config.js, that the Firestore Database is created, and the Firestore rules.</small>');
  }
  // Nothing is saved unless the live server connection is confirmed (otherwise the data would be lost on refresh)
  function needConnection() {
    if (fdb && connected) return true;
    alert('Not connected to Firebase yet, so NOTHING was saved.\nWait for the green "Firebase connected" badge (top right), then try again.');
    return false;
  }
  // If the server never answers, ask Google directly (REST) and explain the exact reason on screen
  async function diagnose() {
    if (connected) return;
    const cfg = window.FIREBASE_CONFIG;
    const url = 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(cfg.projectId) + '/databases/(default)/documents/cases?pageSize=1&key=' + encodeURIComponent(cfg.apiKey);
    let msg, said = '';
    try {
      const r = await fetch(url), j = await r.json().catch(() => ({})), em = (j.error && j.error.message) || '';
      said = em ? '<br><small class="text-muted">Server said: ' + esc(em.slice(0, 300)) + '</small>' : '';
      if (r.ok) msg = 'Firestore is reachable and the rules allow access, but the live connection is being blocked (ad-blocker, VPN, proxy or antivirus). Try disabling extensions/VPN, or open the site with VS Code <b>Live Server</b> / Firebase Hosting instead of double-clicking the file.';
      else if (/datastore mode/i.test(em)) msg = '<b>The database was created in Datastore mode.</b> Firestore needs <b>Native mode</b>: create a new database in Native mode (Firebase console &rarr; Firestore Database).';
      else if (r.status === 404 || /does not exist/i.test(em)) msg = '<b>The Firestore database has not been created yet.</b> Firebase console &rarr; Build &rarr; <b>Firestore Database</b> &rarr; Create database &rarr; pick a location &rarr; start in test mode. Then reload this page.';
      else if (/has not been used|is disabled|SERVICE_DISABLED/i.test(em)) msg = 'The Cloud Firestore API is disabled for this project. Firebase console &rarr; Build &rarr; <b>Firestore Database</b> &rarr; Create database (this enables it), then reload.';
      else if (/referer|referrer|API key|API_KEY/i.test(em) || r.status === 400) msg = 'Google is not accepting the API key. Check <b>apiKey</b> in firebase-config.js, and in Google Cloud &rarr; Credentials make sure the key has no website restriction that blocks this page.';
      else if (r.status === 403) msg = 'The Firestore <b>rules</b> are denying access. Firebase console &rarr; Firestore Database &rarr; Rules &rarr; allow read, write (test mode) &rarr; Publish.';
      else msg = 'Google replied with status ' + r.status + '.';
    } catch (e) { msg = 'This browser cannot reach <b>firestore.googleapis.com</b> (internet, firewall, ad-blocker, antivirus or a VPN is blocking it).'; }
    if (!connected) { setStatus('danger', 'Not connected'); banner('warning', '<b>Cannot connect to Firebase yet.</b> ' + msg + said + '<br><small>Until this is fixed, saving is disabled so no data is lost.</small>'); }
  }
  const sortRecs = a => a.sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')) || (y.createdMs || 0) - (x.createdMs || 0));
  function notify() { clearTimeout(timer); timer = setTimeout(() => listeners.slice().forEach(f => f()), 0); }
  function onData(cb) { listeners.push(cb); cb(); }
  function listen(coll, since) {
    let q = fdb.collection(coll);
    if (since) q = q.where('date', '>=', since);   // only the last ~400 days are read (keeps Firestore reads low)
    q.onSnapshot({ includeMetadataChanges: true }, snap => {
      cache[coll] = snap.docs.map(d => Object.assign({ id: d.id }, d.data()));
      if (coll === 'officers') cache[coll].sort((a, b) => String(a.name).localeCompare(String(b.name)));
      else if (coll === 'activityTypes') cache[coll].sort((a, b) => String(a.label).localeCompare(String(b.label)));
      else sortRecs(cache[coll]);
      live[coll] = !snap.metadata.fromCache;
      connected = ['cases', 'activities', 'officers'].every(k => live[k]);
      setStatus(connected ? 'success' : 'warning', connected ? 'Firebase connected' : 'Connecting...');
      if (connected) clearBanner();
      notify();
    }, err => { live[coll] = false; connected = false; showError(err); });
  }
  function initDB() {
    const cfg = window.FIREBASE_CONFIG;
    if (typeof firebase === 'undefined') return showError('Firebase library could not load (check internet connection).');
    if (!cfg || !cfg.apiKey || /PASTE/i.test(cfg.apiKey)) return showError('Firebase is not configured yet. Open firebase-config.js and paste your web app config.');
    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      fdb = firebase.firestore();
      fdb.settings({ experimentalAutoDetectLongPolling: true, merge: true });
      const since = dateStr(400);
      listen('cases', since); listen('activities', since); listen('officers'); listen('activityTypes');
      setStatus('warning', 'Connecting...');
      setTimeout(diagnose, window.DG_DIAG_MS || 6000);
    } catch (e) { showError(e); }
  }
  function add(coll, obj) {   // returns the new document id immediately
    if (!needConnection()) return null;
    const ref = fdb.collection(coll).doc();
    ref.set(Object.assign({}, obj, { createdMs: Date.now() })).catch(showError);
    return ref.id;
  }
  function remove(coll, id) { if (!needConnection()) return; fdb.collection(coll).doc(id).delete().catch(showError); }
  function update(coll, id, obj) { if (!needConnection()) return; fdb.collection(coll).doc(id).update(obj).catch(showError); }

  // demo data is tagged demo:true so it can be removed without touching real records
  function seedDemo() {
    if (!needConnection()) return;
    const b = fdb.batch(), now = Date.now();
    const put = (c, o) => b.set(fdb.collection(c).doc(), Object.assign({}, o, { demo: true, createdMs: now }));
    [['PHI K. Perera', 'Health'], ['PHI S. Silva', 'Health'], ['PHI M. Fernando', 'Health'], ['FO N. Bandara', 'Community'], ['FO R. Jayasinghe', 'Community']]
      .forEach(([name, role]) => put('officers', { name, role }));
    const C = (d, gn, count) => put('cases', { date: dateStr(d), gnArea: gn, count, severity: 'DF', officerName: 'Demo' });
    [[0,'Pilimathalawa',2],[1,'Pilimathalawa',2],[2,'Pilimathalawa',2],[0,'Gurugama',1],[2,'Gurugama',2],[4,'Gurugama',2],[1,'Danthure',2],[3,'Danthure',2],
     [2,'Kadugannawa Town',1],[5,'Kadugannawa Town',2],[0,'Yatigammana',1],[3,'Embilmeegama North',1],[6,'Embilmeegama North',1]].forEach(a => C(...a));
    const A = (d, gn, officerType, officerName, activity, count, inspected, larvae, notes) =>
      put('activities', { date: dateStr(d), gnArea: gn, officerType, officerName, activity, count, inspected, larvae, notes });
    A(0,'Pilimathalawa','Health','PHI K. Perera','Premises Inspection',65,65,8,'High density larvae in rooftop guttering');
    A(1,'Pilimathalawa','Health','PHI K. Perera','Red Notice Issued',4,4,4,'Issued under Sec 2 (unattended construction)');
    A(2,'Gurugama','Health','PHI S. Silva','Premises Inspection',45,45,5,'Breeding sites in discarded containers');
    A(0,'Yatigammana','Health','PHI M. Fernando','Premises Inspection',30,30,1,'Single breeding site destroyed');
    A(1,'Danthure','Community','FO N. Bandara','Community Clean-up (Shramadana)',80,null,0,'Waste cleared with villagers');
    A(3,'Kadugannawa Town','Community','FO R. Jayasinghe','Space Spraying & Fogging',120,null,0,'Fogging around case houses');
    A(0,'Kadugannawa Town','Health','PHI M. Fernando','Larval Survey',35,35,3,'Ward-wise larval survey');
    A(1,'Gurugama','Health','PHI S. Silva','Thermal Fogging',60,null,0,'Fogging around case houses');
    A(1,'Gurugama','Health','PHI S. Silva','Notice Issued',3,null,0,'Notices under Sec 2');
    A(2,'Pilimathalawa','Health','PHI K. Perera','Prosecuted / Legal Action',1,null,0,'File referred to court');
    A(2,'Danthure','Community','FO N. Bandara','Community Awareness Programme',45,null,0,'School awareness session');
    b.commit().catch(showError);
  }
  async function removeDemo() {
    if (!needConnection()) return;
    try {
      for (const c of ['cases', 'activities', 'officers']) {
        const s = await fdb.collection(c).where('demo', '==', true).get();
        const b = fdb.batch(); s.forEach(d => b.delete(d.ref)); await b.commit();
      }
    } catch (e) { showError(e); }
  }

  // ---------- styles ----------
  const st = document.createElement('style');
  st.textContent = `.ss-wrap{position:relative}
    .ss-list{display:none;position:absolute;z-index:1050;left:0;right:0;max-height:240px;overflow-y:auto;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 8px 20px rgba(0,0,0,.12);margin-top:2px}
    .ss-item,.ss-empty{padding:7px 12px;font-size:14px}.ss-item{cursor:pointer}.ss-item:hover,.ss-item.active{background:#e0f2fe}.ss-empty{color:#94a3b8}
    .dg-red{background:#ef4444;color:#fff}.dg-orange{background:#f97316;color:#fff}.dg-yellow{background:#eab308;color:#000}
    .dg-risk{max-height:300px;overflow-y:auto}
    #riskMap{height:520px;width:100%;border-radius:8px;z-index:1;background:#dbe4ee}
    .dg-pin{background:none !important;border:0 !important}.dg-pin svg{filter:drop-shadow(0 2px 2px rgba(0,0,0,.45));overflow:visible}
    #riskMap[data-pin],#riskMap[data-draw]{height:420px}
    @media (min-width:992px){#riskMap[data-pin],#riskMap[data-draw]{height:620px}}
    .dg-nopath path.leaflet-interactive{pointer-events:none !important}
    #drawBar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px}
    #drawBar .btn.active{background:#1d4ed8;color:#fff;border-color:#1d4ed8}
    #drawBar input{width:76px}
    #drawNote{font-size:13px;padding:6px 10px;border-radius:8px;background:#f1f5f9;margin-bottom:6px}
    #drawNote.ok{background:#dcfce7}#drawNote.warn{background:#fee2e2;color:#991b1b}
    .dg-pinning,.dg-pinning .leaflet-interactive{cursor:crosshair !important}
    #pinBar{font-size:13px;padding:6px 10px;border-radius:8px;background:#f1f5f9;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap}
    #pinBar.ok{background:#dcfce7}#pinBar.warn{background:#fee2e2;color:#991b1b}
    @media (max-width:767.98px){#riskMap[data-pin],#riskMap[data-draw]{height:56vh;min-height:300px}}
    html{-webkit-text-size-adjust:100%}
    body{overflow-x:hidden}
    .dg-risk-head{cursor:default}
    @media (max-width:767.98px){
      .dg-risk-head{cursor:pointer}
      .dg-risk-collapsed{display:none}
      #riskMap{height:62vh;min-height:340px}
      .gn-label{font-size:10px !important;padding:0 3px !important}
    }
    @media (max-width:575.98px){
      .card-body{padding:.9rem}
      .dg-stack thead{display:none}
      .dg-stack,.dg-stack tbody,.dg-stack tr,.dg-stack td{display:block;width:100%}
      .dg-stack tr{border-bottom:1px solid #e2e8f0;padding:.55rem .85rem}
      .dg-stack td{position:relative;border:0 !important;padding:.2rem 0 .2rem 40% !important;min-height:1.6em;text-align:left;background:transparent !important;box-shadow:none !important}
      .dg-stack td::before{content:attr(data-label);position:absolute;left:0;top:.2rem;width:36%;font-weight:600;font-size:.8rem;color:#64748b}
      .dg-stack td[colspan]{padding-left:0 !important;text-align:center}
      .dg-stack td[colspan]::before{content:none}
    }
    .gn-label{background:rgba(255,255,255,.9);border:1px solid #475569;font-size:11px;font-weight:700;color:#0f172a;padding:1px 5px;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.25)}`;
  document.head.appendChild(st);

  // ---------- officers (shared list, stored in Firestore) ----------
  const officer = id => officersList().find(o => o.id === id) || { id: '', name: '' };
  function fillOfficers(sel) {
    const roles = (sel.dataset.roles || '*').split(','), cur = sel.value;
    [...sel.options].forEach(o => { if (o.value) o.remove(); });
    officersList().filter(o => roles[0] === '*' || roles.includes(o.role)).forEach(o => sel.add(new Option(o.name, o.id)));
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
    if (sel._ss) sel._ss.refresh();
  }
  function addOfficerPrompt(role, selId) {
    const name = (prompt('New officer name (e.g. PHI A. Kumara):') || '').trim();
    if (!name) return;
    const id = add('officers', { name, role }); if (!id) return;
    const sel = document.getElementById(selId);
    const pick = () => { fillOfficers(sel); if ([...sel.options].some(o => o.value === id)) { sel._ss.setValue(id); return true; } return false; };
    if (!pick()) listeners.push(function f() { if (pick()) listeners.splice(listeners.indexOf(f), 1); });
  }

  // ---------- custom activity / intervention types (shared list, stored in Firestore, on top of the built-in defaults) ----------
  function fillActivityTypes(sel) {
    const type = sel.dataset.acttype, cur = sel.value;
    const existing = new Set([...sel.options].map(o => o.value));   // built-in options are never removed
    activityTypesList().filter(o => o.type === type && o.label && !existing.has(o.label))
      .forEach(o => { sel.add(new Option(o.label, o.label)); existing.add(o.label); });
    if (cur && [...sel.options].some(o => o.value === cur)) sel.value = cur;
  }
  function addActivityPrompt(type, selId) {
    const label = (prompt('New activity / intervention type:') || '').trim();
    if (!label) return;
    const sel = document.getElementById(selId);
    if ([...sel.options].some(o => o.value === label)) { sel.value = label; sel.dispatchEvent(new Event('change')); return; }
    const id = add('activityTypes', { type, label }); if (!id) return;
    const pick = () => { fillActivityTypes(sel); if ([...sel.options].some(o => o.value === label)) { sel.value = label; return true; } return false; };
    if (!pick()) listeners.push(function f() { if (pick()) listeners.splice(listeners.indexOf(f), 1); });
  }

  // ---------- searchable select (type a few letters to filter) ----------
  function enhanceSelect(sel) {
    if (sel._ss) return sel._ss;
    const wrap = document.createElement('div'); wrap.className = 'ss-wrap';
    const input = document.createElement('input');
    input.type = 'text'; input.className = 'form-control'; input.autocomplete = 'off';
    input.placeholder = sel.dataset.placeholder || 'Type to search...';
    input.required = sel.required; sel.required = false;
    const list = document.createElement('div'); list.className = 'ss-list';
    sel.style.display = 'none';
    sel.after(wrap); wrap.append(input, list);
    let active = 0, items = [];
    const label = () => { const o = sel.selectedOptions[0]; return o && o.value ? o.text : ''; };
    const validity = () => input.setCustomValidity(input.required && !sel.value ? 'Please pick an item from the list' : '');
    function render() {
      const q = input.value.trim().toLowerCase();
      const all = !q || input.value === label();
      items = [...sel.options].filter(o => o.value && (all || o.text.toLowerCase().includes(q)));
      list.innerHTML = items.length
        ? items.map((o, i) => `<div class="ss-item${i === active ? ' active' : ''}" data-v="${esc(o.value)}">${esc(o.text)}</div>`).join('')
        : '<div class="ss-empty">No match</div>';
      list.style.display = 'block';
    }
    function choose(v) { sel.value = v; input.value = label(); list.style.display = 'none'; validity(); sel.dispatchEvent(new Event('change')); }
    input.addEventListener('focus', () => { input.select(); active = 0; render(); });
    input.addEventListener('input', () => { sel.value = ''; active = 0; validity(); render(); });
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        active = Math.max(0, Math.min(items.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1)));
        render();
        const a = list.querySelector('.active'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && list.style.display === 'block' && items.length) {
        e.preventDefault(); choose(items[active].value);
      } else if (e.key === 'Escape') { input.value = label(); list.style.display = 'none'; }
    });
    list.addEventListener('mousedown', e => { const it = e.target.closest('.ss-item'); if (it) { e.preventDefault(); choose(it.dataset.v); } });
    input.addEventListener('blur', () => { list.style.display = 'none'; input.value = label(); validity(); });
    if (sel.form) sel.form.addEventListener('reset', () => setTimeout(() => { input.value = label(); validity(); }, 0));
    validity();
    return (sel._ss = { refresh() { input.value = label(); validity(); }, setValue: choose });
  }

  // ---------- past-7-day risk areas (Red >=5, Orange 3-4, Yellow 1-2) ----------
  function weeklyRisk() {
    const from = dateStr(6), m = {}, names = new Set(GN_LIST.map(g => g[0]));
    cases().forEach(c => { if (c.date >= from && names.has(c.gnArea)) m[c.gnArea] = (m[c.gnArea] || 0) + Number(c.count || 0); });
    return Object.entries(m).filter(e => e[1] > 0).sort((a, b) => b[1] - a[1])
      .map(([name, cases]) => ({ name, cases, level: cases >= 5 ? 'red' : cases >= 3 ? 'orange' : 'yellow' }));
  }
  let riskOpen = false;   // phones: the risk list starts collapsed so the entry form is visible first (desktop always shows it)
  function renderRiskPanel() {
    const el = document.getElementById('riskPanel'); if (!el) return;
    const rows = weeklyRisk(), n = k => rows.filter(r => r.level === k).length;
    el.innerHTML = `<div class="card border-0 shadow-sm"><div class="card-header bg-white py-3 dg-risk-head" data-risk-toggle>
      <h6 class="fw-bold mb-2"><i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>Past 7 Days Risk Areas<i class="bi bi-chevron-${riskOpen ? 'up' : 'down'} float-end d-md-none"></i></h6>
      <span class="badge dg-red me-1">Red ${n('red')}</span><span class="badge dg-orange me-1">Orange ${n('orange')}</span><span class="badge dg-yellow">Yellow ${n('yellow')}</span>
      <div class="small text-muted mt-2">Click an area to select it in the form.</div></div>
      <div class="list-group list-group-flush dg-risk${riskOpen ? '' : ' dg-risk-collapsed'}">${rows.length
        ? rows.map(r => `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" data-gn="${esc(r.name)}">
            <span class="fw-semibold">${esc(r.name)}</span><span><span class="badge dg-${r.level}">${r.level[0].toUpperCase() + r.level.slice(1)}</span> <span class="ms-1 small text-muted">${r.cases} cases</span></span></button>`).join('')
        : '<div class="p-3 text-center text-muted small">No GN areas at risk this week.</div>'}</div></div>`;
  }

  // ---------- phone-friendly tables: each row becomes a small card (label : value) on narrow screens ----------
  function initStackTables() {
    document.querySelectorAll('table.dg-stack').forEach(tbl => {
      const heads = [...tbl.querySelectorAll('thead th')].map(th => th.textContent.trim().replace(/\s*\/\s*[\u0D80-\u0DFF].*$/, ''));
      const run = () => tbl.querySelectorAll('tbody tr').forEach(tr => [...tr.children].forEach((td, i) => {
        if (td.colSpan > 1 || td.dataset.label || !heads[i]) return;
        td.dataset.label = heads[i];
      }));
      if (tbl.tBodies[0]) new MutationObserver(run).observe(tbl.tBodies[0], { childList: true });
      run();
    });
  }

  // ---------- base maps (Street / Street + labels / Satellite / ...) shared by every map; the choice is remembered in this browser ----------
  function baseLayers() {
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/', esriAttr = 'Tiles &copy; Esri',
      cartoAttr = '&copy; OpenStreetMap contributors &copy; CARTO', carto = 'https://{s}.basemaps.cartocdn.com/rastertiles/';
    const tl = (url, o) => L.tileLayer(url, Object.assign({ maxZoom: 19, crossOrigin: true, attribution: esriAttr }, o));
    const cartoOpt = { subdomains: 'abcd', maxZoom: 20, attribution: cartoAttr };
    const sat = () => tl(esri + 'World_Imagery/MapServer/tile/{z}/{y}/{x}');
    const ref = p => tl(esri + 'Reference/' + p + '/MapServer/tile/{z}/{y}/{x}');   // transparent overlay tiles (roads / place names)
    return {
      'Street + all places': tl('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }),   // most complete names: schools, temples, hospitals, shops...
      'Street + labels': tl(carto + 'voyager/{z}/{x}/{y}{r}.png', cartoOpt),
      'Street': tl(carto + 'voyager_nolabels/{z}/{x}/{y}{r}.png', cartoOpt),
      'Satellite + roads + labels': L.layerGroup([sat(), ref('World_Transportation'), ref('World_Boundaries_and_Places')]),
      'Satellite': sat(),
      'Topographic': tl(esri + 'World_Topo_Map/MapServer/tile/{z}/{y}/{x}')
    };
  }
  function setupBase(map) {   // adds the saved (or default) base map, remembers later changes, returns {name: layer} for L.control.layers
    const base = baseLayers();
    let name = 'Topographic';
    try { const s = localStorage.getItem('dgBase'); if (s && base[s]) name = s; } catch (e) { /* storage blocked */ }
    base[name].addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem('dgBase', e.name); } catch (e2) { /* storage blocked */ } });
    return base;
  }

  // ---------- shared risk map (shown on the portal pages that contain <div id="riskMap">) ----------
  // Past-7-day risk is coloured by level; marked areas ALWAYS show their name + case count, safe areas show it on hover / when zoomed in.
  // PIN MODE  (<div id="riskMap" data-pin="1">,  patient-entry page): choose a GN division -> map zooms to ONLY that division -> tap to drop a patient pin.
  // DRAW MODE (<div id="riskMap" data-draw="1">, health / field portals): choose a GN division -> map zooms to it -> draw the area an activity covered
  //            (circle / box / free shape / line) + optional buffer. DG.getShape() returns it for saving.
  const RISK_COL = { red: '#ef4444', orange: '#f97316', yellow: '#eab308' };
  const PIN_PATH = 'M14 1C7 1 1.5 6.5 1.5 13.4 1.5 22.8 14 37 14 37S26.5 22.8 26.5 13.4C26.5 6.5 21 1 14 1z';
  let rmap = null, rLayer = null, rMoh = null, rRisk = {}, rSel = '', rPin = null, rPinMarker = null, drawer = null;
  const mapMode = () => { const b = document.getElementById('riskMap'); return !b ? '' : b.dataset.pin ? 'pin' : b.dataset.draw ? 'draw' : ''; };
  function pinIcon(color, count) {
    const mid = count > 1 ? '<text x="14" y="17.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Arial,sans-serif">' + count + '</text>' : '<circle cx="14" cy="13.5" r="4.5" fill="#fff"/>';
    return L.divIcon({ className: 'dg-pin', iconSize: [28, 38], iconAnchor: [14, 37], popupAnchor: [0, -34],
      html: '<svg width="28" height="38" viewBox="0 0 28 38"><path d="' + PIN_PATH + '" fill="' + color + '" stroke="#fff" stroke-width="2"/>' + mid + '</svg>' });
  }
  // colour per activity type (same colours on the portal drawing and on the main dashboard map)
  const ACT_COL = { 'Larval Survey': '#2563eb', 'Adult Mosquito Survey': '#0ea5e9', 'Thermal Fogging': '#f97316', 'Cold Fogging': '#06b6d4', 'Indoor Fogging': '#a855f7',
    'Fogging / Space Spraying': '#f97316', 'Premises Inspection': '#16a34a', 'Shramadana Waste Clearing': '#92400e', 'Larviciding (Chemical Spraying)': '#db2777' };
  const ACT_PALETTE = ['#ca8a04', '#0d9488', '#dc2626', '#4f46e5', '#65a30d', '#be123c', '#0369a1', '#7c3aed'];
  function actColor(t) {
    if (ACT_COL[t]) return ACT_COL[t];
    let h = 0; String(t || '').split('').forEach(ch => { h = (h * 31 + ch.charCodeAt(0)) >>> 0; });
    return ACT_PALETTE[h % ACT_PALETTE.length];
  }
  // point-in-polygon (ray casting) against the real GN boundary, so a pin can only be dropped inside the chosen division
  const ringHas = (ring, x, y) => { let r = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) r = !r; } return r; };
  const inPoly = (p, x, y) => ringHas(p[0], x, y) && !p.slice(1).some(h => ringHas(h, x, y));
  function inGN(name, ll) {
    const f = (window.GN_GEOJSON ? window.GN_GEOJSON.features : []).find(f => f.properties.GND_N === name); if (!f) return false;
    const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.some(p => inPoly(p, ll.lng, ll.lat));
  }
  function rStyle(f) {
    const name = f.properties.GND_N, r = rRisk[name];
    if (rSel) {   // a division is chosen: hide every other division
      if (name !== rSel) return { fillOpacity: 0, opacity: 0, weight: 0 };
      return { fillColor: r ? RISK_COL[r.level] : '#22c55e', fillOpacity: r ? 0.3 : 0.1, color: '#0f172a', weight: 3, opacity: 1 };
    }
    return { fillColor: r ? RISK_COL[r.level] : '#22c55e', fillOpacity: r ? 0.65 : 0, color: r ? '#334155' : '#94a3b8', weight: r ? 1.5 : 1, opacity: 1 };
  }
  function refreshRiskMap() {
    if (!rmap || !rLayer) return;
    rRisk = {}; weeklyRisk().forEach(r => { rRisk[r.name] = r; });
    rLayer.setStyle(rStyle);
    const zoomedIn = rmap.getZoom() >= 14;
    rLayer.eachLayer(l => {
      const name = l.feature.properties.GND_N, r = rRisk[name], hide = rSel && name !== rSel;
      const perm = !!r || zoomedIn || !!rSel, text = r ? esc(name) + ' (' + r.cases + ')' : esc(name), key = hide ? 'x' : (perm ? 'p' : 'h') + '|' + text;
      if (l._lblKey === key) return;
      l._lblKey = key; l.unbindTooltip();
      if (!hide) l.bindTooltip(text, perm ? { permanent: true, direction: 'center', className: 'gn-label' } : { sticky: true, className: 'gn-label' });
    });
  }

  // ----- PIN mode -----
  function pinBar(kind, html) {
    const bar = document.getElementById('pinBar'); if (!bar) return;
    bar.className = kind || ''; bar.innerHTML = html;
  }
  const pinHint = () => rSel
    ? pinBar('', '<span>Tap inside <b>' + esc(rSel) + '</b> to drop the patient\'s pin <span class="text-muted">(optional)</span></span>')
    : pinBar('', '<span>Choose the <b>GN Division</b> above – the map zooms to it, then tap the patient\'s location to drop a pin <span class="text-muted">(optional)</span>.</span>');
  function clearPin() {
    rPin = null;
    if (rPinMarker) { rPinMarker.remove(); rPinMarker = null; }
    if (mapMode() === 'pin') pinHint();
  }
  function placePin(ll) {
    rPin = { lat: +ll.lat.toFixed(6), lng: +ll.lng.toFixed(6) };
    if (!rPinMarker) {
      rPinMarker = L.marker(ll, { draggable: true, icon: pinIcon('#dc2626'), zIndexOffset: 1000, title: 'Drag to adjust' }).addTo(rmap);
      rPinMarker.on('dragend', () => {
        const p = rPinMarker.getLatLng();
        if (inGN(rSel, p)) { rPin = { lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }; pinOk(); }
        else { rPinMarker.setLatLng(rPin); pinBar('warn', '<span>That spot is outside <b>' + esc(rSel) + '</b> – the pin went back.</span>'); }
      });
    } else rPinMarker.setLatLng(ll);
    pinOk();
  }
  const pinOk = () => pinBar('ok', '<span><i class="bi bi-geo-alt-fill text-danger"></i> Pin placed in <b>' + esc(rSel) + '</b> – drag it to adjust.</span><button type="button" class="btn btn-sm btn-outline-danger py-0" data-pin-clear>Remove pin</button>');

  const typeSelect = () => document.querySelector('select[data-acttype]');
  // ----- DRAW tool (activity area): a self-contained tool that can be attached to ANY Leaflet map (portal map or the main dashboard map) -----
  // createDrawTool({ map, anchor, getSel, getType }): map = Leaflet map; anchor = element the tool bar is inserted before;
  // getSel() = the chosen GN division name ('' = none -> tools stay disabled); getType() = activity type (colours the shape).
  // Returns { getShape, clear, ui, recolor }.
  const TOOL_TIPS = {
    circle: 'Circle: press on the centre and drag outwards, release to finish.',
    box: 'Box: press on one corner and drag to the opposite corner, release to finish.',
    polygon: 'Shape: tap each corner of the area, then tap the first point again (or press Finish) to close it.',
    line: 'Line: tap the points along the road / lane, then tap the last point again (or press Finish). The buffer makes it a strip.'
  };
  function createDrawTool(o) {
    const rmap = o.map, sel = () => o.getSel() || '', typ = () => o.getType() || '';
    let dRaw = null, dRes = null, dLayer = null, dRawLayer = null, dHandler = null, dTool = '', dBufTouched = false;
    anchorBar(o.anchor);
    const bar = document.getElementById('drawBar');
    function drawNote(kind, html) { const n = document.getElementById('drawNote'); if (n) { n.className = kind || ''; n.innerHTML = html; } }
    const drawBuf = () => { const v = parseFloat((document.getElementById('drawBuf') || {}).value); return isFinite(v) && v > 0 ? Math.min(v, 2000) : 0; };
    function drawUI() {   // enable / highlight the tool buttons and show the right hint
      bar.querySelectorAll('[data-tool]').forEach(b => { b.disabled = !sel(); b.classList.toggle('active', b.dataset.tool === dTool); });
      bar.querySelectorAll('[data-act="finish"],[data-act="undo"]').forEach(b => { b.style.display = (dTool === 'polygon' || dTool === 'line') ? '' : 'none'; });
      bar.querySelector('[data-act="clear"]').style.display = (dRaw || dTool) ? '' : 'none';
      if (!sel()) drawNote('', 'Choose the <b>GN Division</b> – the map zooms to it, then draw the area covered by the activity.');
      else if (dTool) drawNote('', TOOL_TIPS[dTool]);
      else if (!dRes) drawNote('', 'Pick a tool (<b>Circle</b>, <b>Box</b>, <b>Shape</b> or <b>Line</b>) and draw the area covered inside <b>' + esc(sel()) + '</b>.');
    }
    function buildShape() {
      if (!dRaw || typeof turf === 'undefined') return null;
      const b = drawBuf();
      try {
        if (dRaw.type === 'circle') return turf.circle(dRaw.center, (dRaw.radius + b) / 1000, { steps: 64, units: 'kilometers' });
        if (dRaw.type === 'line') return turf.buffer(turf.lineString(dRaw.coords), Math.max(b, 5) / 1000, { units: 'kilometers', steps: 8 });
        const p = turf.polygon([dRaw.ring]);
        return b > 0 ? turf.buffer(p, b / 1000, { units: 'kilometers', steps: 8 }) : p;
      } catch (e) { console.error('Shape build failed:', e); return null; }
    }
    function shapeLayers() {
      if (dLayer) { dLayer.remove(); dLayer = null; }
      if (dRawLayer) { dRawLayer.remove(); dRawLayer = null; }
    }
    function renderShape() {
      shapeLayers();
      dRes = buildShape();
      if (!dRes) { drawUI(); return; }
      const col = actColor(typ());
      dLayer = L.geoJSON(dRes, { interactive: false, style: { color: col, weight: 3, fillColor: col, fillOpacity: 0.3 } }).addTo(rmap);
      const rawF = dRaw.type === 'circle' ? turf.circle(dRaw.center, dRaw.radius / 1000, { steps: 64, units: 'kilometers' }) : dRaw.type === 'line' ? turf.lineString(dRaw.coords) : turf.polygon([dRaw.ring]);
      dRawLayer = L.geoJSON(rawF, { interactive: false, style: { color: '#0f172a', weight: 2, dashArray: '5 5', fill: false } }).addTo(rmap);
      const m2 = turf.area(dRes), area = m2 >= 10000 ? (m2 / 10000).toFixed(2) + ' ha' : Math.round(m2) + ' m²';
      const names = { circle: 'Circle', box: 'Box', polygon: 'Shape', line: 'Line' };
      drawNote('ok', '<i class="bi bi-check-circle-fill text-success"></i> Area marked: <b>' + names[dRaw.type] + '</b>' + (drawBuf() || dRaw.type === 'line' ? ' + ' + (dRaw.type === 'line' ? Math.max(drawBuf(), 5) : drawBuf()) + ' m buffer' : '') + ' ≈ <b>' + area + '</b>. Change the buffer or draw again to replace it.');
      drawUI();
    }
    function stopTool() {
      if (dHandler) { try { dHandler.disable(); } catch (e) { /* already off */ } dHandler = null; }
      dTool = '';
    }
    function startTool(tool) {
      if (!sel() || !L.Draw) return;
      const same = dTool === tool; stopTool();
      if (same) { drawUI(); return; }   // pressing the active tool again switches it off
      dTool = tool;
      const so = { color: '#1d4ed8', weight: 2, fillOpacity: 0.15 };
      if (tool === 'circle') dHandler = new L.Draw.Circle(rmap, { shapeOptions: so, showRadius: true, metric: true });
      else if (tool === 'box') dHandler = new L.Draw.Rectangle(rmap, { shapeOptions: so, showArea: false, metric: true });
      else if (tool === 'polygon') dHandler = new L.Draw.Polygon(rmap, { shapeOptions: so, showArea: false, metric: true });
      else dHandler = new L.Draw.Polyline(rmap, { shapeOptions: { color: '#1d4ed8', weight: 4 }, metric: true });
      dHandler.enable();
      const bi = document.getElementById('drawBuf'); if (bi && !dBufTouched) bi.value = tool === 'line' ? 20 : 0;   // a line needs a width to become an area
      drawUI();
    }
    function clearShape() {
      stopTool(); shapeLayers(); dRaw = null; dRes = null; dBufTouched = false;
      drawUI();
    }
    function getShape() {
      if (!dRes || !dRaw) return null;
      const geom = JSON.stringify(dRes.geometry, (k, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);   // stored as text (Firestore has no nested arrays)
      return { shape: geom, shapeType: dRaw.type, bufferM: dRaw.type === 'line' ? Math.max(drawBuf(), 5) : drawBuf(), areaM2: Math.round(turf.area(dRes)) };
    }
    bar.addEventListener('click', e => {
      const t = e.target.closest('[data-tool]'), a = e.target.closest('[data-act]');
      if (t) startTool(t.dataset.tool);
      else if (a && a.dataset.act === 'finish') { try { dHandler && dHandler.completeShape(); } catch (x) { /* not enough points yet */ } }
      else if (a && a.dataset.act === 'undo') { try { dHandler && dHandler.deleteLastVertex(); } catch (x) { /* nothing to undo */ } }
      else if (a && a.dataset.act === 'clear') clearShape();
    });
    document.getElementById('drawBuf').addEventListener('input', () => { dBufTouched = true; if (dRaw) renderShape(); });
    if (!L.Draw || typeof turf === 'undefined') {
      bar.querySelectorAll('button,input').forEach(x => { x.disabled = true; });
      drawNote('warn', 'Drawing tools could not load (check the internet connection and reload).');
      return { getShape: () => null, clear() {}, ui() {}, recolor() {} };
    }
    // Leaflet.draw 1.0.4 has a bug in its area text with newer Leaflet; use our own text
    if (L.GeometryUtil) L.GeometryUtil.readableArea = a => a >= 10000 ? (a / 10000).toFixed(2) + ' ha' : Math.round(a) + ' m²';
    rmap.on(L.Draw.Event.CREATED, e => {
      const l = e.layer, t = e.layerType;
      if (t === 'circle') { const ll = l.getLatLng(); dRaw = { type: 'circle', center: [ll.lng, ll.lat], radius: l.getRadius() }; }
      else if (t === 'polyline') dRaw = { type: 'line', coords: l.getLatLngs().map(p => [p.lng, p.lat]) };
      else { const ring = l.getLatLngs()[0].map(p => [p.lng, p.lat]); ring.push(ring[0]); dRaw = { type: t === 'rectangle' ? 'box' : 'polygon', ring }; }
      dHandler = null; dTool = '';
      renderShape();
    });
    rmap.on(L.Draw.Event.DRAWSTOP, () => { dHandler = null; dTool = ''; drawUI(); });
    drawUI();
    return { getShape, clear: clearShape, ui: drawUI, recolor: () => { if (dRes) renderShape(); } };
  }
  function anchorBar(anchor) {   // the tool bar HTML (inserted just above the map)
    anchor.insertAdjacentHTML('beforebegin',
      '<div id="drawBar">' +
        '<div class="btn-group btn-group-sm" role="group">' +
          '<button type="button" class="btn btn-outline-primary" data-tool="circle"><i class="bi bi-circle me-1"></i>Circle</button>' +
          '<button type="button" class="btn btn-outline-primary" data-tool="box"><i class="bi bi-square me-1"></i>Box</button>' +
          '<button type="button" class="btn btn-outline-primary" data-tool="polygon"><i class="bi bi-pentagon me-1"></i>Shape</button>' +
          '<button type="button" class="btn btn-outline-primary" data-tool="line"><i class="bi bi-slash-lg me-1"></i>Line</button>' +
        '</div>' +
        '<label class="small mb-0 d-flex align-items-center gap-1" title="Extra width added around the drawn shape (a line becomes a strip this wide on each side)">Buffer <input type="number" id="drawBuf" class="form-control form-control-sm" min="0" max="2000" step="5" value="0"> m</label>' +
        '<button type="button" class="btn btn-sm btn-success" data-act="finish" style="display:none">Finish</button>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" data-act="undo" style="display:none">Undo point</button>' +
        '<button type="button" class="btn btn-sm btn-outline-danger" data-act="clear" style="display:none">Clear</button>' +
      '</div><div id="drawNote"></div>');
  }

  // ----- selection (GN division chosen in the form) -----
  function fitView() {   // whole chosen GN division fills the map (or the whole MOH area when none is chosen)
    if (!rSel) { rmap.fitBounds(rMoh.getBounds()); return; }
    rLayer.eachLayer(l => { if (l.feature.properties.GND_N === rSel) { l.bringToFront(); rmap.fitBounds(l.getBounds(), { padding: [18, 18], maxZoom: 18 }); } });
  }
  function refreshMap() {   // call after the map box was moved / resized
    if (!rmap) return;
    rmap.invalidateSize(); fitView();
    if (rPin && rPinMarker) rPinMarker.setLatLng([rPin.lat, rPin.lng]);
  }
  function setRiskSel(name) {   // called when the form's GN Division changes
    const mode = mapMode();
    if (!rmap || !mode) return;
    name = name || '';
    if (name === rSel && !rPin && !dRaw) return;
    if (name !== rSel) { clearPin(); if (drawer) drawer.clear(); }
    rSel = name;
    const cont = rmap.getContainer();
    cont.classList.toggle('dg-pinning', mode === 'pin' && !!rSel);
    cont.classList.toggle('dg-nopath', mode === 'draw' && !!rSel);   // while drawing, clicks must reach the map, not the hidden GN shapes
    refreshRiskMap();
    fitView();
    if (mode === 'pin') pinHint(); else if (drawer) drawer.ui();
  }
  function initRiskMap() {
    const box = document.getElementById('riskMap');
    if (!box || typeof L === 'undefined' || !window.GN_GEOJSON) return;
    try {
      const mode = mapMode(), pinMode = mode === 'pin', drawMode = mode === 'draw', selMode = pinMode || drawMode;
      if (pinMode) box.insertAdjacentHTML('beforebegin', '<div id="pinBar"></div>');
      rmap = L.map(box);
      L.control.layers(setupBase(rmap), null, { collapsed: true }).addTo(rmap);   // base map chooser: Street / Satellite / ...
      rmap.createPane('mohPane').style.zIndex = 450;
      rLayer = L.geoJSON(window.GN_GEOJSON, {
        style: rStyle,
        onEachFeature(f, layer) {
          const name = f.properties.GND_N;
          if (!selMode) layer.bindPopup(() => { const r = rRisk[name]; return '<div style="font-size:13px"><b>' + esc(name) + '</b><br>Past 7 days: <b>' + (r ? r.cases + ' cases (' + r.level + ')' : '0 cases') + '</b><div class="mt-1 text-primary">Click also selects it in the form</div></div>'; });
          layer.on({
            mouseover: e => { if (!rSel) e.target.setStyle({ weight: 3, color: '#000' }); },
            mouseout: e => { if (!rSel) rLayer.resetStyle(e.target); },
            click: e => {
              if (selMode && rSel) return;   // a division is chosen: the map click below (pin) / the draw tool handles it
              if (selMode) L.DomEvent.stopPropagation(e);
              const sel = document.querySelector('select[data-gn]'); if (sel && sel._ss) sel._ss.setValue(name);
            }
          });
        }
      }).addTo(rmap);
      rMoh = L.geoJSON(window.MOH_GEOJSON, { pane: 'mohPane', interactive: false, style: { color: '#0f172a', weight: 3.5, dashArray: '8, 6', fill: false } }).addTo(rmap);
      rmap.fitBounds(rMoh.getBounds());
      rmap.on('zoomend', refreshRiskMap);
      if (pinMode) {
        pinHint();
        rmap.on('click', e => {
          if (!rSel) return;
          if (inGN(rSel, e.latlng)) placePin(e.latlng);
          else pinBar('warn', '<span>That spot is outside <b>' + esc(rSel) + '</b> – tap inside the highlighted area.</span>');
        });
        document.getElementById('pinBar').addEventListener('click', e => { if (e.target.closest('[data-pin-clear]')) clearPin(); });
      }
      if (drawMode) {
        drawer = createDrawTool({ map: rmap, anchor: box, getSel: () => rSel, getType: () => { const t = typeSelect(); return t ? t.value : ''; } });
        const ts = typeSelect(); if (ts) ts.addEventListener('change', () => drawer.recolor());
      }
      if (selMode) {
        const sel = document.querySelector('select[data-gn]');
        if (sel) {
          sel.addEventListener('change', () => setRiskSel(sel.value));
          if (sel.form) sel.form.addEventListener('reset', () => setTimeout(() => { clearPin(); if (drawer) drawer.clear(); setRiskSel(''); }, 0));
        }
      }
      refreshRiskMap();
    } catch (e) { console.error('Risk map failed to load:', e); box.innerHTML = '<div class="p-4 text-center text-danger">Map could not load (Leaflet blocked or offline).</div>'; rmap = null; }
  }
  // big map on the RIGHT (above the log) on desktop; inside the form (under GN Division) on phones / tablets
  function autoPlaceMap(wrapId, formSlotId, sideSlotId) {
    const wrap = document.getElementById(wrapId), mq = window.matchMedia('(min-width: 992px)');
    if (!wrap) return;
    const place = () => {
      document.getElementById(mq.matches ? sideSlotId : formSlotId).appendChild(wrap);
      wrap.className = mq.matches ? 'card border-0 shadow-sm p-3 mb-4' : 'mb-3';
      refreshMap();
    };
    place(); mq.addEventListener('change', place);
  }

  // ---------- init ----------
  function init() {
    document.querySelectorAll('select[data-gn]').forEach(sel => {
      sel.insertAdjacentHTML('beforeend', GN_LIST.map(g => `<option value="${esc(g[0])}">${esc(g[0])}</option>`).join(''));
      enhanceSelect(sel);
    });
    document.querySelectorAll('select[data-officer]').forEach(enhanceSelect);
    const panel = document.getElementById('riskPanel');
    if (panel) {
      panel.addEventListener('click', e => {
        if (e.target.closest('[data-risk-toggle]')) { riskOpen = !riskOpen; renderRiskPanel(); return; }
        const b = e.target.closest('[data-gn]'), sel = document.querySelector('select[data-gn]');
        if (b && sel && sel._ss) sel._ss.setValue(b.dataset.gn);
      });
    }
    initStackTables();
    initRiskMap();
    initDB();
    onData(() => {
      document.querySelectorAll('select[data-officer]').forEach(fillOfficers);
      document.querySelectorAll('select[data-acttype]').forEach(fillActivityTypes);
      renderRiskPanel();
      refreshRiskMap();
    });
  }
  window.DG = { GN_LIST, dateStr, esc, officer, addOfficerPrompt, addActivityPrompt, fillActivityTypes, renderRiskPanel, enhanceSelect, onData, pinIcon, setupBase, refreshMap, actColor, createDrawTool, getShape: () => drawer ? drawer.getShape() : null, clearShape: () => { if (drawer) drawer.clear(); }, autoPlaceMap,
    getPin: () => rPin ? { lat: rPin.lat, lng: rPin.lng } : null, clearPin,
    db: { cases, acts, officers: officersList, activityTypes: activityTypesList, add, remove, update, seedDemo, removeDemo } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();