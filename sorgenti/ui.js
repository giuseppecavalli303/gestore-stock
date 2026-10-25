(() => {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  const N = n => (n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
  const eur = n => (n ? N(Math.round(n)) + ' €' : '');
  const dIt = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
  const immIt = c => (c.imm ? c.imm.slice(5, 7) + '/' + c.imm.slice(0, 4) : 'n.d.');
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  const XLSXJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  // "in un riquadro" conta solo se il riquadro e' di un altro sito (come claude.ai): li' mail, download e servizi esterni non funzionano
  const inFrame = (() => { try { return window.self !== window.top && !window.top.location.href; } catch (e) { return true; } })();
  const fotoBase = () => (S.meta.annunci && S.meta.annunci.fotoBase) || 'https://cdn.dealerk.it/dealer/datafiles/vehicle/images/';
  const foto = (c, size, i = 0) => (c.web && c.web.foto && c.web.foto[i] ? fotoBase() + size + '/' + c.web.foto[i] : '');
  // indirizzo per le richieste di avviso, composto qui per non lasciarlo in chiaro nella pagina
  const IO = ['giuseppe.cavalli', 'valentinoautomobili.it'].join('@');
  // assistente: servizio Google Apps Script che custodisce la chiave di Gemini (vedi assistente/Codice.gs)
  const AI_URL = 'https://script.google.com/macros/s/AKfycbx7mAczjExjEujVll1qUqvrevVpYbWPuqd85MGt_LjQxGI2y4_TUEWWcExqr2KpxcHa/exec';
  const AI_TOKEN = 'FTcdlNGgGU7WXN-L';
  const aiAttivo = () => !!AI_URL && !inFrame && !S.meta.demo;
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
  const RE_4X4 = /4\s?MOTION|QUATTRO|4X4|\bAWD\b|\b4WD\b|ALLGRIP|\b4XE\b|XDRIVE|4MATIC/i;
  const trazioneDi = c => (RE_4X4.test(c.modello) || (c.web && /integr/i.test(c.web.trazione)) ? 'Integrale' : c.web && c.web.trazione ? c.web.trazione : '');
  // telecamera: vale solo se l'elenco dotazioni la nomina E le foto la confermano
  const camOk = c => !!(c.web && c.web.cam && c.web.cam.esito === 'si');
  // tetto apribile: stessa regola (dotazioni del sito + una foto con il tetto APERTO, agente/tetto.js)
  const tettoOk = c => !!(c.web && c.web.tetto && c.web.tetto.esito === 'si');
  const tettoNome = () => 'Tetto apribile';
  const tettoTesto = w => (!w.tettoLista ? '' : `${w.tettoLista}. ` + (!w.tetto ? 'Controllo delle foto in attesa' : w.tetto.esito === 'si' ? `Confermato: in foto${w.tetto.foto ? ' ' + w.tetto.foto : ''} è aperto` : "Nessuna foto con il tetto aperto: da verificare sull'auto"));
  const camTesto = w => (!w.camLista ? '' : !w.cam ? "Nelle dotazioni c'è scritta: controllo delle foto in attesa" : w.cam.esito === 'si' ? `Confermata: c'è la foto dello schermo con la retrocamera${w.cam.foto ? ` (foto ${w.cam.foto})` : ''}` : "Nelle dotazioni c'è scritta, ma tra le foto non c'è quella della retrocamera: da verificare sull'auto");
  const TRIS = [
    { k: 'as', label: 'Su AutoScout' }, { k: 'hasPrice', label: 'Con prezzo', get: c => c.prezzo > 0 }, { k: 'check', label: 'Check list fatta' },
    { k: 'spec', label: 'Prezzo speciale' }, { k: 'iva', label: 'IVA esposta' }, { k: 'mini', label: 'Mini PP' }, { k: 'fv', label: 'Foglio verde' },
    { k: 'web', label: 'Annuncio sul sito', get: c => !!c.web }, { k: 'neo', label: 'Per neopatentati', get: c => !!(c.web && c.web.neopatentati) }, { k: 'awd', label: 'Trazione integrale (4x4)', get: c => c.trazione === 'Integrale' }, { k: 'km0', label: 'Km 0', get: c => km0(c) }, { k: 'cam', label: 'Telecamera confermata dalle foto', get: c => camOk(c) }, { k: 'tetto', label: 'Tetto apribile (foto aperto)', get: c => tettoOk(c) }
  ];
  const ZERO_OK = { km: 1, giorni: 1 };

  const S = { cars: [], meta: {}, prev: null, vocab: [], Q: parseQuery('', []), view: 'cards', shown: 60, list: [], delta: null, prevMap: null, gone: [], cliente: false };
  // modalita' cliente: si puo' girare il telefono al cliente, l'app nasconde da quanto tempo le auto sono in stock
  const ggVisibili = () => !S.cliente;
  const acqV = c => (S.cliente ? '' : c.acq || '');   // nome del cliente: solo in modalita' venditore
  let F;
  const resetF = () => { F = { disp: 'all', sets: {}, r: {}, tri: {}, delta: null, preset: null }; FACETS.forEach(f => { F.sets[f.k] = new Set(); }); };
  resetF();
  const expanded = new Set();

  /* ---------- dati ---------- */
  function setData(data, prev) {
    S.cars = data.cars; S.meta = data.meta; S.prev = prev || null;
    S.cars.forEach(c => { c.trazione = trazioneDi(c); });
    S.cars.forEach(c => { c._h = deacc([c.targa, c.brand, c.family, c.modello, c.colore, c.ubic, c.vend, c.acq, c.note, c.section, c.stato, c.antic, c.web && c.web.carrozzeria].join(' ').toLowerCase()); });
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
    S.Q = capisci($('q').value);
    renderMeta(); renderKpis(); renderDelta(); renderViews(); renderFilters(true); apply(); renderListaBar();
    if (!$('stats').hidden) renderStats();
    apriDaLink();
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
    if (F.preset === 'priceDiff' && !prezzoDiverso(c)) return false;
    return matchQuery(c, S.Q);
  }
  const prezzoDiverso = c => !!sitoDiverso(c);
  // consigliato: prima le libere con foto, poi le altre libere, poi in arrivo e il resto, poi le prenotate; a parita' le piu' recenti
  const rango = c => (c.free ? (c.web ? 0 : 1) : c.booked ? 3 : 2);
  const SORTS = {
    cons: (a, b) => rango(a) - rango(b) || (a.giorni ?? 1e9) - (b.giorni ?? 1e9),
    ingr: (a, b) => (a.giorni ?? 1e9) - (b.giorni ?? 1e9), old: (a, b) => (b.giorni ?? -1) - (a.giorni ?? -1),
    pa: (a, b) => (a.prezzo || 1e12) - (b.prezzo || 1e12), pd: (a, b) => b.prezzo - a.prezzo,
    km: (a, b) => a.km - b.km, anno: (a, b) => (b.imm > a.imm ? 1 : b.imm < a.imm ? -1 : 0), cv: (a, b) => b.cv - a.cv
  };
  /* colonne della tabella: [titolo, valore, numerica] */
  const stLabel = c => (c._gone ? 'Uscita' : c.free ? 'Libera' : c.booked && c.st < 2 ? 'Prenotata' : c.stato);
  const TCOLS = [['Stato', stLabel], ['Targa', c => c.targa], ['Veicolo', c => c.brand + ' ' + c.family], ['Allestimento', c => c.modello], ['Imm.', c => c.imm],
    ['Km', c => c.km, 1], ['CV', c => c.cv || null, 1], ['Alim.', c => c.fuel], ['Cambio', c => c.cambio], ['Colore', c => c.colore], ['Prezzo', c => c.prezzo || null, 1],
    ['Ubicazione', c => c.ubic], ['Giorni', c => c.giorni, 1], ['AutoScout', c => (c.as ? 'Sì' : 'No')], ['Acquirente', c => acqV(c)], ['Venditore', c => c.vend]];
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
    S.list = src.filter(c => pass(c)).sort(S.col ? colCmp(S.col) : SORTS[$('sort').value] || SORTS.cons);
    S.shown = 60;
    renderUnderstood(); renderCount(); renderActive(); renderFacetCounts(); renderList(); syncPressed();
  }

  /* ---------- testata, KPI, viste ---------- */
  function renderMeta() {
    const m = S.meta;
    if (m.demo) { $('metaLine').textContent = 'Dati di esempio'; $('demo').hidden = false; return; }
    $('demo').hidden = true;
    const ok = m.expected != null && m.expected === m.count && !(m.badSec || []).length;
    const ora = m.printDate ? m.printDate.slice(11) : '';
    const stale = m.day && m.day < new Date().toLocaleDateString('sv');
    const conta = ok ? N(m.count) + ' veicoli, totale verificato' : N(m.count) + ' letti su ' + N(m.expected || 0) + ' dichiarati';
    // sul telefono la riga e' corta e l'avviso viene per primo, cosi' non finisce tagliato
    $('metaLine').innerHTML = `<span class="m-long">${m.printDate ? `Stampa del ${dIt(m.day)} ore ${ora}` : 'Stampa caricata'} · <b class="${ok ? '' : 'warn'}">${conta}</b>${stale ? ' · <b class="warn">non è la stampa di oggi</b>' : ''}</span>`
      + `<span class="m-short">${stale ? '<b class="warn">Non di oggi</b> · ' : ''}${dIt(m.day).slice(0, 5)} ${ora} · <b class="${ok ? '' : 'warn'}">${ok ? N(m.count) + ' veicoli' : N(m.count) + ' su ' + N(m.expected || 0)}</b></span>`;
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
    check: { label: 'Check list fatta', set() { F.tri.check = true; } },
    noWeb: { label: 'Libere senza annuncio sul sito', set() { F.disp = 'free'; F.tri.web = false; } },
    priceDiff: { label: 'Prezzo diverso dal sito', set() { F.preset = 'priceDiff'; } },
    neo: { label: 'Per neopatentati', set() { F.disp = 'free'; F.tri.neo = true; } },
    km0: { label: 'Km 0', set() { F.tri.km0 = true; } }
  };
  let activePreset = 'all';
  function countPreset(id) { const keep = F, kp = activePreset; resetF(); PRESETS[id].set(); const Q = S.Q; S.Q = parseQuery('', []); const n = S.cars.filter(c => pass(c)).length; S.Q = Q; F = keep; activePreset = kp; return n; }
  function usePreset(id) { resetF(); PRESETS[id].set(); activePreset = id; $('q').value = ''; S.Q = parseQuery('', S.vocab); $('qClear').hidden = true; renderFilters(true); apply(); }
  function renderKpis() {
    const free = S.cars.filter(c => c.free), g = free.filter(c => c.giorni != null);
    const avg = g.length ? Math.round(g.reduce((a, c) => a + c.giorni, 0) / g.length) : 0;
    const val = free.reduce((a, c) => a + c.prezzo, 0);
    const tiles = ['all', 'free', 'booked', 'arr', 'rip'].concat(ggVisibili() ? ['old'] : []).map(id => `<button class="kpi glass" data-preset="${id}" aria-pressed="false"><span class="v num">${N(countPreset(id))}</span><span class="l">${PRESETS[id].color ? `<i class="dot" style="background:${PRESETS[id].color}"></i>` : ''}${PRESETS[id].label}</span></button>`);
    if (ggVisibili()) tiles.push(`<div class="kpi glass"><span class="v num">${avg}<small style="font-size:14px;font-weight:500"> gg</small></span><span class="l">Giacenza media delle libere</span></div>`);
    tiles.push(`<div class="kpi glass"><span class="v num">${val >= 1e6 ? (val / 1e6).toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' M€' : eur(val) || '0 €'}</span><span class="l">Valore a listino delle libere</span></div>`);
    $('kpis').innerHTML = tiles.join('');
  }
  function renderViews() {
    $('views').innerHTML = '<span class="lab">Viste rapide</span>' + ['km0', 'noWeb', 'priceDiff', 'noAs', 'noPrice', 'recentBooked', 'neo', 'spec', 'check'].map(id => `<button class="chip" data-preset="${id}" aria-pressed="false">${PRESETS[id].label} <span class="n">${N(countPreset(id))}</span></button>`).join('');
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
    h += facet(FACETS[0]) + facet(FACETS[1]) + facet(FACETS[2]) + range(RANGES[0]) + range(RANGES[1]) + range(RANGES[2]) + range(RANGES[3]) + facet(FACETS[3]) + facet(FACETS[4]) + (ggVisibili() ? range(RANGES[4]) : '') + FACETS.slice(5).map(facet).join('');
    h += `<details class="fg" open><summary><span>Altro</span></summary><div class="body">${TRIS.map(t => `<div class="tri"><span>${t.label}</span>${seg('tri:' + t.k, [['', 'Tutte'], ['true', 'Sì'], ['false', 'No']], F.tri[t.k] == null ? '' : F.tri[t.k])}</div>`).join('')}</div></details>`;
    h += `<div class="fdone"><button class="btn btn-primary" id="fClose2">Mostra <span id="fCount" class="num"></span></button></div>`;
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
    const ch = S.Q.chips, testo = $('q').value.trim(), ai = aiAttivo() && testo.length > 2;
    $('understood').hidden = !ch.length && !ai;
    const ign = (S.Q.ignorate || []).length ? `<span class="ign">non considero: ${S.Q.ignorate.map(esc).join(', ')}</span>` : '';
    $('understood').hidden = !ch.length && !ai && !ign;
    if (!ch.length) { $('understood').innerHTML = (ai ? `<button class="askai" id="askAI">${ICONA_AI}Chiedi all'assistente</button>` : '') + ign; return; }
    $('understood').innerHTML = ch.length ? '<span>Ho capito:</span>' + ch.map(c => `<span class="u">${esc(c)}</span>`).join('') + ign + (ai ? `<button class="askai" id="askAI">${ICONA_AI}Chiedi all'assistente</button>` : '') + (inFrame ? '' : `<a class="linkbtn" href="mailto:${IO}?subject=${encodeURIComponent('AVVISO STOCK: ' + $('q').value.trim())}" title="Ricevi una mail quando entra un'auto che corrisponde">Avvisami quando entra</a>`) : '';
  }
  function renderCount() {
    const n = S.list.length, tot = (F.delta === 'gone' ? S.gone : S.cars).length;
    if ($('fCount')) $('fCount').textContent = N(n) + (n === 1 ? ' veicolo' : ' veicoli');
    $('count').innerHTML = `<span class="num">${N(n)}</span> ${n === 1 ? 'veicolo' : 'veicoli'}<small>${n === tot ? '' : 'su ' + N(tot)}${F.delta === 'gone' ? ' usciti dallo stock' : ''}</small>`;
  }
  function renderActive() {
    const a = [];
    if (F.disp !== 'all') a.push(['disp', F.disp === 'free' ? 'Libere' : 'Prenotate']);
    if (F.delta) a.push(['delta', { new: 'Nuovi ingressi', gone: 'Usciti dallo stock', price: 'Prezzo cambiato', state: 'Stato cambiato' }[F.delta]]);
    if (F.preset === 'recentBooked') a.push(['preset', 'Prenotate negli ultimi 7 giorni']);
    if (F.preset === 'priceDiff') a.push(['preset', 'Prezzo diverso dal sito']);
    for (const f of FACETS) for (const v of F.sets[f.k]) a.push(['set:' + f.k + ':' + v, v]);
    for (const r of RANGES) { const v = F.r[r.k]; if (v && (v[0] != null || v[1] != null)) a.push(['r:' + r.k, `${r.label.replace(/ \(.*/, '')}: ${v[0] != null ? 'da ' + N(v[0]) : ''} ${v[1] != null ? 'a ' + N(v[1]) : ''}`.replace(/(\d)\.(\d{3})(?=\D|$)/g, r.k === 'anno' ? '$1$2' : '$1.$2')]); }
    for (const t of TRIS) if (F.tri[t.k] != null) a.push(['tri:' + t.k, t.label + ': ' + (F.tri[t.k] ? 'sì' : 'no')]);
    $('btnFilters').textContent = a.length ? `Filtri · ${a.length}` : 'Filtri';
    $('active').innerHTML = a.map(([k, l]) => `<button class="chip x" data-rm="${esc(k)}" aria-label="Rimuovi filtro ${esc(l)}">${esc(l)} ✕</button>`).join('') + (a.length > 1 ? '<button class="linkbtn" data-rm="all">Azzera tutto</button>' : '');
  }
  const stPill = c => (c._gone ? '<span class="pill s-4">Uscita</span>' : c.free ? '<span class="pill s-free">Libera</span>' : c.st === 1 || (c.st === 0 && c.booked) ? '<span class="pill s-booked">Prenotata</span>' : `<span class="pill s-${c.st}">${esc(c.stato)}</span>`);
  const ageCls = g => (g > 90 ? 'a3' : g > 60 ? 'a2' : '');
  const plate = t => `<span class="plate"><em>${esc(t)}</em></span>`;
  function cardHtml(c, i) {
    const tags = (c._d === 'new' ? '<span class="tag new">Nuovo ingresso</span>' : '') + (c.as ? '<span class="tag as">AutoScout</span>' : '') + (c.spec ? '<span class="tag">Prezzo speciale</span>' : '') + (c.iva ? '<span class="tag">IVA esposta</span>' : '') + (c.booked && c.st !== 1 && c.st !== 0 ? '<span class="tag">Prenotata</span>' : '') + (c.web && c.web.neopatentati ? '<span class="tag">Neopatentati</span>' : '') + (camOk(c) ? '<span class="tag as">Telecamera</span>' : '') + (tettoOk(c) ? `<span class="tag as">${tettoNome(c)}</span>` : '');
    const ph = foto(c, 400);
    return `<button class="card" data-i="${i}">
      <div class="ph"><span class="stella" role="button" tabindex="0" data-stella="${c.targa}" aria-pressed="${inLista(c.targa)}" aria-label="Lista per il cliente">${STELLA}</span>${ph ? `<img src="${ph}" alt="" loading="lazy" decoding="async">` : '<span>Nessuna foto sul sito</span>'}${c.web && c.web.foto.length > 1 ? `<i class="nfoto">${c.web.foto.length} foto</i>` : ''}${km0(c) ? '<i class="bollo-km0">Km 0</i>' : ''}</div>
      <div class="r1">${stPill(c)}${ggVisibili() ? `<span class="age ${ageCls(c.giorni)}">${c.giorni == null ? '' : c.giorni === 0 ? 'entrata oggi' : c.giorni === 1 ? 'entrata ieri' : c.giorni + ' gg in stock'}</span>` : ''}</div>
      <div><h3><span>${esc(c.brand)}</span> ${esc(c.family)}</h3><p class="mod">${esc(c.modello)}</p></div>
      <div class="specs"><div><b>${N(c.km)}</b><span>km</span></div><div><b>${immIt(c)}</b><span>immatr.</span></div><div><b>${c.cv ? c.cv + ' CV' : 'n.d.'}</b><span>potenza</span></div><div><b>${esc(c.fuel)}</b><span>alim.</span></div><div><b>${esc(c.cambio)}</b><span>cambio</span></div><div><b><i class="sw" style="background:${COLOR_HEX[c.colorG] || '#9aa3b2'}"></i>${esc(c.colorG)}</b><span>colore</span></div></div>
      <div class="r3">${plate(c.targa)}${tags}</div>
      ${acqV(c) ? `<div class="who">${esc(acqV(c))}${c.dataPren ? ' · ' + dIt(c.dataPren) : ''}${c.vend ? ' · vend. ' + esc(c.vend) : ''}</div>` : ''}
      ${!S.cliente && sitoDiverso(c) ? `<div class="sito-diff">${esc(sitoDiverso(c).breve)}</div>` : ''}
      <div class="foot"><div class="price${c.prezzo ? '' : ' nd'}">${c._dp ? `<s>era ${eur(c._dp) || 'n.d.'}</s>` : ''}${c.prezzo ? eur(c.prezzo) : 'Prezzo non inserito'}</div><div class="loc"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.800 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/></svg><b>${esc(c.ubic || 'n.d.')}</b></div></div>
    </button>`;
  }
  function rowHtml(c, i) {
    return `<tr data-i="${i}"><td>${stPill(c)}${km0(c) ? ' <span class="pill km0">Km 0</span>' : ''}</td><td>${plate(c.targa)}</td><td><b>${esc(c.brand)} ${esc(c.family)}</b></td><td>${esc(c.modello)}</td><td>${immIt(c)}</td><td class="r">${N(c.km)}</td><td class="r">${c.cv || ''}</td><td>${esc(c.fuel)}</td><td>${esc(c.cambio)}</td><td>${esc(c.colore)}</td><td class="r"><b>${eur(c.prezzo) || 'n.d.'}</b></td><td>${esc(c.ubic)}</td><td class="r col-gg"><span class="age ${ageCls(c.giorni)}">${ggVisibili() ? c.giorni ?? '' : ''}</span></td><td>${c.as ? 'Sì' : 'No'}</td><td>${esc(acqV(c))}</td><td>${esc(c.vend)}</td></tr>`;
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
    else { const sl = $('tablewrap').scrollLeft; $('tablewrap').innerHTML = `<table><thead><tr>${TCOLS.map((t, i) => `<th class="${t[2] ? 'r' : ''}${t[0] === 'Giorni' ? ' col-gg' : ''}" data-col="${i}"${S.col && S.col.i === i ? ` aria-sort="${S.col.dir > 0 ? 'ascending' : 'descending'}"` : ''}><button title="Ordina per ${t[0]}">${t[0]}${S.col && S.col.i === i ? (S.col.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`).join('')}</tr></thead><tbody>${part.map(rowHtml).join('')}</tbody></table>`; $('tablewrap').scrollLeft = sl; }
    $('more').textContent = S.shown < S.list.length ? `Mostrati ${N(part.length)} di ${N(S.list.length)} · scorri per vederne altri` : '';
  }
  new IntersectionObserver(es => { if (es[0].isIntersecting && S.shown < S.list.length) { S.shown += 60; renderList(); } }, { rootMargin: '600px' }).observe($('more'));

  /* ---------- scheda dettaglio ---------- */
  function openDrawer(c, daAI) {
    const daLista = !!S.vistaLista;
    const row = (k, v, wide) => (v === '' || v == null ? '' : `<div class="${wide ? 'wide' : ''}"><dt>${k}</dt><dd>${esc(v)}</dd></div>`);
    const yn = b => (b ? 'Sì' : 'No');
    $('drawer').innerHTML = `<button class="close" id="dClose" aria-label="Chiudi scheda"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <header>${daAI && S.aiUltimo ? '<button class="linkbtn" id="dBack">← Torna ai consigli</button>' : daLista ? '<button class="linkbtn" id="dBackL">← Torna alla lista</button>' : ''}<div class="r3">${stPill(c)}${km0(c) ? '<span class="pill km0">Km 0</span>' : ''}${c._ds ? `<span class="tag">prima: ${esc(c._ds)}</span>` : ''}${ggVisibili() ? `<span class="age ${ageCls(c.giorni)}">${c.giorni == null ? '' : c.giorni + ' giorni in stock'}</span>` : ''}</div>
      <h2>${esc(c.brand)} ${esc(c.family)}</h2><p style="color:var(--ink2)">${esc(c.modello)}</p>
      <div class="r3">${plate(c.targa)}<button class="btn btn-ghost btn-sm" id="dCopy">Copia targa</button><button class="btn btn-primary btn-sm" id="dShare">Invia al cliente</button>${S.cliente ? '' : '<button class="btn btn-ghost btn-sm" id="dCartello">Cartello salone</button>'}<button class="btn btn-ghost btn-sm stella-btn" data-stella="${c.targa}" aria-pressed="${inLista(c.targa)}">${STELLA}<span>Lista</span></button></div></header>
      <div class="scroll">
        ${c.web && c.web.foto.length ? `<div class="galwrap"><button class="gfr sx" aria-label="Foto precedente"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button><button class="gfr dx" aria-label="Foto successiva"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg></button><span class="gnum"></span><div class="gal">${c.web.foto.map((x, k) => `<a href="${foto(c, 800, k)}" target="_blank" rel="noopener"><img src="${foto(c, 800, k)}" alt="Foto ${k + 1}" loading="lazy"></a>`).join('')}</div></div>` : ''}
        ${c.web ? `<div class="links"><a class="btn btn-ghost btn-sm" href="${esc(c.web.url)}" target="_blank" rel="noopener">Annuncio sul sito</a>${c.web.giro360 ? `<a class="btn btn-ghost btn-sm" href="${esc(c.web.giro360)}" target="_blank" rel="noopener">Giro a 360°</a>` : ''}${c.web.video ? `<a class="btn btn-ghost btn-sm" href="${esc(c.web.video)}" target="_blank" rel="noopener">Video</a>` : ''}</div>` : `<p class="hint">Quest'auto non ha un annuncio su valentinoautomobili.it.</p>`}
        <div class="bigprice"><div class="price${c.prezzo ? '' : ' nd'}">${c.prezzo ? eur(c.prezzo) : 'Prezzo non inserito'}</div>${c.prezzo ? `<span style="color:var(--ink2)">veicolo ${eur(c.prezzoV) || '0 €'} + passaggio ${eur(c.pp) || '0 €'}</span>` : ''}${c._dp != null ? `<span class="tag">ieri ${eur(c._dp) || 'n.d.'}</span>` : ''}</div>
        <div class="dcols">
        <section id="dFin"><h4>Finanziamento</h4><div id="dCodice">${isVW(c) ? '<p class="hint">Cerco il codice modello nei listini…</p>' : ''}</div><div class="links" id="dSimBtn"></div><div id="dRata"></div></section><section id="dPerm"><h4>Valuta la permuta</h4><div id="dPermBox"></div></section>
        <section><h4>Veicolo</h4><dl class="dl">${row('Immatricolazione', immIt(c))}${row('Chilometri', N(c.km) + ' km')}${row('Potenza', c.cv ? c.cv + ' CV / ' + c.kw + ' kW' : 'n.d.')}${row('Alimentazione', c.fuel)}${row('Cambio', c.cambio)}${row('Colore', c.colore || 'n.d.')}${c.web && c.web.vin ? `<div class="wide"><dt>Telaio</dt><dd><span class="mono">${esc(c.web.vin)}</span> <button class="linkbtn" id="dVin">Copia</button></dd></div>` : ''}${row('Categoria del listino', c.section, true)}</dl></section>
        ${camOk(c) && c.web.cam.url ? `<a class="btn btn-ghost btn-sm" href="${esc(c.web.cam.url)}" target="_blank" rel="noopener">Vedi la foto della retrocamera</a>` : ''}
        ${tettoOk(c) && c.web.tetto.url ? `<a class="btn btn-ghost btn-sm" href="${esc(c.web.tetto.url)}" target="_blank" rel="noopener">Vedi la foto del tetto</a>` : ''}
        ${c.web ? `<section><h4>Dal sito</h4><dl class="dl">${row('Prezzo sul sito', prezzoDiverso(c) ? sitoDiverso(c).testo : eur(c.web.prezzo), prezzoDiverso(c))}${row('Carrozzeria', c.web.carrozzeria)}${row('Porte e posti', [c.web.porte && c.web.porte + ' porte', c.web.posti && c.web.posti + ' posti'].filter(Boolean).join(', '))}${row('Cambio', [c.web.cambio, c.web.marce && c.web.marce + ' marce'].filter(Boolean).join(', '))}${row('Trazione', c.web.trazione)}${row('Interni', c.web.interni)}${row('Garanzia', c.web.garanzia ? c.web.garanzia + ' mesi' : '')}${row('Neopatentati', c.web.neopatentati ? 'Sì' : 'No')}${row('Telecamera posteriore', camTesto(c.web), true)}${row('Tetto apribile', tettoTesto(c.web), true)}${c.web.camLista ? row('Cosa dicono le dotazioni del sito', c.web.camLista, true) : ''}${row('Certificazione', c.web.certificato, true)}</dl></section>` : ''}
        <section id="dStoria" hidden><h4>Storia nelle stampe</h4><div class="timeline" id="dStoriaBody"></div></section>
        <section><h4>Dove si trova</h4><dl class="dl">${row('Ubicazione attuale', c.ubic || 'n.d.')}${row('Sede di ingresso', c.ingresso)}${ggVisibili() ? row('Data di ingresso', dIt(c.ingr)) : ''}${row('Anticipata', c.antic)}</dl></section>
        ${acqV(c) || c.vend || c.dataPren ? `<section><h4>Prenotazione</h4><dl class="dl">${row('Acquirente', acqV(c))}${row('Venditore', c.vend)}${row('Data prenotazione', dIt(c.dataPren))}${row('Modalità di vendita', c.modVen)}${row('Caparra', c.caparra ? eur(c.caparra) : '0 €')}</dl></section>` : ''}
        <section><h4>Pubblicazione e pratiche</h4><dl class="dl">${row('AutoScout', c.as ? 'Sì' + (c.asDate ? ', dal ' + dIt(c.asDate) : '') : 'No')}${row('Check list', c.check ? 'Sì' + (c.checkDate ? ', il ' + dIt(c.checkDate) : '') : 'No')}${row('Prezzo speciale', yn(c.spec))}${row('IVA esposta', yn(c.iva))}${row('Mini PP', yn(c.mini))}${row('Foglio verde', yn(c.fv))}${row('Note', c.note, true)}${S.cliente ? '' : '<div class="wide" id="dAS"></div>'}</dl></section>
        </div>
      </div>`;
    $('drawer').hidden = false;
    requestAnimationFrame(() => { $('drawer').classList.add('on'); $('scrim').classList.add('on'); document.documentElement.classList.add('locked'); });
    sheetOpened();
    $('dClose').onclick = closeAll;
    $('dClose').focus();
    $('dCopy').onclick = () => copy(c.targa, 'Targa copiata');
    $('dShare').onclick = () => condividi(c);
    if ($('dCartello')) $('dCartello').onclick = () => stampaCartello(c);
    if ($('dBack')) $('dBack').onclick = () => mostraAI(S.aiUltimo);
    if ($('dBackL')) $('dBackL').onclick = () => apriLista();
    S.aperta = c.targa; S.vistaLista = false;
    if ($('dVin')) $('dVin').onclick = () => copy(c.web.vin, 'Telaio copiato');
    finanziamento(c);
    if (!S.cliente) giudizioAS(c);
    montaValutatore($('dPermBox'), { url: AI_URL, token: AI_TOKEN });   // anche in modalita' cliente (scelta di Giuseppe)
    frecceGalleria($('drawer').querySelector('.galwrap'));
    const ga = $('drawer').querySelector('.gal');
    if (ga) ga.onclick = e => { const a = e.target.closest('a'); if (!a || e.ctrlKey || e.metaKey) return; e.preventDefault(); apriVisore(c, [...ga.children].indexOf(a)); };
    storiaAuto(c);
    try { history.replaceState(history.state, '', '#' + c.targa); } catch (e) {}
  }

  /* testo per il cliente: niente dati interni (anticipata, note, giorni di stock) */
  function testoCliente(c) {
    const w = c.web || {};
    const righe = [`${c.brand} ${c.family}${w.url ? '' : ' - ' + c.modello}`.trim(),
      [immIt(c) !== 'n.d.' && 'Immatricolata ' + immIt(c), N(c.km) + ' km', c.fuel, c.cambio !== 'n.d.' && 'cambio ' + c.cambio.toLowerCase(), c.cv && c.cv + ' CV'].filter(Boolean).join(' · '),
      (w.colore || c.colore) && 'Colore: ' + (w.colore || c.colore),
      c.prezzoV ? `Prezzo: ${eur(c.prezzoV)}${c.pp ? ` + passaggio di proprietà ${eur(c.pp)}` : ''}` : '',
      w.garanzia && `Garanzia ${w.garanzia} mesi`,
      w.url && 'Foto e dettagli: ' + w.url,
      'Valentino Automobili Roma · tel. 06 415351'];
    return righe.filter(Boolean).join('\n');
  }
  function condividi(c) {
    const text = testoCliente(c);
    if (navigator.share && !inFrame) navigator.share({ text }).catch(() => {});
    else copy(text, 'Testo per il cliente copiato: incollalo su WhatsApp o in una mail');
  }

  /* ---------- finanziamento: codice modello dai listini VW, rata con le formule del simulatore di Giuseppe ---------- */
  let COD = null, SCELTE = null;
  const FS = {};                                  // impostazioni della rata per auto, finche' la pagina resta aperta
  const isVW = c => c.brand === 'Volkswagen';
  const eur2 = n => (n || 0).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const pctIt = v => v.toFixed(2).replace('.', ',') + '%';
  const chiaveCodici = () => { try { return localStorage.getItem('su.chiaveCodici') || ''; } catch (e) { return ''; } };
  async function codici() {
    if (COD !== null) return COD;
    try { const r = await fetch('data/codici.json?t=' + Date.now(), { cache: 'no-store' }); COD = r.ok ? await r.json() : false; } catch (e) { COD = false; }
    return COD;
  }
  // le scelte di Giuseppe stanno nel servizio Apps Script, cosi' le vedono tutti
  async function scelteCodici() {
    if (SCELTE) return SCELTE;
    if (!aiAttivo()) return {};
    try {
      const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: AI_TOKEN, azione: 'codici' }), signal: ctl.signal });
      clearTimeout(to);
      const j = await r.json();
      if (j.scelte) SCELTE = j.scelte;
      return j.scelte || {};
    } catch (e) { return {}; }
  }
  function codiceInUso(c, info, sc) {
    const s = sc[c.targa];
    if (s && s.codice) return { codice: s.codice, versione: s.versione, prezzo: +s.prezzo || 0, scelto: true };
    if (info && info.c && info.c.length === 1) { const k = info.c[0]; return { codice: k[0], versione: k[1], prezzo: k[2] }; }
    return null;
  }
  function htmlCodice(c, info, uso, puoi) {
    if (!isVW(c)) return `<p class="hint">Altre marche: niente listino. Con <b>Simulatore ufficiale</b> copi i dati dell'auto e scegli il modello nel portale.</p>`;
    if (!info) return `<p class="hint">Codice modello non ancora calcolato per quest'auto.</p>`;
    const lst = info.listino ? `listino ${esc(info.listino.nome)} del ${dIt(info.listino.validita)}` : '';
    let h = '';
    if (uso) h += `<div class="cod"><div class="cod-top"><b class="mono">${esc(uso.codice)}</b><span>${esc(uso.versione)}</span></div><div class="cod-sub">Prezzo da nuovo <b>${eur(uso.prezzo)}</b> chiavi in mano${lst ? ' · ' + lst : ''} <span class="tag${uso.scelto ? ' as' : ''}">${uso.scelto ? 'scelto da Giuseppe' : 'unico nel listino'}</span></div></div>`;
    if (!info.c) return h + `<p class="hint">Codice modello non trovato. ${esc(info.motivo)}</p>`;
    if (info.precedenti) h += `<p class="hint">Nel listino in vigore all'immatricolazione questa versione non c'è: i codici vengono dai listini precedenti.</p>`;
    if (info.c.length > 1 && (!uso || puoi)) {
      const base = info.c[0][2], top = info.c[0][4];
      const riga = (k, i) => {
        const mio = uso && uso.codice === k[0];
        return `<li${!uso && k[4] < top ? ' class="meno"' : ''}><span class="mono">${esc(k[0])}</span><span class="v">${esc(k[1])}</span><span class="p">${eur(k[2])}${k[2] !== base ? `<small>${k[2] > base ? '+' : '−'}${eur(Math.abs(k[2] - base))}</small>` : ''}</span>${puoi ? `<button class="chip" data-scegli="${i}" aria-pressed="${mio}">${mio ? 'Scelto' : 'Scegli'}</button>` : ''}</li>`;
      };
      h += `<p class="hint">${uso ? 'Gli altri codici possibili' : `<b>${info.c.length}${info.altri ? ' (e altri ' + info.altri + ')' : ''} codici possibili</b>`} nel ${lst}, versioni ${esc(info.filtri)}. In alto le più simili alla descrizione; la differenza di prezzo è rispetto alla prima. ${puoi ? 'Tocca quello giusto: lo vedranno tutti.' : 'Il codice giusto lo sceglie Giuseppe.'}</p><ul class="cand">${info.c.map(riga).join('')}</ul>`;
    }
    return h;
  }
  function datiPortale(c, uso) {
    return [uso ? `Codice modello: ${uso.codice} (${uso.versione})` : isVW(c) ? 'Codice modello: da scegliere nel portale' : '',
      `Vettura: ${c.brand} ${c.family} ${c.modello}`.replace(/\s+/g, ' '), c.web && c.web.vin ? `Telaio: ${c.web.vin}` : '', `Immatricolazione: ${immIt(c)}`, `Chilometri: ${N(c.km)}`,
      c.prezzo ? `Prezzo di vendita: ${eur(c.prezzo)}` : '', uso && uso.prezzo ? `Prezzo da nuovo: ${eur(uso.prezzo)}` : ''].filter(Boolean).join('\n');
  }
  // copia subito, dentro il tocco: il portale si apre in un'altra scheda e dopo la copia non riuscirebbe piu'
  function copiaSubito(text, ok) {
    const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
    let fatto = false; try { fatto = document.execCommand('copy'); } catch (e) {}
    ta.remove();
    if (fatto) toast(ok); else copy(text, ok);
  }
  async function finanziamento(c) {
    const [cod, sc] = await Promise.all([isVW(c) ? codici() : null, scelteCodici()]);
    if (S.aperta !== c.targa || !$('dCodice')) return;
    const info = cod && cod.auto ? cod.auto[c.targa] : null, uso = codiceInUso(c, info, sc || {}), puoi = !!chiaveCodici() && aiAttivo();
    $('dCodice').innerHTML = htmlCodice(c, info, uso, puoi);
    $('dCodice').onclick = e => { const b = e.target.closest('[data-scegli]'); if (b && info && info.c) scegliCodice(c, info.c[+b.dataset.scegli]); };
    const q = new URLSearchParams({ modello: `${c.brand} ${c.family} ${c.modello}`.replace(/\s+/g, ' ').trim(), prezzo: c.prezzo || '', tipo: isVW(c) ? 'pvv' : 'multimake' });
    if (uso && uso.prezzo) q.set('nuovo', uso.prezzo);
    $('dSimBtn').innerHTML = `<a class="btn btn-ghost btn-sm" id="dSimUff" href="${FIN.portale}" target="_blank" rel="noopener">Simulatore ufficiale</a><a class="btn btn-ghost btn-sm" href="simulatore.html?${esc(q.toString())}" target="_blank" rel="noopener">Mio simulatore</a>`;
    $('dSimUff').onclick = () => copiaSubito(datiPortale(c, uso), 'Dati copiati: incollali nel portale VW FS');
    rata(c, uso);
  }
  async function scegliCodice(c, k) {
    const chiave = chiaveCodici();
    if (!chiave || !k) return;
    toast('Salvo il codice…');
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: AI_TOKEN, azione: 'scegli', chiave, targa: c.targa, codice: k[0], versione: k[1], prezzo: k[2] }) });
      const j = await r.json();
      if (j.errore) return toast(j.errore, true);
      SCELTE = j.scelte || Object.assign(SCELTE || {}, { [c.targa]: { codice: k[0], versione: k[1], prezzo: k[2] } });
      toast(`Codice ${k[0]} salvato per ${c.targa}`);
      if (S.aperta === c.targa) finanziamento(c);
    } catch (e) { toast('Codice non salvato: controlla la connessione e riprova', true); }
  }
  // calcolatore della rata nella scheda, come quello delle finanziarie sui portali
  function rata(c, uso) {
    const el = $('dRata');
    if (!el) return;
    if (!c.prezzo) { el.innerHTML = '<p class="hint">Prezzo non inserito: niente simulazione della rata.</p>'; return; }
    const tipi = (isVW(c) ? ['pvv'] : []).concat(['multimake', 'classico']);
    // manutenzione come nel simulatore: per metano, plug-in e up! la tariffa dedicata, per le altre 1 tagliando (si puo' cambiare)
    const manIniz = /Plug-in|Metano/.test(c.fuel) || /^up/i.test(c.family || '') ? 'plugin' : 'tagliando1';
    const st = FS[c.targa] || (FS[c.targa] = { tipo: tipi[0], ant: 0, dur: 36, km: FIN.kmAnnui, vfg: FIN.vfg.iniziale, mm: 0, man: true, manTipo: manIniz, furto: '', furtoMesi: 0, gap: false, ego: false, safe: false });
    // furto e incendio: copertura da 12 a 84 mesi, qualunque sia la durata del finanziamento; si parte dalla durata, arrotondata all'anno
    const SV = FIN.servizi, mesiFi = d => Math.min(84, Math.max(12, Math.ceil(d / 12) * 12));
    if (!FIN.mesiFurto.includes(st.furtoMesi)) st.furtoMesi = mesiFi(st.dur);
    const opzMesi = sel => FIN.mesiFurto.map(m => `<option value="${m}"${m === sel ? ' selected' : ''}>${m} mesi</option>`).join('');
    if (!tipi.includes(st.tipo)) st.tipo = tipi[0];
    const P = FIN[st.tipo], palla = st.tipo !== 'classico';
    const suNuovo = !!(uso && uso.prezzo), base = suNuovo ? uso.prezzo : c.prezzo;
    const maxAnt = Math.floor(c.prezzo * Math.min(P.maxAnticipo, 60) / 100 / 100) * 100;
    st.ant = Math.min(st.ant, maxAnt);
    if (palla && !P.durate.includes(st.dur)) st.dur = 36;
    if (!palla) st.dur = Math.max(P.durataMin, Math.min(P.durataMax, st.dur));
    const tan = st.tipo === 'multimake' ? P.tassi[st.mm].tan : P.tan;
    el.innerHTML = `<div class="fin">
      <div class="seg" role="group" aria-label="Tipo di finanziamento">${tipi.map(t => `<button data-fin-tipo="${t}" aria-pressed="${t === st.tipo}">${FIN[t].nome}</button>`).join('')}</div>
      <div id="fOut" aria-live="polite"></div>
      <label class="fin-l"><span>Anticipo</span><b id="fAntV"></b><input type="range" id="fAnt" min="0" max="${maxAnt}" step="100" value="${st.ant}"></label>
      <div class="fin-l"><span>Durata</span>${palla ? `<div class="fin-chips">${P.durate.map(d => `<button class="chip" data-fin-dur="${d}" aria-pressed="${d === st.dur}">${d} mesi</button>`).join('')}</div>` : `<b id="fDurV"></b><input type="range" id="fDur" min="${P.durataMin}" max="${P.durataMax}" step="6" value="${st.dur}">`}</div>
      ${palla ? `<label class="fin-l"><span>Valore futuro garantito</span><b id="fVfgV"></b><input type="range" id="fVfg" min="${FIN.vfg.min}" max="${FIN.vfg.max}" step="1" value="${st.vfg}"><small>${suNuovo ? `in % del prezzo da nuovo (${eur(base)}, codice ${esc(uso.codice)})` : `in % del prezzo di vendita: ${isVW(c) ? 'quando c\'è il codice modello si usa il prezzo da nuovo' : 'per questa marca non c\'è listino'}`}</small></label>
      <label class="fin-l"><span>Km all'anno</span><select id="fKm">${[10000, 15000, 20000, 25000, 30000, 40000].map(k => `<option value="${k}"${k === st.km ? ' selected' : ''}>${N(k)}</option>`).join('')}</select></label>` : ''}
      <details class="fin-serv" id="fServ"${st.servAperti ? ' open' : ''}><summary><span>Servizi</span><b id="fServV"></b></summary>
        ${palla ? `<div class="fin-gr"><label class="fin-check"><input type="checkbox" id="fMan"${st.man ? ' checked' : ''}><span>Manutenzione WeCare Easy</span></label>
          <div class="fin-chips">${[['tagliando1', '1 tagliando'], ['tagliando2', '2 tagliandi'], ['plugin', 'Metano, plug-in o up!']].map(([k, l]) => `<button class="chip" data-fin-man="${k}" aria-pressed="${st.manTipo === k}">${l} · ${FIN.manutenzione[k]} €/mese</button>`).join('')}</div></div>` : ''}
        <div class="fin-gr"><span class="fin-tit">Finanziati (fanno interessi)</span>
          <label class="fin-check"><input type="checkbox" id="fFurto"${st.furto ? ' checked' : ''}><span>Furto e incendio</span></label>
          ${st.furto ? `<div class="fin-chips">${[['first_trip', 'First Trip'], ['business_tour', 'Business Tour']].map(([k, l]) => `<button class="chip" data-fin-furto="${k}" aria-pressed="${st.furto === k}">${l} · ${SV.furtoPerMille[k]} €/1.000 € l'anno</button>`).join('')}</div>
          <label class="fin-l"><span>Copertura</span><select id="fFurtoMesi">${opzMesi(st.furtoMesi)}</select></label>` : ''}
          <label class="fin-check"><input type="checkbox" id="fGap"${st.gap ? ' checked' : ''}><span>Garanzia GAP (valore a nuovo) · ${SV.gap} €/mese</span></label></div>
        <div class="fin-gr"><span class="fin-tit">Ripartiti sulla rata (senza interessi)</span>
          <label class="fin-check"><input type="checkbox" id="fEgo"${st.ego ? ' checked' : ''}><span>CPI Alter Ego (protezione del credito) · ${SV.alterEgo} €/mese</span></label>
          <label class="fin-check"><input type="checkbox" id="fSafe"${st.safe ? ' checked' : ''}><span>Personal Safe · ${SV.personalSafe} €/mese</span></label></div>
      </details>
      ${st.tipo === 'multimake' ? `<div class="fin-l"><span>Tasso</span><div class="fin-chips">${P.tassi.map((t, i) => `<button class="chip" data-fin-mm="${i}" aria-pressed="${i === st.mm}">${t.nome} ${pctIt(t.tan)}</button>`).join('')}</div></div>` : ''}
      <p class="fin-note" id="fNote"></p>
      <div class="links"><button class="btn btn-primary btn-sm" id="fPrev">Invia preventivo al cliente</button><a class="btn btn-ghost btn-sm" id="fPrevVedi" href="#" target="_blank" rel="noopener">Anteprima</a></div>
    </div>`;
    const aggiorna = () => {
      st.ant = +$('fAnt').value;
      const durPrima = st.dur;
      if ($('fDur')) st.dur = +$('fDur').value;
      // come nel simulatore: cambiando la durata la copertura furto e incendio torna pari alla durata
      if (st.dur !== durPrima) { st.furtoMesi = mesiFi(st.dur); if ($('fFurtoMesi')) $('fFurtoMesi').value = st.furtoMesi; }
      else if ($('fFurtoMesi')) st.furtoMesi = +$('fFurtoMesi').value;
      if ($('fVfg')) st.vfg = +$('fVfg').value;
      if ($('fKm')) st.km = +$('fKm').value;
      if ($('fMan')) st.man = $('fMan').checked;
      st.gap = $('fGap').checked; st.ego = $('fEgo').checked; st.safe = $('fSafe').checked;
      // stesse formule del simulatore: furto e incendio per mille del prezzo all'anno per gli anni di copertura, gli altri al mese per la durata
      const man = palla && st.man ? FIN.manutenzione[st.manTipo] * st.dur : 0;
      const furto = st.furto ? c.prezzo / 1000 * SV.furtoPerMille[st.furto] * st.furtoMesi / 12 : 0;
      const gap = st.gap ? SV.gap * st.dur : 0;
      const ripartiti = (st.ego ? SV.alterEgo * st.dur : 0) + (st.safe ? SV.personalSafe * st.dur : 0);
      const attivi = [palla && st.man, st.furto, st.gap, st.ego, st.safe].filter(Boolean).length;
      const nomiServizi = [palla && st.man && `Manutenzione WeCare Easy (${{ tagliando1: '1 tagliando', tagliando2: '2 tagliandi', plugin: 'metano, plug-in o up!' }[st.manTipo]})`,
        st.furto && `Furto e incendio ${st.furto === 'first_trip' ? 'First Trip' : 'Business Tour'} (${st.furtoMesi} mesi)`, st.gap && 'Garanzia GAP (valore a nuovo)', st.ego && 'CPI Alter Ego (protezione del credito)', st.safe && 'Personal Safe'].filter(Boolean);
      $('fServV').textContent = attivi ? `${attivi} ${attivi === 1 ? 'attivo' : 'attivi'}` : 'nessuno';
      const vfg = Math.round(base * st.vfg) / 100;
      const r = finCalcola({ tipo: st.tipo, prezzo: c.prezzo, anticipo: st.ant, durata: st.dur, tan, vfg, servizi: man + furto + gap, ripartiti });
      $('fAntV').textContent = `${st.ant ? eur(st.ant) : '0 €'} · ${Math.round(st.ant / c.prezzo * 100)}%`;
      if ($('fDurV')) $('fDurV').textContent = st.dur + ' mesi';
      if ($('fVfgV')) $('fVfgV').textContent = `${st.vfg}% · ${eur2(vfg)}`;
      if (r.errore) { $('fOut').innerHTML = `<p class="hint err">${esc(r.errore)}</p>`; $('fNote').textContent = ''; $('fPrev').disabled = true; return; }
      $('fPrev').disabled = false;
      const lp = linkPreventivo(c, r, st, P, nomiServizi);
      $('fPrevVedi').href = lp;
      $('fPrev').onclick = () => condividiLink(lp, `Preventivo per ${c.brand} ${c.family}: ${eur2(r.rata)} al mese · Valentino Automobili`);
      $('fOut').innerHTML = `<div class="fin-rata"><b>${eur2(r.rata)}</b><span>al mese</span></div><div class="fin-sub">${palla ? `${r.nRate} rate e maxirata finale di <b>${eur2(r.vfg)}</b> · ${N(Math.round(st.km * st.dur / 12))} km inclusi` : `${r.nRate} rate`}</div>`;
      $('fNote').textContent = `${P.titolo} · TAN ${pctIt(r.tan)} · TAEG ${r.taeg == null ? 'n.d.' : pctIt(r.taeg * 100)} · importo finanziato ${eur2(r.finanziato)} con ${eur2(r.istruttoria)} di spese di istruttoria${r.servizi ? ` e ${eur2(r.servizi)} di servizi finanziati` : ''}${r.ripartiti ? ` · servizi ripartiti ${eur2(r.ripartiti)}, ${eur2(r.rataServizi)} a rata già compresi` : ''} · prima rata ${eur2(r.primaRata)} con imposta di bollo e incasso, poi ${eur2(r.incasso)} di incasso a rata. Esempio indicativo: il preventivo ufficiale si fa sul portale VW FS.`;
    };
    el.querySelectorAll('input,select').forEach(i => i.addEventListener('input', aggiorna));
    // spuntare o togliere furto e incendio mostra o nasconde le sue opzioni: ridisegno
    $('fFurto').addEventListener('change', () => { st.furto = $('fFurto').checked ? 'first_trip' : ''; st.servAperti = true; rata(c, uso); });
    $('fServ').addEventListener('toggle', () => { st.servAperti = $('fServ').open; });
    el.onclick = e => {
      const b = e.target.closest('[data-fin-tipo],[data-fin-dur],[data-fin-mm],[data-fin-man],[data-fin-furto]');
      if (!b) return;
      if (b.dataset.finTipo) st.tipo = b.dataset.finTipo;
      if (b.dataset.finDur) { st.dur = +b.dataset.finDur; st.furtoMesi = 0; }
      if (b.dataset.finMm) st.mm = +b.dataset.finMm;
      if (b.dataset.finMan) { st.manTipo = b.dataset.finMan; st.man = true; }
      if (b.dataset.finFurto) st.furto = b.dataset.finFurto;
      rata(c, uso);
    };
    aggiorna();
  }

  /* ---------- lista per il cliente, confronto e preventivo ---------- */
  const STELLA = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 5.9L12 16.8l-5.3 2.8 1.1-5.9-4.4-4.2 6-.8z"/></svg>';
  const LISTA = { t: (store.get('su.lista') || []).filter(x => typeof x === 'string') };
  const inLista = t => LISTA.t.includes(t);
  const baseSito = () => location.origin + location.pathname.replace(/[^/]*$/, '');
  function stella(t) {
    LISTA.t = inLista(t) ? LISTA.t.filter(x => x !== t) : LISTA.t.concat(t).slice(-12);
    store.set('su.lista', LISTA.t);
    document.querySelectorAll(`[data-stella="${t}"]`).forEach(b => b.setAttribute('aria-pressed', String(inLista(t))));
    renderListaBar();
    if (S.vistaLista) apriLista();
    toast(inLista(t) ? 'Aggiunta alla lista per il cliente' : 'Tolta dalla lista');
  }
  const autoLista = () => LISTA.t.map(t => S.cars.find(c => c.targa === t)).filter(Boolean);
  function renderListaBar() { const n = autoLista().length; $('listaBar').hidden = !n; $('listaN').textContent = n; }
  // MERCATO: giudizio di AutoScout sul prezzo, caricato quando serve
  let MERC = null;
  async function mercato() {
    if (MERC !== null) return MERC;
    try { const r = await fetch('data/mercato.json?t=' + Date.now(), { cache: 'no-store' }); MERC = r.ok ? await r.json() : false; } catch (e) { MERC = false; }
    return MERC;
  }
  const GIUDIZI_AS = { 'top-price': ['Prezzo top', 'ok'], 'good-price': ['Buon prezzo', 'ok'], 'fair-price': ['Nella media', ''], 'somewhat-expensive': ['Un po\' alto', 'warn'], expensive: ['Alto', 'bad'] };
  async function giudizioAS(c) {
    const m = await mercato(), a = m && m.auto && m.auto[c.targa];
    if (!$('dAS') || S.aperta !== c.targa) return;
    if (!a) { $('dAS').innerHTML = ''; return; }
    const [lab, cl] = GIUDIZI_AS[a.g] || ['Senza giudizio', ''];
    $('dAS').innerHTML = `<dt>Giudizio di AutoScout sul prezzo</dt><dd><span class="gas ${cl}">${esc(lab)}</span> <a href="${esc(a.u)}" target="_blank" rel="noopener">vedi l'annuncio</a></dd>`;
  }
  // rata di esempio uguale per tutte, per confrontarle: 36 mesi, nessun anticipo, VFG 45% del prezzo, manutenzione inclusa
  function rataEsempio(c) {
    if (!c.prezzo) return null;
    const tipo = isVW(c) ? 'pvv' : 'multimake', P = FIN[tipo], man = /Plug-in|Metano/.test(c.fuel) || /^up/i.test(c.family || '') ? FIN.manutenzione.plugin : FIN.manutenzione.tagliando1;
    const r = finCalcola({ tipo, prezzo: c.prezzo, anticipo: 0, durata: 36, tan: tipo === 'pvv' ? P.tan : P.tassi[0].tan, vfg: Math.round(c.prezzo * FIN.vfg.iniziale) / 100, servizi: man * 36 });
    return r.errore ? null : { ...r, nome: P.nome };
  }
  const RIGHE_CONF = [
    ['Prezzo', c => c.prezzo ? eur(c.prezzo) : 'n.d.', c => c.prezzo || 1e12, 'min'],
    ['Rata di esempio', c => { const r = rataEsempio(c); return r ? `${eur2(r.rata)}<small>${r.nome}, 36 mesi</small>` : '—'; }, c => (rataEsempio(c) || {}).rata || 1e12, 'min'],
    ['Immatricolazione', c => immIt(c), c => c.imm || '', 'max'],
    ['Chilometri', c => N(c.km) + ' km', c => c.km, 'min'],
    ['Alimentazione', c => esc(c.fuel)], ['Cambio', c => esc(c.cambio)],
    ['Potenza', c => c.cv ? `${c.cv} CV · ${c.kw} kW` : 'n.d.', c => c.cv || 0, 'max'],
    ['Colore', c => esc((c.web && c.web.colore) || c.colore || 'n.d.')],
    ['Carrozzeria', c => esc((c.web && c.web.carrozzeria) || '—')],
    ['Porte e posti', c => c.web && (c.web.porte || c.web.posti) ? [c.web.porte && c.web.porte + ' porte', c.web.posti && c.web.posti + ' posti'].filter(Boolean).join(', ') : '—'],
    ['Trazione', c => esc(trazioneDi(c) || '—')],
    ['Km 0', c => km0(c) ? 'Sì' : '—'],
    ['Telecamera posteriore', c => camOk(c) ? 'Sì, verificata' : '—'],
    ['Tetto apribile', c => tettoOk(c) ? 'Sì, verificato' : '—'],
    ['Neopatentati', c => c.web && c.web.neopatentati ? 'Sì' : '—'],
    ['Garanzia', c => c.web && c.web.garanzia ? c.web.garanzia + ' mesi' : '—', c => (c.web && c.web.garanzia) || 0, 'max']
  ];
  function htmlConfronto(l) {
    if (l.length < 2) return '<p class="hint">Aggiungi almeno due auto alla lista per confrontarle.</p>';
    const migliori = RIGHE_CONF.map(([, , v, verso]) => { if (!v) return null; const vals = l.map(v); const b = verso === 'min' ? Math.min(...vals) : vals.reduce((a, x) => (x > a ? x : a), vals[0]); return vals.filter(x => x === b).length < l.length ? b : null; });
    return `<div class="conf"><table><thead><tr><th></th>${l.map(c => `<th><button class="conf-auto" data-open="${c.targa}">${foto(c, 400) ? `<img src="${foto(c, 400)}" alt="">` : ''}<b>${esc(c.brand)} ${esc(c.family)}</b><span>${esc(c.modello)}</span></button></th>`).join('')}</tr></thead>
      <tbody>${RIGHE_CONF.map(([nome, f, v], i) => `<tr><th>${nome}</th>${l.map(c => `<td class="${v && migliori[i] != null && v(c) === migliori[i] ? 'best' : ''}">${f(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="hint">In evidenza il valore migliore in ogni riga. La rata di esempio è uguale per tutte: 36 mesi senza anticipo, valore futuro 45% del prezzo, manutenzione inclusa.</p>`;
  }
  function apriLista(confronta) {
    const l = autoLista();
    S.vistaLista = true; S.aperta = null;
    if (confronta != null) S.confronta = confronta;
    $('drawer').innerHTML = `<button class="close" id="dClose" aria-label="Chiudi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <header><h2>Lista per il cliente</h2><p style="color:var(--ink2)">${l.length ? `${l.length} ${l.length === 1 ? 'auto' : 'auto'} · confrontale e mandale con un solo messaggio` : 'Tocca la stella su un\'auto per aggiungerla.'}</p>
      <div class="r3">${l.length ? `<button class="btn btn-primary btn-sm" id="lInvia">Invia al cliente</button><button class="btn btn-ghost btn-sm" id="lConf" aria-pressed="${!!S.confronta}">${S.confronta ? 'Vedi elenco' : 'Confronta'}</button><button class="btn btn-ghost btn-sm" id="lVuota">Svuota</button>` : ''}</div></header>
      <div class="scroll">${S.confronta ? htmlConfronto(l) : `<ul class="lista">${l.map(c => `<li><button class="la" data-open="${c.targa}">${foto(c, 400) ? `<img src="${foto(c, 400)}" alt="">` : '<i></i>'}<span><b>${esc(c.brand)} ${esc(c.family)}</b><small>${esc(c.modello)}</small><small>${immIt(c)} · ${N(c.km)} km · ${esc(c.fuel)}${c.free ? '' : ' · ' + esc(stLabel(c))}</small></span><b class="p">${c.prezzo ? eur(c.prezzo) : 'n.d.'}</b></button><button class="chip" data-stella="${c.targa}" aria-pressed="true" aria-label="Togli dalla lista">Togli</button></li>`).join('')}</ul>`}</div>`;
    $('drawer').hidden = false;
    requestAnimationFrame(() => { $('drawer').classList.add('on'); $('scrim').classList.add('on'); document.documentElement.classList.add('locked'); });
    sheetOpened();
    $('dClose').onclick = closeAll;
    if ($('lInvia')) $('lInvia').onclick = () => condividiLink(`${baseSito()}cliente.html#l=${l.map(c => c.targa).join(',')}`, `Le auto che abbiamo scelto per lei da Valentino Automobili (${l.length})`);
    if ($('lConf')) $('lConf').onclick = () => apriLista(!S.confronta);
    if ($('lVuota')) $('lVuota').onclick = () => { LISTA.t = []; store.set('su.lista', []); document.querySelectorAll('[data-stella]').forEach(b => b.setAttribute('aria-pressed', 'false')); renderListaBar(); closeAll(); };
  }
  function condividiLink(url, testo) {
    if (navigator.share && !inFrame) navigator.share({ title: 'Valentino Automobili', text: testo, url }).catch(() => {});
    else copy(testo + '\n' + url, 'Link copiato: incollalo su WhatsApp o in una mail');
  }
  // preventivo: tutti i dati stanno nel link, cosi' resta valido anche se l'auto cambia nello stock
  const codifica = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function linkPreventivo(c, r, st, P, servizi) {
    const w = c.web || {};
    const p = {
      v: 1, d: new Date().toISOString().slice(0, 10), n: `${c.brand} ${c.family}`, m: c.modello, imm: immIt(c), km: c.km, fu: c.fuel, ca: c.cambio, cv: c.cv, kw: c.kw,
      co: w.colore || c.colore || '', ga: w.garanzia || 0, k0: km0(c) ? 1 : 0, url: w.url || '', foto: [0, 1, 2, 3].map(i => foto(c, 800, i)).filter(Boolean), pr: c.prezzo,
      f: { t: P.titolo, ant: r.anticipo, dur: r.durata, rata: r.rata, nr: r.nRate, vfg: r.vfg, km: st.tipo !== 'classico' ? st.km : 0, tan: r.tan, taeg: r.taeg, fin: r.finanziato, prima: r.primaRata, ist: r.istruttoria, inc: r.incasso, bol: r.bollo, serv: servizi }
    };
    return `${baseSito()}cliente.html#p=${codifica(p)}`;
  }

  // frecce e contatore sopra una galleria di foto che scorre di lato
  function frecceGalleria(box) {
    const g = box && box.querySelector('.gal'), sx = box && box.querySelector('.gfr.sx'), dx = box && box.querySelector('.gfr.dx'), n = box && box.querySelector('.gnum');
    if (!g || !sx || !dx) return;
    const passo = () => { const a = g.firstElementChild; return a ? a.getBoundingClientRect().width + 8 : g.clientWidth; };
    const tot = g.children.length;
    const aggiorna = () => {
      sx.hidden = g.scrollLeft < 10;
      dx.hidden = g.scrollLeft + g.clientWidth >= g.scrollWidth - 10;
      if (n) n.textContent = `${dx.hidden ? tot : Math.min(tot, Math.round(g.scrollLeft / passo()) + 1)} / ${tot}`;   // in fondo: ultima foto
    };
    sx.onclick = () => g.scrollBy({ left: -passo(), behavior: 'smooth' });
    dx.onclick = () => g.scrollBy({ left: passo(), behavior: 'smooth' });
    g.addEventListener('scroll', aggiorna, { passive: true });
    addEventListener('resize', aggiorna, { passive: true });
    aggiorna();
  }

  // visore a tutto schermo: le foto dell'auto grandi, da scorrere col dito, con le frecce o con i tasti
  let visoreAperto = false, ignoraIndietro = false;
  function apriVisore(c, k) {
    const v = $('visore'), s = $('vStrip'), n = c.web.foto.length;
    const sz = innerWidth * (devicePixelRatio || 1) > 1400 ? 1920 : 1280;
    s.innerHTML = c.web.foto.map((x, i) => `<figure><img src="${fotoBase() + sz + '/' + x}" alt="Foto ${i + 1}" ${Math.abs(i - k) <= 1 ? '' : 'loading="lazy"'} decoding="async"></figure>`).join('');
    v.hidden = false; visoreAperto = true;
    s.scrollLeft = k * s.clientWidth;
    const agg = () => {
      const i = Math.round(s.scrollLeft / s.clientWidth);
      $('vNum').textContent = `${i + 1} / ${n}`;
      $('vSx').hidden = i <= 0; $('vDx').hidden = i >= n - 1;
      // la foto prima e quella dopo si caricano subito, cosi' scorrendo non si vede il nero
      for (const j of [i - 1, i + 1]) { const im = s.children[j] && s.children[j].querySelector('img'); if (im) im.loading = 'eager'; }
    };
    s.onscroll = agg; agg();
    try { history.pushState({ visore: 1 }, ''); } catch (e) {}
    $('vChiudi').focus();
  }
  function chiudiVisore(daIndietro) {
    if (!visoreAperto) return;
    visoreAperto = false; $('visore').hidden = true; $('vStrip').innerHTML = '';
    // chiuso con la X: tolgo il passo aggiunto alla cronologia, senza che l'Indietro chiuda anche la scheda
    if (!daIndietro) try { if (history.state && history.state.visore) { ignoraIndietro = true; history.back(); } } catch (e) {}
  }
  const scorriVisore = d => $('vStrip').scrollBy({ left: d * $('vStrip').clientWidth, behavior: 'smooth' });
  $('vSx').onclick = () => scorriVisore(-1);
  $('vDx').onclick = () => scorriVisore(1);
  $('vChiudi').onclick = () => chiudiVisore();
  addEventListener('keydown', e => {
    if (!visoreAperto) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); scorriVisore(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); scorriVisore(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); chiudiVisore(); }
  }, true);
  addEventListener('resize', () => { if (visoreAperto) { const s = $('vStrip'), i = Math.round(s.scrollLeft / s.clientWidth); requestAnimationFrame(() => { s.scrollLeft = i * s.clientWidth; }); } });

  /* ---------- storico: caricato solo quando serve ---------- */
  let STO = null;
  async function storico() {
    if (STO !== null) return STO;
    try { const r = await fetch('data/storico.json?t=' + Date.now(), { cache: 'no-store' }); STO = r.ok ? await r.json() : false; } catch (e) { STO = false; }
    return STO;
  }
  async function storiaAuto(c) {
    const sto = await storico(), a = sto && sto.auto[c.targa];
    if (!a || !$('dStoria')) return;
    const ev = [];
    if (c.ingr && ggVisibili()) ev.push([c.ingr, `Entrata in stock (${c.giorni != null ? c.giorni + ' giorni fa' : ''})`]);
    if (a.da > sto.dal && ggVisibili()) ev.push([a.da, 'Compare per la prima volta nelle stampe']);
    a.p.forEach((p, k) => { if (k) { const prima = a.p[k - 1][1]; ev.push([p[0], !prima ? `Prezzo inserito: ${eur(p[1])}` : !p[1] ? 'Prezzo tolto' : `Prezzo ${p[1] < prima ? 'ribassato' : 'aumentato'}: ${eur(prima)} → ${eur(p[1])}`]); } });
    a.s.forEach((s, k) => { if (k) ev.push([s[0], `Stato: ${a.s[k - 1][1]} → ${s[1]}`]); });
    if (a.pren) ev.push([a.pren, 'Prenotata']);
    if (a.out) ev.push([a.out, 'Non compare più nella stampa']);
    ev.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
    $('dStoriaBody').innerHTML = ev.map(e => `<div><time>${dIt(e[0])}</time><span>${esc(e[1])}</span></div>`).join('') + `<p class="hint">Le stampe sono registrate dal ${dIt(sto.dal)}.</p>`;
    $('dStoria').hidden = false;
  }
  // sul telefono il tasto Indietro chiude scheda e filtri invece di uscire dall'app
  function sheetOpened() { try { if (!(history.state && history.state.sheet)) history.pushState({ sheet: 1 }, ''); } catch (e) {} }
  function closeAll() { closeView(); try { if (history.state && history.state.sheet) history.back(); } catch (e) {} }
  addEventListener('popstate', () => { if (ignoraIndietro) { ignoraIndietro = false; return; } if (visoreAperto) return chiudiVisore(true); closeView(); });
  function closeView() { document.documentElement.classList.remove('locked'); $('drawer').classList.remove('on'); $('filters').classList.remove('on'); $('scrim').classList.remove('on'); setTimeout(() => { if (!$('drawer').classList.contains('on')) $('drawer').hidden = true; }, 350); }

  let toastT;
  function toast(msg, err) { const t = $('toast'); t.textContent = msg; t.classList.toggle('err', !!err); t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), err ? 6000 : 2800); }
  function copy(text, ok) {
    const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); let done = false; try { done = document.execCommand('copy'); } catch (e) {} ta.remove(); toast(done ? ok : 'Copia non riuscita in questa finestra', !done); };
    try { navigator.clipboard.writeText(text).then(() => toast(ok), fallback); } catch (e) { fallback(); }
  }

  // le parole che non compaiono in nessuna auto ("figli", "vuole") non devono azzerare i risultati: le ignoro e lo dico
  function capisci(testo) {
    const Q = parseQuery(testo, S.vocab);
    if (!ggVisibili() && Q.r && Q.r.giorni) { delete Q.r.giorni; Q.chips = Q.chips.filter(ch => !/gg in stock/.test(ch)); }
    Q.ignorate = Q.terms.filter(w => !S.cars.some(c => c._h.includes(w)));
    if (Q.ignorate.length) { Q.terms = Q.terms.filter(w => !Q.ignorate.includes(w)); Q.chips = Q.chips.filter(ch => !Q.ignorate.some(w => ch === '“' + w + '”')); }
    return Q;
  }

  /* ---------- assistente (Gemini, tramite il servizio Apps Script) ---------- */
  const ICONA_AI = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M19 15l.7 1.8 1.8.7-1.8.7L19 20l-.7-1.8-1.8-.7 1.8-.7z"/></svg>';
  // le auto che l'assistente puo' proporre: quelle dei filtri laterali (non la ricerca scritta, che e' la domanda), non prenotate e vendibili
  function candidatiAI(domanda) {
    const Q = S.Q; S.Q = parseQuery('', []);
    const base = S.cars.filter(c => !c.booked && c.st !== 4 && pass(c));
    S.Q = Q;
    // dalla domanda tengo solo i vincoli chiari (budget, km, anno, potenza, alimentazione, cambio, modello) con un po' di margine:
    // a Gemini arrivano decine di auto invece di centinaia, la risposta e' piu' veloce e costa meno
    const D = capisci(domanda), r = D.r;
    const entro = (v, lo, hi) => v != null && (lo == null || v >= lo) && (hi == null || v <= hi);
    let l = base.filter(c => {
      if (r.prezzo && !(c.prezzo && entro(c.prezzo, r.prezzo[0] != null ? r.prezzo[0] * 0.85 : null, r.prezzo[1] != null ? r.prezzo[1] * 1.12 : null))) return false;
      if (r.km && r.km[1] != null && !entro(c.km, null, r.km[1] * 1.2)) return false;
      if (r.anno && r.anno[0] != null && !entro(c.anno, r.anno[0] - 1, null)) return false;
      if (r.cv && r.cv[0] != null && !(c.cv && entro(c.cv, r.cv[0] * 0.9, null))) return false;
      if (D.fuel.size && !D.fuel.has(c.fuel)) return false;
      if (D.cambio.size && c.cambio !== 'n.d.' && !D.cambio.has(c.cambio)) return false;
      if (D.family.size && !D.family.has(c.family)) return false;
      if (D.brand.size && !D.brand.has(c.brand) && !(D.family.size && D.family.has(c.family))) return false;
      if (D.awd && c.trazione !== 'Integrale') return false;
      return true;
    });
    if (l.length < 12 && !(D.awd && l.length)) l = base;   // vincoli troppo stretti o capiti male: Gemini sceglie su tutte le disponibili
    return l.sort(SORTS.cons).slice(0, 400);
  }
  const rigaAI = c => [c.targa, `${c.brand} ${c.modello}`.slice(0, 60), immIt(c), N(c.km) + ' km', c.fuel, c.cambio, c.cv ? c.cv + ' CV' : 'CV n.d.', c.prezzo ? eur(c.prezzo) : 'prezzo da definire', c.colorG, c.ubic, ggVisibili() ? (c.giorni ?? '?') + ' gg' : '', [c.st === 7 && 'in arrivo', c.st === 6 && 'in riparazione', c.trazione === 'Integrale' ? 'trazione integrale 4x4' : c.trazione && 'trazione ' + c.trazione.toLowerCase(), km0(c) && 'km 0', camOk(c) && 'telecamera posteriore confermata', tettoOk(c) && tettoNome(c).toLowerCase() + ' confermato', c.web && c.web.neopatentati && 'neopatentati', c.web && c.web.porte && c.web.porte + ' porte', c.web && c.web.carrozzeria].filter(Boolean).join(', ')].join(' | ');
  function mostraAI(st) {
    S.aiUltimo = st;
    const auto = (st.auto || []).map(a => ({ a, c: S.cars.find(x => x.targa === String(a.targa).toUpperCase().replace(/\s+/g, '')) })).filter(x => x.c);
    const corpo = st.attesa ? `<div class="ai-wait"><span class="spin"></span>Gemini sta valutando ${N(st.n)} auto disponibili…</div>`
      : st.errore ? `<p class="ai-err">${esc(st.errore)}</p>`
      : `<div class="ai-ans">${esc(st.risposta || '')}</div>
         <ul class="ai-list">${auto.map(({ a, c }) => `<li data-open="${esc(c.targa)}"><div class="th">${foto(c, 200) ? `<img src="${foto(c, 200)}" alt="" loading="lazy">` : ''}</div><div class="tx"><span class="nm"><b>${esc(c.brand)} ${esc(c.family)}</b> ${plate(c.targa)}</span><span>${immIt(c)} · ${N(c.km)} km · ${esc(c.fuel)} · ${esc(c.cambio)} · <b>${eur(c.prezzo) || 'prezzo n.d.'}</b></span><em>${esc(a.perche)}</em></div></li>`).join('')}</ul>
         ${(st.auto || []).length > auto.length ? '<p class="hint">Alcune auto proposte non sono state trovate nello stock e le ho tolte.</p>' : ''}
         <p class="hint">Risposta generata da Gemini su ${N(st.n)} auto disponibili${st.filtri ? ' con i filtri attivi' : ''}. Controlla sempre i dati nella scheda prima di proporla al cliente.${st.uso && st.uso.mese ? ` Questo mese: ${N(st.uso.mese.domande)} ${st.uso.mese.domande === 1 ? 'domanda' : 'domande'}, circa ${st.uso.mese.spesa.toLocaleString('it-IT', { minimumFractionDigits: 2 })} $ di credito usati.` : ''}</p>`;
    $('drawer').innerHTML = `<button class="close" id="dClose" aria-label="Chiudi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      <header><span class="ai-badge">${ICONA_AI}Assistente</span><h2 class="ai-q">${esc(st.domanda)}</h2></header>
      <div class="scroll ai">${corpo}</div>`;
    if ($('drawer').hidden || !$('drawer').classList.contains('on')) {
      $('drawer').hidden = false;
      requestAnimationFrame(() => { $('drawer').classList.add('on'); $('scrim').classList.add('on'); document.documentElement.classList.add('locked'); });
      sheetOpened();
    }
    $('dClose').onclick = closeAll;
  }
  async function chiediAI(domanda) {
    if (!aiAttivo() || !domanda) return;
    const lista = candidatiAI(domanda);
    const filtri = lista.length < S.cars.filter(c => !c.booked && c.st !== 4).length;
    if (!lista.length) return toast('Con i filtri attivi non resta nessuna auto disponibile da proporre', true);
    const base = { domanda, n: lista.length, filtri };
    mostraAI({ ...base, attesa: true });
    const ctl = new AbortController(), t0 = setTimeout(() => ctl.abort(), 60000);
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: AI_TOKEN, temperatura: 0, seed: 7, domanda, elenco: lista.map(rigaAI).join('\n') }), signal: ctl.signal });
      const j = await r.json();
      if (S.aiUltimo && S.aiUltimo.domanda === domanda) mostraAI({ ...base, ...j });
    } catch (e) {
      mostraAI({ ...base, errore: e.name === 'AbortError' ? "L'assistente non ha risposto in tempo. Riprova." : "Non riesco a raggiungere l'assistente. Controlla la connessione e riprova." });
    } finally { clearTimeout(t0); }
  }
  $('q').addEventListener('keydown', e => { if (e.key === 'Enter' && aiAttivo() && /\?\s*$/.test($('q').value)) { e.preventDefault(); chiediAI($('q').value.trim()); } });

  /* ---------- statistiche ---------- */
  const mediana = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
  const media = a => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const giorniFa = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const ggPren = c => (c.dataPren && c.ingr && c.dataPren >= c.ingr ? dayDiff(c.dataPren, c.ingr) : null);
  const ddmm = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);

  function niceStep(span, n) { const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; }

  // una sola serie: veicoli in stock giorno per giorno (asse non da zero: conta la variazione)
  function graficoLinea(giorni, larg) {
    const H = 200, ml = 44, mr = 56, mt = 14, mb = 28, W = Math.max(280, larg);
    const v = giorni.map(g => g.tot), lo0 = Math.min(...v), hi0 = Math.max(...v);
    const step = niceStep(Math.max(10, hi0 - lo0), 3), lo = Math.floor((lo0 - step / 2) / step) * step, hi = Math.ceil((hi0 + step / 2) / step) * step;
    const x = i => ml + (giorni.length === 1 ? (W - ml - mr) / 2 : i * (W - ml - mr) / (giorni.length - 1)), y = n => mt + (hi - n) * (H - mt - mb) / (hi - lo);
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Veicoli in stock giorno per giorno">`;
    for (let t = lo; t <= hi + 1e-9; t += step) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${ml - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${N(t)}</text>`;
    const etich = Math.max(1, Math.ceil(giorni.length / Math.floor((W - ml - mr) / 52)));
    giorni.forEach((g, i) => { if (i % etich === 0 || i === giorni.length - 1) s += `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">${ddmm(g.d)}</text>`; });
    s += `<path d="${giorni.map((g, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(g.tot).toFixed(1)).join(' ')}" class="ln s1"/>`;
    giorni.forEach((g, i) => { s += `<circle cx="${x(i)}" cy="${y(g.tot)}" r="${i === giorni.length - 1 ? 5 : 3.5}" class="dot s1"/>`; });
    const L = giorni.length - 1;
    s += `<text x="${x(L) + 10}" y="${y(giorni[L].tot) + 4}" class="lab">${N(giorni[L].tot)}</text>`;
    const colW = (W - ml - mr) / Math.max(1, giorni.length);
    giorni.forEach((g, i) => { s += `<rect x="${x(i) - colW / 2}" y="${mt}" width="${colW}" height="${H - mt - mb}" class="hit" data-tip="${dIt(g.d)}: ${N(g.tot)} veicoli · ${N(g.libere)} libere · ${N(g.prenotate)} prenotate"/>`; });
    return s + '</svg>';
  }

  // due serie affiancate per giorno: entrate e uscite (asse da zero, sono quantita')
  function graficoBarre(giorni, larg) {
    const H = 200, ml = 34, mr = 12, mt = 14, mb = 28, W = Math.max(280, larg);
    const g = giorni.filter(d => d.entrate != null);
    if (!g.length) return '<p class="hint">Servono almeno due stampe per contare entrate e uscite.</p>';
    const hi0 = Math.max(1, ...g.map(d => Math.max(d.entrate, d.uscite))), step = niceStep(hi0, 3), hi = Math.ceil(hi0 / step) * step;
    const y = n => mt + (hi - n) * (H - mt - mb) / hi, colW = (W - ml - mr) / g.length, bw = Math.min(22, (colW - 10) / 2);
    const barra = (x0, v, cls) => { const h = y(0) - y(v), r = Math.min(4, h, bw / 2); return v ? `<path class="bar ${cls}" d="M${x0} ${y(0)} V${y(v) + r} Q${x0} ${y(v)} ${x0 + r} ${y(v)} H${x0 + bw - r} Q${x0 + bw} ${y(v)} ${x0 + bw} ${y(v) + r} V${y(0)} Z"/>` : ''; };
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entrate e uscite per giorno">`;
    for (let t = 0; t <= hi + 1e-9; t += step) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${ml - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${N(t)}</text>`;
    const etich = Math.max(1, Math.ceil(g.length / Math.floor((W - ml - mr) / 52)));
    g.forEach((d, i) => {
      const cx = ml + colW * i + colW / 2;
      s += barra(cx - bw - 1, d.entrate, 's1') + barra(cx + 1, d.uscite, 's2');
      if (i % etich === 0 || i === g.length - 1) s += `<text x="${cx}" y="${H - 8}" class="ax" text-anchor="middle">${ddmm(d.d)}</text>`;
      s += `<rect x="${cx - colW / 2}" y="${mt}" width="${colW}" height="${H - mt - mb}" class="hit" data-tip="${dIt(d.d)}: ${N(d.entrate)} entrate · ${N(d.uscite)} uscite"/>`;
    });
    return s + '</svg>';
  }

  async function renderStats() {
    const el = $('stats');
    if (S.meta.demo) { el.innerHTML = '<div class="panel glass wide"><h3>Statistiche</h3><p class="hint">Le statistiche usano lo stock pubblicato ogni giorno: con i dati di esempio non ci sono.</p></div>'; return; }
    el.innerHTML = '<div class="panel glass wide"><p class="hint">Carico lo storico…</p></div>';
    const sto = await storico(), giorni = sto ? sto.giorni : [];
    const day = S.meta.day, d7 = giorniFa(day, 7), d14 = giorniFa(day, 14);
    const ult7 = giorni.filter(g => g.d > d7 && g.entrate != null);
    const entr7 = ult7.reduce((s, g) => s + g.entrate, 0), usc7 = ult7.reduce((s, g) => s + g.uscite, 0);
    const pren = S.cars.map(ggPren).filter(v => v != null), med = mediana(pren);
    const auto = sto ? Object.entries(sto.auto) : [];
    const ritocchi = [];
    for (const [t, a] of auto) a.p.forEach((p, k) => { if (k && a.p[k - 1][1] && p[1] && p[0] > d14) ritocchi.push({ t, a, d: p[0], da: a.p[k - 1][1], a_: p[1] }); });
    ritocchi.sort((x, y) => (x.d < y.d ? 1 : x.d > y.d ? -1 : (x.a_ - x.da) - (y.a_ - y.da)));
    const ribassi7 = ritocchi.filter(r => r.d > d7 && r.a_ < r.da).length;
    const uscite = auto.filter(([, a]) => a.out).map(([t, a]) => ({ t, a, gg: a.ingr ? dayDiff(a.a, a.ingr) : null })).sort((x, y) => (x.a.out < y.a.out ? 1 : x.a.out > y.a.out ? -1 : 0));
    const dal = sto && sto.dal ? ddmm(sto.dal) : '';

    // velocita' per modello
    const gruppi = new Map();
    for (const c of S.cars) { const k = c.brand + ' ' + c.family; if (!gruppi.has(k)) gruppi.set(k, { k, libere: [], pren: [], tot: 0, usc: 0 }); const g = gruppi.get(k); g.tot++; if (c.free && c.giorni != null) g.libere.push(c.giorni); const p = ggPren(c); if (p != null) g.pren.push(p); }
    for (const { a } of uscite) { const g = gruppi.get(a.n); if (g) g.usc++; }
    const righe = [...gruppi.values()].sort((a, b) => b.tot - a.tot).slice(0, 16);
    const maxMed = Math.max(1, ...righe.map(r => mediana(r.pren) || 0));

    const tile = (v, l) => `<div class="kpi glass"><span class="v num">${v}</span><span class="l">${l}</span></div>`;
    const auto1 = (t, nome, sotto) => { const inStock = S.cars.some(c => c.targa === t); return `<li${inStock ? ` data-open="${esc(t)}" class="cl"` : ''}><span><b>${esc(nome)}</b> <span class="mono">${esc(t)}</span></span><span>${sotto}</span></li>`; };
    // i grafici si disegnano alla larghezza reale del riquadro (meno il suo margine interno)
    const tutto = el.clientWidth || 360;
    const largMezzo = Math.max(280, (innerWidth > 980 ? Math.floor((tutto - 14) / 2) : tutto) - 38);

    el.innerHTML = `
      <div class="kpis wide">${tile(giorni.length > 1 ? N(entr7) : '—', 'Entrate negli ultimi 7 giorni')}${tile(giorni.length > 1 ? N(usc7) : '—', 'Uscite negli ultimi 7 giorni')}${tile(med != null ? med + '<small> gg</small>' : '—', 'Metà delle prenotate si è prenotata entro questi giorni dall’ingresso')}${tile(N(ribassi7), 'Prezzi ribassati negli ultimi 7 giorni')}</div>
      <div class="panel glass"><h3>Veicoli in stock</h3><p class="hint">Giorno per giorno, dalla stampa del ${dal}. Tocca un punto per i dettagli.</p><div class="chartbox">${giorni.length ? graficoLinea(giorni, largMezzo) : ''}</div></div>
      <div class="panel glass"><h3>Entrate e uscite</h3><div class="legend"><span><i class="s1"></i>Entrate</span><span><i class="s2"></i>Uscite</span></div><div class="chartbox">${graficoBarre(giorni, largMezzo)}</div></div>
      <div class="panel glass wide"><h3>Velocità per modello</h3><p class="hint">I 16 modelli con più auto in stock. “Si prenota entro” è il tempo in cui si è prenotata metà delle auto oggi prenotate, contato dalla data di ingresso.</p>
        <div class="tablewrap"><table class="vel"><thead><tr><th>Modello</th><th class="r">In stock</th><th class="r">Libere</th><th>Si prenota entro</th><th class="r">Giacenza media libere</th><th class="r">Uscite dal ${dal}</th></tr></thead><tbody>
        ${righe.map(r => { const m = mediana(r.pren); return `<tr><td><b>${esc(r.k)}</b></td><td class="r">${N(r.tot)}</td><td class="r">${N(r.libere.length)}</td><td><div class="hbar">${m != null ? `<i style="width:${Math.max(3, m / maxMed * 100)}%"></i><span>${m} gg <small>(${r.pren.length})</small></span>` : '<span class="muted">—</span>'}</div></td><td class="r">${r.libere.length ? media(r.libere) + ' gg' : '—'}</td><td class="r">${N(r.usc)}</td></tr>`; }).join('')}
        </tbody></table></div></div>
      <div class="panel glass"><h3>Ultime uscite dallo stock</h3><p class="hint">Auto che non compaiono più nella stampa, con i giorni passati in stock.</p><ul class="lst">${uscite.slice(0, 20).map(({ t, a, gg }) => auto1(t, a.n, `${dIt(a.out)}${gg != null ? ` · ${gg} gg in stock` : ''}`)).join('') || '<li class="muted">Ancora nessuna</li>'}</ul></div>
      <div class="panel glass"><h3>Prezzi ritoccati</h3><p class="hint">Ultimi 14 giorni. Tocca un'auto per aprirla.</p><ul class="lst">${ritocchi.slice(0, 20).map(r => auto1(r.t, r.a.n, `${ddmm(r.d)} · ${eur(r.da)} → <b>${eur(r.a_)}</b> <span class="${r.a_ < r.da ? 'down' : 'up'}">${r.a_ < r.da ? '−' : '+'}${eur(Math.abs(r.a_ - r.da))}</span>`)).join('') || '<li class="muted">Nessun ritocco</li>'}</ul></div>
      <div class="panel glass"><h3>Libere ferme da più tempo</h3><ul class="lst">${S.cars.filter(c => c.free && c.giorni != null).sort((a, b) => b.giorni - a.giorni).slice(0, 15).map(c => auto1(c.targa, c.brand + ' ' + c.family, `${c.giorni} gg · ${eur(c.prezzo) || 'senza prezzo'} · ${esc(c.ubic)}`)).join('')}</ul></div>
      <div class="panel glass"><h3>Annunci sul sito</h3>${S.meta.annunci ? `<p>${N(S.meta.annunci.abbinati)} auto dello stock hanno un annuncio su valentinoautomobili.it, su ${N(S.meta.annunci.totali)} annunci pubblicati.</p><ul class="lst"><li class="cl" data-preset-go="noWeb"><span>Libere senza annuncio sul sito</span><b>${N(countPreset('noWeb'))}</b></li><li class="cl" data-preset-go="priceDiff"><span>Prezzo sul sito diverso dal gestionale</span><b>${N(countPreset('priceDiff'))}</b></li></ul><p class="hint">Annunci letti il ${dIt(S.meta.annunci.aggiornato.slice(0, 10))} alle ${new Date(S.meta.annunci.aggiornato).toTimeString().slice(0, 5)}.</p>` : '<p class="hint">Annunci non ancora disponibili.</p>'}</div>`;
  }
  // tooltip dei grafici: col mouse segue il puntatore, col dito appare al tocco
  addEventListener('pointerover', e => { const t = e.target.closest && e.target.closest('[data-tip]'); const tip = $('tip'); if (!t) { tip.hidden = true; return; } tip.textContent = t.dataset.tip; tip.hidden = false; posTip(e); });
  addEventListener('pointermove', e => { if (!$('tip').hidden) posTip(e); });
  function posTip(e) { const tip = $('tip'), w = tip.offsetWidth; tip.style.left = Math.min(innerWidth - w - 8, Math.max(8, e.clientX - w / 2)) + 'px'; tip.style.top = (e.clientY - tip.offsetHeight - 14) + 'px'; }
  addEventListener('click', e => { const g = e.target.closest('[data-preset-go]'); if (g) { setTab('auto'); usePreset(g.dataset.presetGo); scrollTo({ top: 0, behavior: 'smooth' }); } });
  let rT; addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (!$('stats').hidden) renderStats(); }, 250); });

  /* ---------- caricamento PDF ---------- */
  // cartello salone: compila il modello giusto (sorgenti/cartello.js) e lo apre pronto da stampare; i campi restano modificabili
  const PDFLIBJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';
  // l'automazione parte solo qui, per l'auto aperta: il servizio Google legge l'annuncio e Gemini sceglie le dotazioni
  const righeCartello = {};
  async function chiediRigheCartello(c) {
    const w = c.web;
    if (!w || !w.url || !aiAttivo()) return null;
    if (righeCartello[c.targa]) return righeCartello[c.targa];
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 45000);
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctl.signal,
        body: JSON.stringify({ token: AI_TOKEN, azione: 'cartello', url: w.url, auto: `${c.brand} ${c.modello}`, telecamera: !!(w.cam && w.cam.esito === 'si'), tetto: !!(w.tetto && w.tetto.esito === 'si') }) });
      const j = await r.json();
      if (j.errore || !Array.isArray(j.righe)) return null;
      return (righeCartello[c.targa] = { nome: j.nome, righe: j.righe, cc: j.cc, euro: j.euro, offerta: j.offerta });
    } catch (e) { return null; } finally { clearTimeout(t); }
  }
  async function stampaCartello(c) {
    const b = $('dCartello');
    const finestra = window.open('', '_blank');   // aperta subito, cosi' il browser non la blocca
    if (b) { b.disabled = true; b.textContent = 'Scelgo le dotazioni…'; }
    try {
      const [scelte] = await Promise.all([chiediRigheCartello(c), window.PDFLib ? null : loadScript(PDFLIBJS)]);
      if (b) b.textContent = 'Preparo il cartello…';
      const dati = datiCartello(c, scelte);
      const modello = await (await fetch('cartelli/' + dati.file)).arrayBuffer();
      const pdf = await compilaCartello(window.PDFLib, modello, dati);
      const url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
      if (finestra) finestra.location.href = url;
      const a = document.createElement('a'); a.href = url; a.download = dati.nomeFile; if (!finestra) a.click();
      const manca = scelte ? '' : ' (dotazioni da scrivere a mano: l\u2019assistente non ha risposto)';
      toast(`Cartello ${dati.vw ? 'Usato Certificato' : 'Usato Selezionato'}${dati.ps ? ' prezzo speciale' : ''} pronto${manca}`);
    } catch (e) { if (finestra) finestra.close(); toast('Cartello non creato: controlla la connessione e riprova', true); }
    if (b) { b.disabled = false; b.textContent = 'Cartello salone'; }
  }
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
      try { doc = await window.pdfjsLib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false }).promise; }
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
  $('q').addEventListener('input', () => { $('qClear').hidden = !$('q').value; clearTimeout(qT); qT = setTimeout(() => { S.Q = capisci($('q').value); apply(); }, 120); });
  $('qClear').onclick = () => { $('q').value = ''; $('qClear').hidden = true; S.Q = parseQuery('', S.vocab); apply(); $('q').focus(); };
  $('sort').onchange = () => { S.col = null; apply(); };
  const setView = v => { S.view = v; $('vCards').setAttribute('aria-pressed', String(v === 'cards')); $('vTable').setAttribute('aria-pressed', String(v === 'table')); try { localStorage.setItem('su.view', v); } catch (e) {} renderList(); };
  $('vCards').onclick = () => setView('cards'); $('vTable').onclick = () => setView('table');
  $('btnFilters').onclick = () => { $('filters').classList.add('on'); $('scrim').classList.add('on'); document.documentElement.classList.add('locked'); sheetOpened(); };
  $('scrim').onclick = closeAll;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('q').focus(); } });
  async function scaricaExcel() {
    try {
      if (!window.XLSX) await loadScript(XLSXJS);
      const righe = S.list.map(c => ({ Stato: stLabel(c), Targa: c.targa, Marca: c.brand, Modello: c.family, Allestimento: c.modello, Immatricolazione: immIt(c), Km: c.km, CV: c.cv || null, Alimentazione: c.fuel, Cambio: c.cambio, Colore: c.colore, 'Prezzo totale': c.prezzo || null, 'Prezzo veicolo': c.prezzoV || null, Ubicazione: c.ubic, 'Data ingresso': dIt(c.ingr), 'Giorni in stock': c.giorni, AutoScout: c.as ? 'Sì' : 'No', 'Annuncio sito': c.web ? c.web.url : '', Acquirente: acqV(c), Venditore: c.vend, Note: c.note }));
      // prezzo del sito e in cosa differisce dal gestionale (non per il cliente)
      S.list.forEach((c, i) => { const d = sitoDiverso(c), r = righe[i], ord = {};
        for (const [k, v] of Object.entries(r)) { ord[k] = v; if (k === 'Prezzo veicolo') Object.assign(ord, { 'Prezzo sul sito': (c.web && c.web.prezzo) || null, 'Differenza sito - gestionale': d ? d.diff : null, 'Differenza con il sito': d ? d.testo : '' }); }
        righe[i] = ord; });
      if (S.cliente) righe.forEach(r => { delete r['Prezzo sul sito']; delete r['Differenza sito - gestionale']; delete r['Differenza con il sito']; });
      if (!ggVisibili()) righe.forEach(r => { delete r['Data ingresso']; delete r['Giorni in stock']; });
      const ws = XLSX.utils.json_to_sheet(righe), wb = XLSX.utils.book_new();
      ws['!cols'] = Object.keys(righe[0] || {}).map(k => ({ wch: Math.min(40, Math.max(k.length + 2, ...righe.slice(0, 200).map(r => String(r[k] ?? '').length))) }));
      XLSX.utils.book_append_sheet(wb, ws, 'Stock');
      XLSX.writeFile(wb, `stock-usato-${S.meta.day || 'oggi'}.xlsx`);
      toast(`Excel con ${N(righe.length)} veicoli scaricato`);
    } catch (e) { toast('Excel non creato: controlla la connessione e riprova', true); }
  }
  if (!inFrame) { $('btnExcel').hidden = false; $('btnCopy').hidden = true; }
  $('btnExcel').onclick = scaricaExcel;
  let promptInstall = null;
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); promptInstall = e; $('btnInstall').hidden = false; });
  $('btnInstall').onclick = async () => { if (!promptInstall) return; promptInstall.prompt(); try { await promptInstall.userChoice; } catch (e) {} promptInstall = null; $('btnInstall').hidden = true; };
  function setTab(t) {
    if (S.cliente && t === 'stat') t = 'auto';
    const stat = t === 'stat', perm = t === 'perm';
    document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === t)));
    $('layout').hidden = stat || perm; $('stats').hidden = !stat; $('permute').hidden = !perm;
    if (perm && !$('permute').firstChild) montaValutatore($('permute'), { url: AI_URL, token: AI_TOKEN });
    if (stat) renderStats();
    try { history.replaceState(history.state, '', stat ? '#statistiche' : location.pathname + location.search); } catch (e) {}
  }
  let linkFatto = false;
  function apriDaLink() {
    if (linkFatto || S.meta.demo) return;
    linkFatto = true;
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === 'statistiche') return setTab('stat');
    if (h) { const c = S.cars.find(x => x.targa === h.toUpperCase()); if (c) openDrawer(c); }
  }
  // link incollato nella stessa scheda del browser: stessa logica dell'apertura
  addEventListener('hashchange', () => { linkFatto = false; apriDaLink(); });
  $('btnCopy').onclick = () => {
    const head = ['Stato', 'Targa', 'Marca', 'Modello', 'Allestimento', 'Immatricolazione', 'Km', 'CV', 'Alimentazione', 'Cambio', 'Colore', 'Prezzo', 'Ubicazione', 'Ingresso', 'Giorni in stock', 'AutoScout', 'Acquirente', 'Venditore', 'Note'];
    const rows = S.list.map(c => [c.free ? 'Libera' : c.booked && c.st < 2 ? 'Prenotata' : c.stato, c.targa, c.brand, c.family, c.modello, immIt(c), c.km, c.cv || '', c.fuel, c.cambio, c.colore, c.prezzo || '', c.ubic, dIt(c.ingr), c.giorni ?? '', c.as ? 'Sì' : 'No', acqV(c), c.vend, c.note].join('\t'));
    const via = ggVisibili() ? [] : [head.indexOf('Ingresso'), head.indexOf('Giorni in stock')];
    const tieni = r => r.filter((x, i) => !via.includes(i));
    copy([tieni(head).join('\t'), ...rows.map(r => tieni(r.split('\t')).join('\t'))].join('\n'), `${N(S.list.length)} veicoli copiati: incollali in Excel`);
  };

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-stella],#askAI,[data-tab],[data-open],th[data-col],[data-preset],[data-delta],[data-f],[data-more],[data-q],[data-rm],[data-seg] button,.card,tbody tr,#fReset,#fClose,#fClose2');
    if (!t) return;
    if (t.dataset.stella) { e.preventDefault(); e.stopPropagation(); return stella(t.dataset.stella); }
    if (t.dataset.tab) return setTab(t.dataset.tab);
    if (t.dataset.open) { const c = S.cars.find(x => x.targa === t.dataset.open); if (c) openDrawer(c, !!t.closest('#drawer .ai')); return; }
    if (t.id === 'askAI') return chiediAI($('q').value.trim());
    if (t.dataset.col != null) { const i = +t.dataset.col; S.col = S.col && S.col.i === i ? { i, dir: -S.col.dir } : { i, dir: 1 }; $('sort').value = 'col'; return apply(); }
    if (t.id === 'fClose' || t.id === 'fClose2') return closeAll();
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

  /* ---------- modalita' cliente ---------- */
  // in modalita' cliente sparisce solo "Piu' vecchie in stock"; "Ultimi ingressi" resta: ordina senza mostrare i giorni
  const ORD_GG = [...$('sort').options].filter(o => o.value === 'old');
  function setCliente(on) {
    S.cliente = !!on;
    document.documentElement.classList.toggle('cliente', S.cliente);
    $('btnCliente').setAttribute('aria-pressed', String(S.cliente));
    $('btnCliente').title = S.cliente ? 'Modalità cliente attiva: tocca per tornare a vedere tutto' : 'Modalità cliente: nasconde da quanto tempo le auto sono in stock';
    if (S.cliente) {
      ORD_GG.forEach(o => o.remove());
      if (!['cons', 'ingr', 'pa', 'pd', 'km', 'anno', 'cv', 'col'].includes($('sort').value)) $('sort').value = 'cons';
      delete F.r.giorni;
      if (activePreset === 'old') activePreset = 'all';
      if (!$('stats').hidden) setTab('auto');
    } else if (!ORD_GG[0].parentNode) ORD_GG.forEach((o, i) => $('sort').options.add(o, 2 + i));
    if (S.Q && S.Q.r && S.Q.r.giorni) S.Q = capisci($('q').value.trim());
    if (S.cars.length) { renderKpis(); renderFilters(true); apply(); }
    if (S.aperta && $('drawer').classList.contains('on')) { const c = S.cars.find(x => x.targa === S.aperta); if (c) openDrawer(c); }
  }
  $('btnCliente').onclick = () => { setCliente(!S.cliente); toast(S.cliente ? 'Modalità cliente: anzianità in stock nascosta' : 'Modalità venditore: vedi di nuovo tutto'); };

  $('listaBar').onclick = () => apriLista(false);

  /* ---------- avvio ---------- */
  // si parte sempre in modalita' cliente: solo i link delle mail interne (?vista=venditore) aprono la vista completa.
  // Spenta col tasto Cliente, resta spenta finche' la pagina e' aperta.
  try {
    const qs = new URLSearchParams(location.search), venditore = qs.get('vista') === 'venditore';
    if (qs.has('vista')) { qs.delete('vista'); history.replaceState(history.state, '', location.pathname + (qs.toString() ? '?' + qs : '') + location.hash); }
    setCliente(!venditore);
  } catch (e) { setCliente(true); }
  try {
    const mk = location.hash.match(/^#chiave=([\w-]{12,})$/);
    if (mk) { localStorage.setItem('su.chiaveCodici', mk[1]); history.replaceState(null, '', location.pathname + location.search); setTimeout(() => toast('Da questo telefono puoi scegliere i codici modello'), 900); }
  } catch (e) {}
  try {
    const mc = location.hash.match(/^#clienti=([\w-]{40,})$/);
    if (mc) { localStorage.setItem('su.chiaveClienti', mc[1]); history.replaceState(null, '', location.pathname + location.search); setTimeout(() => toast('Da questo dispositivo vedi i nomi dei clienti (non in modalità cliente)'), 900); }
  } catch (e) {}
  const chiaveClienti = () => { try { return localStorage.getItem('su.chiaveClienti'); } catch (e) { return null; } };
  try { const v = localStorage.getItem('su.view'); if (v === 'table') { S.view = 'table'; $('vCards').setAttribute('aria-pressed', 'false'); $('vTable').setAttribute('aria-pressed', 'true'); } } catch (e) {}
  try { const q0 = new URLSearchParams(location.search).get('q'); if (q0) { $('q').value = q0; $('qClear').hidden = false; } } catch (e) {}
  const cur = store.get('su.cur');
  if (cur && cur.cars && cur.cars.length) setData(cur, store.get('su.prev')); else setData(demoData(), null);
  // stock condiviso: pubblicato ogni mattina accanto alla pagina, vince se e' piu' recente di quello caricato a mano
  (async () => {
    try {
      const get = async f => { const r = await fetch(f + '?t=' + Date.now(), { cache: 'no-store' }); return r.ok ? r.json() : null; };
      const shared = await get('data/stock.json');
      if (!shared || !shared.cars || !shared.cars.length) return;
      if (S.meta.printDate && !S.meta.demo && S.meta.printDate > shared.meta.printDate) return;
      let prev = null;
      try { prev = await get('data/prev.json'); } catch (e) {}
      const k = chiaveClienti(), sub = window.crypto && crypto.subtle;
      await decifraClienti(shared, k, sub); if (prev) await decifraClienti(prev, k, sub);
      setData(shared, prev);
    } catch (e) { /* nessuno stock condiviso qui: restano i dati locali */ }
  })();

  // PC: Ctrl+K (Cmd+K sul Mac) porta nella ricerca da qualsiasi punto, come nelle app professionali
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); const q = $('q'); q.focus(); q.select(); }
  });

  // telefono: scorrendo in giu' l'intestazione diventa compatta (solo la ricerca, sotto la barra di stato), scorrendo in su torna intera.
  // Vicino all'inizio, risalendo, resta compatta fino in cima: cosi' l'intestazione intera non copre la riga dei numeri.
  (() => {
    const top = document.querySelector('.top'), mq = matchMedia('(max-width:980px)');
    const misura = () => top.style.setProperty('--nascondi', Math.max(0, top.querySelector('.search').offsetTop - 8) + 'px');
    const stato = compatta => top.classList.toggle('compatta', compatta);
    let ultimoY = scrollY;
    const aggiorna = () => {
      if (!mq.matches) { stato(false); return; }
      const k = $('kpis'), y = scrollY, fineNumeri = k && k.offsetParent ? k.offsetTop + k.offsetHeight : top.offsetHeight;   // non cambia scorrendo
      if (y <= 4) stato(false);
      else if (y > ultimoY + 6) { misura(); stato(true); }
      else if (y < ultimoY - 6) stato(y <= fineNumeri);   // risalendo: intera nella lista, compatta sopra la riga dei numeri (la lascia vedere), intera in cima
      else return;
      ultimoY = y;
    };
    addEventListener('scroll', aggiorna, { passive: true });
    addEventListener('resize', () => { misura(); aggiorna(); });
    misura(); aggiorna();
  })();
})();
