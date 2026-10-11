(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const N = n => (n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
  const eur = n => (n ? N(Math.round(n)) + ' €' : '');
  const dIt = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const immIt = c => (c.imm ? c.imm.slice(5, 7) + '/' + c.imm.slice(0, 4) : 'n.d.');
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  const FACETS = [
    { k: 'stato', label: 'Stato', open: true },
    { k: 'brand', label: 'Marca', open: true },
    { k: 'family', label: 'Modello', open: true, max: 12 },
    { k: 'fuel', label: 'Alimentazione', open: true },
    { k: 'cambio', label: 'Cambio' },
    { k: 'ubic', label: 'Ubicazione attuale', open: true },
    { k: 'ingresso', label: 'Sede di ingresso' },
    { k: 'colorG', label: 'Colore', sw: true },
    { k: 'section', label: 'Categoria del listino', max: 8 },
    { k: 'antic', label: 'Anticipata', max: 6 },
    { k: 'vend', label: 'Venditore', max: 8 }
  ];
  const RANGES = [
    { k: 'prezzo', label: 'Prezzo totale (€)', step: 500, open: true },
    { k: 'km', label: 'Chilometri', step: 5000, open: true },
    { k: 'anno', label: 'Anno di immatricolazione', step: 1, open: true },
    { k: 'cv', label: 'Potenza (CV)', step: 5, open: true },
    { k: 'giorni', label: 'Anzianità in stock (giorni)', step: 10, open: true, quick: [[null, 30, 'fino a 30'], [31, 60, '31–60'], [61, 90, '61–90'], [91, null, 'oltre 90'], [181, null, 'oltre 180']] }
  ];
  const TRIS = [
    { k: 'as', label: 'Su AutoScout' }, { k: 'hasPrice', label: 'Con prezzo', get: c => c.prezzo > 0 }, { k: 'check', label: 'Check list fatta' },
    { k: 'spec', label: 'Prezzo speciale' }, { k: 'iva', label: 'IVA esposta' }, { k: 'mini', label: 'Mini PP' }, { k: 'fv', label: 'Foglio verde' }
  ];
  const ZERO_OK = { km: 1, giorni: 1 };

  const S = { cars: [], meta: {}, prev: null, vocab: [], Q: parseQuery('', []), view: 'cards', shown: 60, list: [], delta: null, prevMap: null, gone: [] };
  let F;
  const resetF = () => { F = { disp: 'all', sets: {}, r: {}, tri: {}, delta: null, preset: null }; FACETS.forEach(f => { F.sets[f.k] = new Set(); }); };
  resetF();
  const expanded = new Set();

  /* ---------- dati ---------- */
  function setData(data, prev) {
    S.cars = data.cars; S.meta = data.meta; S.prev = prev || null;
    S.cars.forEach(c => { c._h = deacc([c.targa, c.brand, c.family, c.modello, c.colore, c.ubic, c.vend, c.acq, c.note, c.section, c.stato, c.antic].join(' ').toLowerCase()); });
    S.vocab = buildVocab(S.cars);
    S.prevMap = null; S.gone = []; S.delta = null;
    if (prev && prev.cars && prev.meta.day !== data.meta.day) {
      const pm = new Map(prev.cars.map(c => [c.targa, c])), cur = new Set(S.cars.map(c => c.targa));
      S.prevMap = pm;
      S.gone = prev.cars.filter(c => !cur.has(c.targa));
      S.gone.forEach(c => { c._h = deacc([c.targa, c.brand, c.family, c.modello, c.colore, c.ubic].join(' ').toLowerCase()); c._gone = true; });
      S.cars.forEach(c => { const p = pm.get(c.targa); c._d = !p ? 'new' : null; c._dp = p && p.prezzo !== c.prezzo ? p.prezzo : null; c._ds = p && (p.st !== c.st || p.booked !== c.booked) ? p.stato : null; });
      S.delta = { day: prev.meta.day, new: S.cars.filter(c => c._d === 'new').length, gone: S.gone.length, price: S.cars.filter(c => c._dp != null).length, state: S.cars.filter(c => c._ds != null).length };
    }
    resetF();
    S.Q = parseQuery($('q').value, S.vocab);
    renderMeta(); renderKpis(); renderDelta(); renderViews(); renderFilters(true); apply();
  }

  function demoData() {
    const day = new Date().toISOString().slice(0, 10);
    const rows = [
      [0, 'VW', 'GOLF 8 LIFE 1.0 ETSI EVO 81 KW (110 CV) DSG', 'GOLF', 12, '2023-06', 31840, 'Dolphin Grey Metallizzato', 22950, 'Tiburtina 2', 1],
      [0, 'VW', 'NUOVO T-ROC STYLE 1.0 TSI 81 KW (110 CV) MANUALE', 'T-ROC', 47, '2023-03', 28410, 'Pure White', 23650, 'Tiburtina', 1],
      [1, 'VW', 'T-CROSS STYLE 1.0 TSI 70 KW (95 CV) MANUALE', 'TCROSS', 23, '2022-11', 40122, 'Reflex Silver Metallizzato', 19150, 'Prenestina', 1],
      [0, 'VW', 'NUOVA POLO LIFE 1.0 TSI 70 KW (95 CV) DSG', 'POLO BENZINA', 104, '2023-10', 19860, 'Reef Blue Metallizzato', 18600, 'Tuscolana', 1],
      [7, 'VW', 'TIGUAN R-LINE 2.0 TDI SCR 110 KW (150 CV) DSG', 'TIGUAN', 2, '2024-02', 26300, 'Deep Black Perlato', 0, 'Tiburtina', 0],
      [0, 'VW', 'ID.3 PRO PERFORMANCE BATTERIA DA 58KWH 150 KW', 'VW ID', 131, '2023-09', 46014, 'Glacier White Metallizzato', 24950, 'Tiburtina 1128', 1],
      [6, 'VW', 'TAIGO 1.0 TSI LIFE 95CV', 'TAIGO', 9, '2023-05', 37215, 'Smoky Grey Metallizzato', 0, 'Autocentro Tiburtina Carrozzeria', 0],
      [0, 'VW', '1.0 EVO MOVE UP! 48KW 65CV', 'UP BENZINA', 74, '2023-08', 31882, 'Pure White', 13950, 'Tiburtina 2', 1],
      [0, 'AM', '500 MY22 1.0 GSE HYBRID CLUB 51KW (70PS)', 'REMARKETING EUROPA', 66, '2023-04', 22790, 'Bianco Gelato', 13450, 'Corvaglia', 0],
      [1, 'AM', 'FORMENTOR 1.5 TSI 110KW 7-SPEED AUTOMATIC 4 DOORS', 'VTI ITALIA', 38, '2022-12', 35110, 'Grigio', 27650, 'Tiburtina 1128', 1],
      [0, 'AM', 'Q3 SPORTBACK 35 TDI S TRONIC 150CV', 'VTI ITALIA', 190, '2022-11', 58720, 'Nero', 33750, 'Tuscolana', 1],
      [0, 'VW', 'GOLF GTI 2.0 TSI 180 KW (245 CV) DSG', 'GOLF', 18, '2023-11', 21400, 'Kings Red Metallizzato', 38650, 'Tiburtina', 1]
    ];
    const cars = rows.map((r, i) => {
      const d = describe(r[2], r[1], r[3]);
      const ingr = new Date(Date.now() - r[4] * 864e5).toISOString().slice(0, 10);
      const c = { targa: 'ES' + String(101 + i * 37).padStart(3, '0') + 'MP', st: r[0], stato: STATI[r[0]], marcaRaw: r[1], brand: d.brand, family: d.family, modello: r[2], ingr, giorni: r[4], imm: r[5], anno: +r[5].slice(0, 4), km: r[6], colore: r[7], colorG: colorGroup(r[7]), spec: i === 3, check: r[0] === 1, checkDate: '', as: !!r[10], asDate: r[10] ? ingr : '', note: '-P-', iva: i % 4 === 0, prezzoV: r[8] ? r[8] - 700 : 0, pp: r[8] ? 700 : 0, prezzo: r[8], ingresso: 'Tiburtina', ubic: r[9], antic: '03 - C/ANT USATO VW BANK 1', mini: true, acq: r[0] === 1 ? 'Cliente di esempio' : '', dataPren: r[0] === 1 ? day : '', caparra: 0, modVen: r[0] === 1 ? 'PVV VWBK' : '', fv: false, vend: r[0] === 1 ? 'Venditore di esempio' : '', section: r[3], cv: d.cv, kw: d.kw, fuel: d.fuel, cambio: d.cambio };
      c.free = c.st === 0 && !c.acq; c.booked = c.st === 1 || !!c.acq;
      return c;
    });
    return { cars, meta: { demo: true, day, count: cars.length } };
  }

  /* ---------- filtro ---------- */
  function pass(c, skip) {
    if (F.disp === 'free' && !c.free) return false;
    if (F.disp === 'booked' && !c.booked) return false;
    if (F.delta === 'new' && c._d !== 'new') return false;
    if (F.delta === 'price' && c._dp == null) return false;
    if (F.delta === 'state' && c._ds == null) return false;
    for (const k in F.sets) { const s = F.sets[k]; if (s.size && k !== skip && !s.has(c[k] || 'n.d.')) return false; }
    for (const k in F.r) {
      const [lo, hi] = F.r[k]; if (lo == null && hi == null) continue;
      const v = c[k]; if (v == null || (!v && !ZERO_OK[k])) return false;
      if (lo != null && v < lo) return false; if (hi != null && v > hi) return false;
    }
    for (const t of TRIS) { const want = F.tri[t.k]; if (want == null) continue; if ((t.get ? t.get(c) : !!c[t.k]) !== want) return false; }
    if (F.preset === 'recentBooked' && !(c.dataPren && dayDiff(S.meta.day, c.dataPren) <= 7)) return false;
    return matchQuery(c, S.Q);
  }
  const SORTS = {
    ingr: (a, b) => (a.giorni ?? 1e9) - (b.giorni ?? 1e9), old: (a, b) => (b.giorni ?? -1) - (a.giorni ?? -1),
    pa: (a, b) => (a.prezzo || 1e12) - (b.prezzo || 1e12), pd: (a, b) => b.prezzo - a.prezzo,
    km: (a, b) => a.km - b.km, anno: (a, b) => (b.imm > a.imm ? 1 : b.imm < a.imm ? -1 : 0), cv: (a, b) => b.cv - a.cv
  };
  /* colonne della tabella: [titolo, valore, numerica] */
  const stLabel = c => (c._gone ? 'Uscita' : c.free ? 'Libera' : c.booked && c.st < 2 ? 'Prenotata' : c.stato);
  const TCOLS = [['Stato', stLabel], ['Targa', c => c.targa], ['Veicolo', c => c.brand + ' ' + c.family], ['Allestimento', c => c.modello], ['Imm.', c => c.imm],
    ['Km', c => c.km, 1], ['CV', c => c.cv || null, 1], ['Alim.', c => c.fuel], ['Cambio', c => c.cambio], ['Colore', c => c.colore], ['Prezzo', c => c.prezzo || null, 1],
    ['Ubicazione', c => c.ubic], ['Giorni', c => c.giorni, 1], ['AutoScout', c => (c.as ? 'Sì' : 'No')], ['Acquirente', c => c.acq], ['Venditore', c => c.vend]];
  function colCmp({ i, dir }) {
    const get = TCOLS[i][1], num = TCOLS[i][2];
    return (a, b) => {
      const x = get(a), y = get(b), ex = x == null || x === '', ey = y == null || y === '';
      if (ex || ey) return ex - ey;                      // i vuoti sempre in fondo
      return dir * (num ? x - y : String(x).localeCompare(String(y), 'it', { numeric: true, sensitivity: 'base' }));
    };
  }
  function apply() {
    const src = F.delta === 'gone' ? S.gone : S.cars;
    S.list = src.filter(c => pass(c)).sort(S.col ? colCmp(S.col) : SORTS[$('sort').value] || SORTS.ingr);
    S.shown = 60;
    renderUnderstood(); renderCount(); renderActive(); renderFacetCounts(); renderList(); syncPressed();
  }

  /* ---------- testata, KPI, viste ---------- */
  function renderMeta() {
    const m = S.meta;
    if (m.demo) { $('metaLine').textContent = 'Dati di esempio'; $('demo').hidden = false; return; }
    $('demo').hidden = true;
    const ok = m.expected != null && m.expected === m.count && !(m.badSec || []).length;
    const when = m.printDate ? `Stampa del ${dIt(m.day)} ore ${m.printDate.slice(11)}` : 'Stampa caricata';
    $('metaLine').innerHTML = `${esc(when)} · <b class="${ok ? '' : 'warn'}">${ok ? N(m.count) + ' veicoli, totale verificato' : N(m.count) + ' letti su ' + N(m.expected || 0) + ' dichiarati'}</b>${m.day && m.day < new Date().toLocaleDateString('sv') ? ' · <b class="warn">non è la stampa di oggi</b>' : ''}`;
  }
  const PRESETS = {
    all: { label: 'Veicoli in stock', set() {} },
    free: { label: 'Libere', color: 'var(--ok)', set() { F.disp = 'free'; } },
    booked: { label: 'Prenotate', color: 'var(--warn)', set() { F.disp = 'booked'; } },
    arr: { label: 'In arrivo', color: 'var(--info)', set() { F.sets.stato.add('In arrivo'); } },
    rip: { label: 'In riparazione', color: 'var(--bad)', set() { F.sets.stato.add('In riparazione'); } },
    old: { label: 'Libere da oltre 90 giorni', color: 'var(--bad)', set() { F.disp = 'free'; F.r.giorni = [91, null]; } },
    noAs: { label: 'Libere non su AutoScout', set() { F.disp = 'free'; F.tri.as = false; } },
    noPrice: { label: 'Libere senza prezzo', set() { F.disp = 'free'; F.tri.hasPrice = false; } },
    recentBooked: { label: 'Prenotate negli ultimi 7 giorni', set() { F.disp = 'booked'; F.preset = 'recentBooked'; } },
    spec: { label: 'Prezzo speciale', set() { F.tri.spec = true; } },
    check: { label: 'Check list fatta', set() { F.tri.check = true; } }
  };
  let activePreset = 'all';
  function countPreset(id) { const keep = F, kp = activePreset; resetF(); PRESETS[id].set(); const Q = S.Q; S.Q = parseQuery('', []); const n = S.cars.filter(c => pass(c)).length; S.Q = Q; F = keep; activePreset = kp; return n; }
  function usePreset(id) { resetF(); PRESETS[id].set(); activePreset = id; $('q').value = ''; S.Q = parseQuery('', S.vocab); $('qClear').hidden = true; renderFilters(true); apply(); }
  function renderKpis() {
    const free = S.cars.filter(c => c.free), g = free.filter(c => c.giorni != null);
    const avg = g.length ? Math.round(g.reduce((a, c) => a + c.giorni, 0) / g.length) : 0;
    const val = free.reduce((a, c) => a + c.prezzo, 0);
    const tiles = ['all', 'free', 'booked', 'arr', 'rip', 'old'].map(id => `<button class="kpi glass" data-preset="${id}" aria-pressed="false"><span class="v num">${N(countPreset(id))}</span><span class="l">${PRESETS[id].color ? `<i class="dot" style="background:${PRESETS[id].color}"></i>` : ''}${PRESETS[id].label}</span></button>`);
    tiles.push(`<div class="kpi glass"><span class="v num">${avg}<small style="font-size:14px;font-weight:500"> gg</small></span><span class="l">Giacenza media delle libere</span></div>`);
    tiles.push(`<div class="kpi glass"><span class="v num">${val >= 1e6 ? (val / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' M€' : eur(val) || '0 €'}</span><span class="l">Valore a listino delle libere</span></div>`);
    $('kpis').innerHTML = tiles.join('');
  }
  function renderViews() {
    $('views').innerHTML = '<span class="lab">Viste rapide</span>' + ['noAs', 'noPrice', 'recentBooked', 'spec', 'check'].map(id => `<button class="chip" data-preset="${id}" aria-pressed="false">${PRESETS[id].label} <span class="n">${N(countPreset(id))}</span></button>`).join('');
  }
  function renderDelta() {
    const d = S.delta; $('delta').hidden = !d; if (!d) return;
    const b = (k, n, t) => `<button class="chip" data-delta="${k}" aria-pressed="false">${t} <span class="n">${N(n)}</span></button>`;
    $('delta').innerHTML = `<span class="lab">Cambiato dal ${dIt(d.day)}</span>` + b('new', d.new, 'Nuovi ingressi') + b('gone', d.gone, 'Usciti dallo stock') + b('price', d.price, 'Prezzo cambiato') + b('state', d.state, 'Stato cambiato');
  }
  function syncPressed() {
    document.querySelectorAll('[data-preset]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.preset === activePreset && (activePreset !== 'all'))));
    document.querySelectorAll('[data-delta]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.delta === F.delta)));
  }

  /* ---------- pannello filtri ---------- */
  let pendingScroll = null;
  function renderFilters() {
    const seg = (k, opts, cur) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`).join('')}</div>`;
    let h = `<div class="fhead"><h2>Filtri</h2><span><button class="linkbtn" id="fReset">Azzera</button> <button class="linkbtn sheet-close" id="fClose">· Chiudi</button></span></div>`;
    h += `<div style="padding:4px 0 12px">${seg('disp', [['all', 'Tutte'], ['free', 'Libere'], ['booked', 'Prenotate']], F.disp)}</div>`;
    const facet = f => `<details class="fg" ${f.open ? 'open' : ''} data-fk="${f.k}"><summary><span>${f.label}<span class="cnt" hidden></span></span></summary><div class="body" id="f_${f.k}"></div></details>`;
    const range = r => { const v = F.r[r.k] || [null, null]; return `<details class="fg" ${r.open ? 'open' : ''}><summary><span>${r.label}</span></summary><div class="body"><div class="range"><label for="r_${r.k}_0">Da<input id="r_${r.k}_0" type="number" inputmode="numeric" min="0" step="${r.step}" data-r="${r.k}" data-i="0" value="${v[0] ?? ''}"></label><label for="r_${r.k}_1">A<input id="r_${r.k}_1" type="number" inputmode="numeric" min="0" step="${r.step}" data-r="${r.k}" data-i="1" value="${v[1] ?? ''}"></label></div>${(r.quick || []).map(q => `<button class="chip" data-q="${r.k}" data-lo="${q[0] ?? ''}" data-hi="${q[1] ?? ''}" aria-pressed="${v[0] === q[0] && v[1] === q[1]}">${q[2]}</button>`).join('')}</div></details>`; };
    h += facet(FACETS[0]) + facet(FACETS[1]) + facet(FACETS[2]) + range(RANGES[0]) + range(RANGES[1]) + range(RANGES[2]) + range(RANGES[3]) + facet(FACETS[3]) + facet(FACETS[4]) + range(RANGES[4]) + FACETS.slice(5).map(facet).join('');
    h += `<details class="fg" open><summary><span>Altro</span></summary><div class="body">${TRIS.map(t => `<div class="tri"><span>${t.label}</span>${seg('tri:' + t.k, [['', 'Tutte'], ['true', 'Sì'], ['false', 'No']], F.tri[t.k] == null ? '' : F.tri[t.k])}</div>`).join('')}</div></details>`;
    pendingScroll = $('filters').scrollTop;
    $('filters').innerHTML = h;
  }
  function renderFacetCounts() {
    const src = F.delta === 'gone' ? S.gone : S.cars;
    for (const f of FACETS) {
      const counts = new Map();
      for (const c of src) { const v = c[f.k] || 'n.d.'; if (!counts.has(v)) counts.set(v, 0); if (pass(c, f.k)) counts.set(v, counts.get(v) + 1); }
      const sel = F.sets[f.k];
      let opts = [...counts.entries()].sort((a, b) => (sel.has(b[0]) - sel.has(a[0])) || b[1] - a[1] || String(a[0]).localeCompare(b[0]));
      opts = opts.filter(o => o[1] > 0 || sel.has(o[0]));
      const total = opts.length, lim = f.max && !expanded.has(f.k) ? Math.max(f.max, sel.size) : total;
      opts = opts.slice(0, lim);
      const el = $('f_' + f.k); if (!el) continue;
      el.innerHTML = opts.map(([v, n]) => `<button class="chip${n ? '' : ' zero'}" data-f="${f.k}" data-v="${esc(v)}" aria-pressed="${sel.has(v)}">${f.sw ? `<i class="sw" style="background:${COLOR_HEX[v] || '#9aa3b2'}"></i>` : ''}${esc(v)} <span class="n">${N(n)}</span></button>`).join('') + (f.max && total > f.max ? `<button class="linkbtn" data-more="${f.k}">${expanded.has(f.k) ? 'Mostra meno' : 'Mostra tutti (' + total + ')'}</button>` : '');
      const badge = el.parentElement.querySelector('.cnt'); badge.hidden = !sel.size; badge.textContent = sel.size;
    }
    if (pendingScroll != null) { $('filters').scrollTop = pendingScroll; pendingScroll = null; }
    document.querySelectorAll('[data-seg="disp"] button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === F.disp)));
  }

  /* ---------- risultati ---------- */
  function renderUnderstood() {
    const ch = S.Q.chips; $('understood').hidden = !ch.length;
    $('understood').innerHTML = ch.length ? '<span>Ho capito:</span>' + ch.map(c => `<span class="u">${esc(c)}</span>`).join('') : '';
  }
  function renderCount() {
    const n = S.list.length, tot = (F.delta === 'gone' ? S.gone : S.cars).length;
    $('count').innerHTML = `<span class="num">${N(n)}</span> ${n === 1 ? 'veicolo' : 'veicoli'}<small>${n === tot ? '' : 'su ' + N(tot)}${F.delta === 'gone' ? ' usciti dallo stock' : ''}</small>`;
  }
  function renderActive() {
    const a = [];
    if (F.disp !== 'all') a.push(['disp', F.disp === 'free' ? 'Libere' : 'Prenotate']);
    if (F.delta) a.push(['delta', { new: 'Nuovi ingressi', gone: 'Usciti dallo stock', price: 'Prezzo cambiato', state: 'Stato cambiato' }[F.delta]]);
    if (F.preset === 'recentBooked') a.push(['preset', 'Prenotate negli ultimi 7 giorni']);
    for (const f of FACETS) for (const v of F.sets[f.k]) a.push(['set:' + f.k + ':' + v, v]);
    for (const r of RANGES) { const v = F.r[r.k]; if (v && (v[0] != null || v[1] != null)) a.push(['r:' + r.k, `${r.label.replace(/ \(.*/, '')}: ${v[0] != null ? 'da ' + N(v[0]) : ''} ${v[1] != null ? 'a ' + N(v[1]) : ''}`.replace(/(\d)\.(\d{3})(?=\D|$)/g, r.k === 'anno' ? '$1$2' : '$1.$2')]); }
    for (const t of TRIS) if (F.tri[t.k] != null) a.push(['tri:' + t.k, t.label + ': ' + (F.tri[t.k] ? 'sì' : 'no')]);
    $('active').innerHTML = a.map(([k, l]) => `<button class="chip x" data-rm="${esc(k)}" aria-label="Rimuovi filtro ${esc(l)}">${esc(l)} ✕</button>`).join('') + (a.length > 1 ? '<button class="linkbtn" data-rm="all">Azzera tutto</button>' : '');
  }
  const stPill = c => (c._gone ? '<span class="pill s-4">Uscita</span>' : c.free ? '<span class="pill s-free">Libera</span>' : c.st === 1 || (c.st === 0 && c.booked) ? '<span class="pill s-booked">Prenotata</span>' : `<span class="pill s-${c.st}">${esc(c.stato)}</span>`);
  const ageCls = g => (g > 90 ? 'a3' : g > 60 ? 'a2' : '');
  const plate = t => `<span class="plate"><em>${esc(t)}</em></span>`;
  function cardHtml(c, i) {
    const tags = (c._d === 'new' ? '<span class="tag new">Nuovo ingresso</span>' : '') + (c.as ? '<span class="tag as">AutoScout</span>' : '') + (c.spec ? '<span class="tag">Prezzo speciale</span>' : '') + (c.iva ? '<span class="tag">IVA esposta</span>' : '') + (c.booked && c.st !== 1 && c.st !== 0 ? '<span class="tag">Prenotata</span>' : '');
    return `<button class="card" data-i="${i}">
      <div class="r1">${stPill(c)}<span class="age ${ageCls(c.giorni)}">${c.giorni == null ? '' : c.giorni === 0 ? 'entrata oggi' : c.giorni === 1 ? 'entrata ieri' : c.giorni + ' gg in stock'}</span></div>
      <div><h3><span>${esc(c.brand)}</span> ${esc(c.family)}</h3><p class="mod">${esc(c.modello)}</p></div>
      <div class="specs"><div><b>${N(c.km)}</b><span>km</span></div><div><b>${immIt(c)}</b><span>immatr.</span></div><div><b>${c.cv ? c.cv + ' CV' : 'n.d.'}</b><span>potenza</span></div><div><b>${esc(c.fuel)}</b><span>alim.</span></div><div><b>${esc(c.cambio)}</b><span>cambio</span></div><div><b><i class="sw" style="background:${COLOR_HEX[c.colorG] || '#9aa3b2'}"></i>${esc(c.colorG)}</b><span>colore</span></div></div>
      <div class="r3">${plate(c.targa)}${tags}</div>
      ${c.acq ? `<div class="who">${esc(c.acq)}${c.dataPren ? ' · ' + dIt(c.dataPren) : ''}${c.vend ? ' · vend. ' + esc(c.vend) : ''}</div>` : ''}
      <div class="foot"><div class="price${c.prezzo ? '' : ' nd'}">${c._dp ? `<s>era ${eur(c._dp) || 'n.d.'}</s>` : ''}${c.prezzo ? eur(c.prezzo) : 'Prezzo non inserito'}</div><div class="loc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><b>${esc(c.ubic || 'n.d.')}</b></div></div>
    </button>`;
  }
  function rowHtml(c, i) {
    return `<tr data-i="${i}"><td>${stPill(c)}</td><td>${plate(c.targa)}</td><td><b>${esc(c.brand)} ${esc(c.family)}</b></td><td>${esc(c.modello)}</td><td>${immIt(c)}</td><td class="r">${N(c.km)}</td><td class="r">${c.cv || ''}</td><td>${esc(c.fuel)}</td><td>${esc(c.cambio)}</td><td>${esc(c.colore)}</td><td class="r"><b>${eur(c.prezzo) || 'n.d.'}</b></td><td>${esc(c.ubic)}</td><td class="r"><span class="age ${ageCls(c.giorni)}">${c.giorni ?? ''}</span></td><td>${c.as ? 'Sì' : 'No'}</td><td>${esc(c.acq)}</td><td>${esc(c.vend)}</td></tr>`;
  }
  function renderList() {
    const cards = S.view === 'cards', part = S.list.slice(0, S.shown);
    $('grid').hidden = !cards; $('tablewrap').hidden = cards;
    if (!S.list.length) {
      $('grid').hidden = false; $('tablewrap').hidden = true;
      $('grid').innerHTML = `<div class="empty glass" style="grid-column:1/-1"><h3>Nessun veicolo con questi filtri</h3><p>Prova ad allargare prezzo, chilometri o ubicazione, oppure togli un filtro dalla riga qui sopra.</p><button class="btn btn-ghost" data-rm="all">Azzera filtri e ricerca</button></div>`;
      $('more').textContent = ''; return;
    }
    if (cards) $('grid').innerHTML = part.map(cardHtml).join('');
    else { const sl = $('tablewrap').scrollLeft; $('tablewrap').innerHTML = `<table><thead><tr>${TCOLS.map((t, i) => `<th class="${t[2] ? 'r' : ''}" data-col="${i}"${S.col && S.col.i === i ? ` aria-sort="${S.col.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button title="Ordina per ${t[0]}">${t[0]}${S.col && S.col.i === i ? (S.col.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead><tbody>${part.map(rowHtml).join('')}</tbody></table>`; $('tablewrap').scrollLeft = sl; }
    $('more').textContent = S.shown < S.list.length ? `Mostrati ${N(part.length)} di ${N(S.list.length)} · scorri per vederne altri` : '';
  }
  new IntersectionObserver(es => { if (es[0].isIntersecting && S.shown < S.list.length) { S.shown += 60; renderList(); } }, { rootMargin: '600px' }).observe($('more'));

  /* ---------- scheda dettaglio ---------- */
  function openDrawer(c) {
    const row = (k, v, wide) => (v === '' || v == null ? '' : `<div class="${wide ? 'wide' : ''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`);
    const yn = b => (b ? 'Sì' : 'No');
    $('drawer').innerHTML = `<button class="close" id="dClose" aria-label="Chiudi scheda"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <header><div class="r3">${stPill(c)}${c._ds ? `<span class="tag">prima: ${esc(c._ds)}</span>` : ''}<span class="age ${ageCls(c.giorni)}">${c.giorni == null ? '' : c.giorni + ' giorni in stock'}</span></div>
      <h2>${esc(c.brand)} ${esc(c.family)}</h2><p style="color:var(--ink2)">${esc(c.modello)}</p>
      <div class="r3">${plate(c.targa)}<button class="btn btn-ghost btn-sm" id="dCopy">Copia targa</button></div></header>
      <div class="scroll">
        <div class="bigprice"><div class="price${c.prezzo ? '' : ' nd'}">${c.prezzo ? eur(c.prezzo) : 'Prezzo non inserito'}</div>${c.prezzo ? `<span style="color:var(--ink2)">veicolo ${eur(c.prezzoV) || '0 €'} + passaggio ${eur(c.pp) || '0 €'}</span>` : ''}${c._dp != null ? `<span class="tag">ieri ${eur(c._dp) || 'n.d.'}</span>` : ''}</div>
        <section><h4>Veicolo</h4><dl class="dl">${row('Immatricolazione', immIt(c))}${row('Chilometri', N(c.km) + ' km')}${row('Potenza', c.cv ? c.cv + ' CV / ' + c.kw + ' kW' : 'n.d.')}${row('Alimentazione', c.fuel)}${row('Cambio', c.cambio)}${row('Colore', c.colore || 'n.d.')}${row('Categoria del listino', c.section, true)}</dl></section>
        <section><h4>Dove si trova</h4><dl class="dl">${row('Ubicazione attuale', c.ubic || 'n.d.')}${row('Sede di ingresso', c.ingresso)}${row('Data di ingresso', dIt(c.ingr))}${row('Anticipata', c.antic)}</dl></section>
        ${c.acq || c.vend || c.dataPren ? `<section><h4>Prenotazione</h4><dl class="dl">${row('Acquirente', c.acq)}${row('Venditore', c.vend)}${row('Data prenotazione', dIt(c.dataPren))}${row('Modalità di vendita', c.modVen)}${row('Caparra', c.caparra ? eur(c.caparra) : '0 €')}</dl></section>` : ''}
        <section><h4>Pubblicazione e pratiche</h4><dl class="dl">${row('AutoScout', c.as ? 'Sì' + (c.asDate ? ', dal ' + dIt(c.asDate) : '') : 'No')}${row('Check list', c.check ? 'Sì' + (c.checkDate ? ', il ' + dIt(c.checkDate) : '') : 'No')}${row('Prezzo speciale', yn(c.spec))}${row('IVA esposta', yn(c.iva))}${row('Mini PP', yn(c.mini))}${row('Foglio verde', yn(c.fv))}${row('Note', c.note, true)}</dl></section>
      </div>`;
    $('drawer').hidden = false;
    requestAnimationFrame(() => { $('drawer').classList.add('on'); $('scrim').classList.add('on'); });
    $('dClose').focus();
    $('dCopy').onclick = () => copy(c.targa, 'Targa copiata');
  }
  function closeAll() { $('drawer').classList.remove('on'); $('filters').classList.remove('on'); $('scrim').classList.remove('on'); setTimeout(() => { if (!$('drawer').classList.contains('on')) $('drawer').hidden = true; }, 350); }

  let toastT;
  function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), err ? 6000 : 2800); }
  function copy(text, ok) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); let done = false; try { done = document.execCommand('copy'); } catch (e) {} ta.remove(); toast(done ? ok : 'Copia non riuscita in questa finestra', !done); };
    try { navigator.clipboard.writeText(text).then(() => toast(ok), fallback); } catch (e) { fallback(); }
  }

  /* ---------- caricamento PDF ---------- */
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script')); document.head.appendChild(s); });
  async function loadBuffer(buf) {
    $('overlay').hidden = false; $('ovTitle').textContent = 'Leggo la stampa…'; $('ovBar').style.width = '2%'; $('ovText').textContent = 'Preparo il lettore PDF';
    try {
      if (!window.pdfjsLib) {
        try { await loadScript(PDFJS + 'pdf.min.js'); await loadScript(PDFJS + 'pdf.worker.min.js'); }
        catch (e) { throw new Error('Non riesco a scaricare il lettore PDF. Controlla la connessione a internet e riprova.'); }
      }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      let doc;
      try { doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise; }
      catch (e) { throw new Error('Il file non è un PDF leggibile. Scegli la stampa dello stock usato.'); }
      const pages = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p), h = page.view[3], tc = await page.getTextContent();
        pages.push({ items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: h - i.transform[5], w: i.width, fs: i.transform[0] })) });
        $('ovBar').style.width = (p / doc.numPages * 100) + '%'; $('ovText').textContent = `Pagina ${p} di ${doc.numPages}`;
        if (p % 6 === 0) await new Promise(r => setTimeout(r));
      }
      const data = normalize(extract(pages));
      if (!data.cars.length) throw new Error('In questo PDF non trovo veicoli. Serve la stampa “Situazione stock autoveicoli usato”.');
      const cur = store.get('su.cur');
      let prev = store.get('su.prev');
      if (cur && cur.meta && !cur.meta.demo && cur.meta.day !== data.meta.day) prev = cur;
      const clean = { meta: data.meta, cars: data.cars };
      const saved = store.set('su.cur', clean);
      if (prev) store.set('su.prev', { meta: prev.meta, cars: prev.cars.map(c => { const o = {}; for (const k in c) if (k[0] !== '_') o[k] = c[k]; return o; }) });
      setData(data, prev);
      const m = data.meta, ok = m.expected === m.count && !m.badSec.length;
      toast(ok ? `${N(m.count)} veicoli caricati, totale del report verificato` : `Letti ${N(m.count)} veicoli, il report ne dichiara ${N(m.expected || 0)}: controlla i conteggi`, !ok);
      if (!saved) setTimeout(() => toast('Stock caricato, ma il browser non permette di salvarlo: andrà ricaricato alla prossima apertura', true), 3200);
    } catch (e) { toast(e.message || 'Lettura non riuscita', true); }
    $('overlay').hidden = true;
  }
  function loadFile(f) { if (!f) return; const r = new FileReader(); r.onload = () => loadBuffer(r.result); r.onerror = () => toast('Non riesco a leggere il file', true); r.readAsArrayBuffer(f); }
  window.StockApp = { loadBuffer };

  /* ---------- eventi ---------- */
  $('btnLoad').onclick = $('btnLoad2').onclick = () => $('file').click();
  $('file').onchange = e => { loadFile(e.target.files[0]); e.target.value = ''; };
  let dragN = 0;
  addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragN++; $('drophint').hidden = false; } });
  addEventListener('dragleave', () => { dragN = Math.max(0, dragN - 1); if (!dragN) $('drophint').hidden = true; });
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('drophint').hidden = true; loadFile(e.dataTransfer.files[0]); });

  let qT;
  $('q').addEventListener('input', () => { $('qClear').hidden = !$('q').value; clearTimeout(qT); qT = setTimeout(() => { S.Q = parseQuery($('q').value, S.vocab); apply(); }, 120); });
  $('qClear').onclick = () => { $('q').value = ''; $('qClear').hidden = true; S.Q = parseQuery('', S.vocab); apply(); $('q').focus(); };
  $('sort').onchange = () => { S.col = null; apply(); };
  const setView = v => { S.view = v; $('vCards').setAttribute('aria-pressed', String(v === 'cards')); $('vTable').setAttribute('aria-pressed', String(v === 'table')); try { localStorage.setItem('su.view', v); } catch (e) {} renderList(); };
  $('vCards').onclick = () => setView('cards'); $('vTable').onclick = () => setView('table');
  $('btnFilters').onclick = () => { $('filters').classList.add('on'); $('scrim').classList.add('on'); };
  $('scrim').onclick = closeAll;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('q').focus(); } });
  $('btnCopy').onclick = () => {
    const head = ['Stato', 'Targa', 'Marca', 'Modello', 'Allestimento', 'Immatricolazione', 'Km', 'CV', 'Alimentazione', 'Cambio', 'Colore', 'Prezzo', 'Ubicazione', 'Ingresso', 'Giorni in stock', 'AutoScout', 'Acquirente', 'Venditore', 'Note'];
    const rows = S.list.map(c => [c.free ? 'Libera' : c.booked && c.st < 2 ? 'Prenotata' : c.stato, c.targa, c.brand, c.family, c.modello, immIt(c), c.km, c.cv || '', c.fuel, c.cambio, c.colore, c.prezzo || '', c.ubic, dIt(c.ingr), c.giorni ?? '', c.as ? 'Sì' : 'No', c.acq, c.vend, c.note].join('\t'));
    copy([head.join('\t'), ...rows].join('\n'), `${N(S.list.length)} veicoli copiati: incollali in Excel`);
  };

  document.addEventListener('click', e => {
    const t = e.target.closest('th[data-col],[data-preset],[data-delta],[data-f],[data-more],[data-q],[data-rm],[data-seg] button,.card,tbody tr,#fReset,#fClose');
    if (!t) return;
    if (t.dataset.col != null) { const i = +t.dataset.col; S.col = S.col && S.col.i === i ? { i, dir: -S.col.dir } : { i, dir: 1 }; $('sort').value = 'col'; return apply(); }
    if (t.id === 'fClose') return closeAll();
    if (t.id === 'fReset') { resetF(); activePreset = 'all'; renderFilters(); return apply(); }
    if (t.dataset.preset) return usePreset(t.dataset.preset === activePreset ? 'all' : t.dataset.preset);
    if (t.dataset.delta) { const v = t.dataset.delta; F.delta = F.delta === v ? null : v; return apply(); }
    if (t.dataset.f) { const s = F.sets[t.dataset.f], v = t.dataset.v; s.has(v) ? s.delete(v) : s.add(v); activePreset = ''; return apply(); }
    if (t.dataset.more) { const k = t.dataset.more; expanded.has(k) ? expanded.delete(k) : expanded.add(k); return renderFacetCounts(); }
    if (t.dataset.q) { const lo = t.dataset.lo === '' ? null : +t.dataset.lo, hi = t.dataset.hi === '' ? null : +t.dataset.hi, cur = F.r[t.dataset.q]; F.r[t.dataset.q] = cur && cur[0] === lo && cur[1] === hi ? [null, null] : [lo, hi]; activePreset = ''; renderFilters(); return apply(); }
    if (t.dataset.rm) {
      const k = t.dataset.rm;
      if (k === 'all') { resetF(); activePreset = 'all'; $('q').value = ''; $('qClear').hidden = true; S.Q = parseQuery('', S.vocab); }
      else if (k === 'disp') F.disp = 'all'; else if (k === 'delta') F.delta = null; else if (k === 'preset') F.preset = null;
      else if (k.startsWith('set:')) { const [, fk, ...v] = k.split(':'); F.sets[fk].delete(v.join(':')); }
      else if (k.startsWith('r:')) delete F.r[k.slice(2)]; else if (k.startsWith('tri:')) delete F.tri[k.slice(4)];
      activePreset = ''; renderFilters(); return apply();
    }
    const seg = t.closest('[data-seg]');
    if (seg) {
      const k = seg.dataset.seg, v = t.dataset.v;
      if (k === 'disp') F.disp = v; else { const tk = k.slice(4); if (v === '') delete F.tri[tk]; else F.tri[tk] = v === 'true'; }
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === t)));
      activePreset = ''; return apply();
    }
    if (t.dataset.i != null) openDrawer(S.list[+t.dataset.i]);
  });
  $('filters').addEventListener('input', e => {
    const k = e.target.dataset.r; if (!k) return;
    const cur = F.r[k] || [null, null]; cur[+e.target.dataset.i] = e.target.value === '' ? null : +e.target.value; F.r[k] = cur; activePreset = '';
    clearTimeout(qT); qT = setTimeout(apply, 200);
  });
  $('grid').addEventListener('pointermove', e => { const c = e.target.closest('.card'); if (!c) return; const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px'); });

  /* ---------- avvio ---------- */
  try { const v = localStorage.getItem('su.view'); if (v === 'table') { S.view = 'table'; $('vCards').setAttribute('aria-pressed', 'false'); $('vTable').setAttribute('aria-pressed', 'true'); } } catch (e) {}
  const cur = store.get('su.cur');
  if (cur && cur.cars && cur.cars.length) setData(cur, store.get('su.prev')); else setData(demoData(), null);
  // stock condiviso: pubblicato ogni mattina accanto alla pagina, vince se e' piu' recente di quello caricato a mano
  (async () => {
    try {
      const get = async f => { const r = await fetch(f + '?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? r.json() : null; };
      const shared = await get('data/stock.json');
      if (!shared || !shared.cars || !shared.cars.length) return;
      if (S.meta.printDate && !S.meta.demo && S.meta.printDate >= shared.meta.printDate) return;
      let prev = null;
      try { prev = await get('data/prev.json'); } catch (e) {}
      setData(shared, prev);
    } catch (e) { /* nessuno stock condiviso qui: restano i dati locali */ }
  })();
})();
