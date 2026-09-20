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
    .dg-risk{max-height:300px;overflow-y:auto}`;
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
  function renderRiskPanel() {
    const el = document.getElementById('riskPanel'); if (!el) return;
    const rows = weeklyRisk(), n = k => rows.filter(r => r.level === k).length;
    el.innerHTML = `<div class="card border-0 shadow-sm"><div class="card-header bg-white py-3">
      <h6 class="fw-bold mb-2"><i class="bi bi-exclamation-triangle-fill text-danger me-2"></i>Past 7 Days Risk Areas</h6>
      <span class="badge dg-red me-1">Red ${n('red')}</span><span class="badge dg-orange me-1">Orange ${n('orange')}</span><span class="badge dg-yellow">Yellow ${n('yellow')}</span>
      <div class="small text-muted mt-2">Click an area to select it in the form.</div></div>
      <div class="list-group list-group-flush dg-risk">${rows.length
        ? rows.map(r => `<button type="button" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" data-gn="${esc(r.name)}">
            <span class="fw-semibold">${esc(r.name)}</span><span><span class="badge dg-${r.level}">${r.level[0].toUpperCase() + r.level.slice(1)}</span> <span class="ms-1 small text-muted">${r.cases} cases</span></span></button>`).join('')
        : '<div class="p-3 text-center text-muted small">No GN areas at risk this week.</div>'}</div></div>`;
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
        const b = e.target.closest('[data-gn]'), sel = document.querySelector('select[data-gn]');
        if (b && sel && sel._ss) sel._ss.setValue(b.dataset.gn);
      });
    }
    initDB();
    onData(() => {
      document.querySelectorAll('select[data-officer]').forEach(fillOfficers);
      document.querySelectorAll('select[data-acttype]').forEach(fillActivityTypes);
      renderRiskPanel();
    });
  }
  window.DG = { GN_LIST, dateStr, esc, officer, addOfficerPrompt, addActivityPrompt, fillActivityTypes, renderRiskPanel, enhanceSelect, onData,
    db: { cases, acts, officers: officersList, activityTypes: activityTypesList, add, remove, update, seedDemo, removeDemo } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();