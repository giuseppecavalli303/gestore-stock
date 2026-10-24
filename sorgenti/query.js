/* Ricerca in linguaggio naturale: "golf diesel automatica sotto 25000 libera a tiburtina" */
const STOP = new Set('e ed con di da il lo la le i gli un una uno auto macchina macchine vettura vetture veicolo veicoli cerco voglio vorrei mostrami mostra trova dammi tutte tutti che in a al alla su per del della dei delle colore cambio anno prezzo ferma ferme fermo fermi stock giacenza o ho mi serve cliente budget circa'.split(' '));
const deacc = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const fmtN = n => n.toLocaleString('it-IT', { useGrouping: 'always' });

function buildVocab(cars) {
  const v = [];
  const add = (key, kind, val) => { key = deacc(key.toLowerCase()).trim(); if (key.length > 1) v.push({ key, kind, val }); };
  const uniq = k => [...new Set(cars.map(c => c[k]).filter(Boolean))];
  for (const b of uniq('brand')) { add(b, 'brand', b); }
  add('vw', 'brand', 'Volkswagen'); add('mercedes benz', 'brand', 'Mercedes'); add('citroen', 'brand', 'Citroën');
  for (const f of uniq('family')) {
    add(f, 'family', f);
    const sp = f.replace(/[^A-Za-z0-9]+/g, ' ').trim(), tight = f.replace(/[^A-Za-z0-9]+/g, '');
    add(sp, 'family', f); if (tight.length > 2 || /^(up)$/i.test(tight)) add(tight, 'family', f);
  }
  for (const u of uniq('ubic')) add(u, 'ubic', u);
  for (const u of uniq('ubic')) for (const w of u.split(' ')) if (w.length > 4 && !/^\d+$/.test(w)) add(w, 'ubic', w);
  for (const s of uniq('vend')) { add(s, 'vend', s); const p = s.split(' '); if (p.length > 1) add(p[p.length - 1], 'vend', s); }
  // le chiavi piu' lunghe vincono
  const seen = new Set();
  return v.sort((a, b) => b.key.length - a.key.length).filter(e => { const k = e.key + '|' + e.kind + '|' + e.val; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Km 0: la stampa le mette in sezioni apposite (VW KM0, REMARKETING EUROPA-500 KM0...); il sito le segna come KM0
const km0 = c => /KM\s?0\b|KM\s?ZERO/i.test(c.section || '') || !!(c.web && c.web.km0);

function parseQuery(raw, vocab) {
  const Q = { r: {}, st: new Set(), fuel: new Set(), cambio: new Set(), color: new Set(), brand: new Set(), family: new Set(), vend: new Set(), ubic: [], terms: [], chips: [] };
  let t = ' ' + deacc((raw || '').toLowerCase()).replace(/[€]/g, ' euro ').replace(/[,;:]+/g, ' ') + ' ';
  if (!t.trim()) return Q;
  t = t.replace(/(\d{1,3})\.(\d{3})\b/g, '$1$2').replace(/(\d+)\s*(?:k|mila)\b/g, (m, a) => String(+a * 1000));
  const setR = (k, lo, hi) => { const cur = Q.r[k] || [null, null]; if (lo != null) cur[0] = lo; if (hi != null) cur[1] = hi; Q.r[k] = cur; };
  const unitKey = (u, n, ctx) => {
    if (u) { if (/^(km|chilometri)/.test(u)) return 'km'; if (/^(euro|eur)/.test(u)) return 'prezzo'; if (/^(cv|cavalli|hp)/.test(u)) return 'cv'; if (/^kw/.test(u)) return 'kw'; if (/^(giorni|gg)/.test(u)) return 'giorni'; }
    if (n >= 1990 && n <= 2035) return 'anno';
    if (n >= 1000) return 'prezzo';
    if (/giorn|ferm|giacenz|anzianit|stock/.test(ctx)) return 'giorni';
    return n >= 40 ? 'cv' : null;
  };
  const U = '(km|chilometri|euro|eur|cv|cavalli|hp|kw|giorni|gg)?';
  const take = (re, fn) => { t = t.replace(re, (...a) => (fn(...a) === false ? a[0] : ' ')); };
  const put = (k, lo, hi) => { if (k === 'kw') { k = 'cv'; if (lo != null) lo = Math.round(lo * 1.36); if (hi != null) hi = Math.round(hi * 1.36); } setR(k, lo, hi); };
  const ctx = t;
  take(/\bkm ?0\b|\bkm ?zero\b|\bchilometri zero\b|\b0 ?km\b/g, () => { Q.km0 = true; });   // prima dei numeri: "km 0" non e' un limite di km
  take(new RegExp(`\\b(?:tra|fra)\\s+(?:i|gli|le)?\\s*(\\d+)\\s*${U}\\s*(?:e|ed)\\s+(?:i|gli|le)?\\s*(\\d+)\\s*${U}`, 'g'), (m, a, u1, b, u2) => { const k = unitKey(u2 || u1, +b, ctx); if (!k) return false; put(k, Math.min(+a, +b), Math.max(+a, +b)); });
  take(new RegExp(`(?:\\b(?:sotto|meno di|max|massimo|fino a|fino al|entro|non oltre|al massimo|prima del)|<=?)\\s*(?:i|gli|le|il|a)?\\s*(\\d+)\\s*${U}`, 'g'), (m, n, u) => { const k = unitKey(u, +n, ctx); if (!k) return false; put(k, null, /prima del/.test(m) ? +n - 1 : +n); });
  take(new RegExp(`(?:\\b(?:sopra|oltre|piu di|almeno|min|minimo|da almeno|a partire da|dal|dopo il|da piu di)|>=?)\\s*(?:i|gli|le|il|a)?\\s*(\\d+)\\s*${U}`, 'g'), (m, n, u) => { const k = unitKey(u, +n, ctx); if (!k) return false; put(k, +n, null); });
  take(/\b(\d+)\s*\+?\s*(giorni|gg)\b/g, (m, n) => { put('giorni', +n, null); });
  take(/\b(\d+)\s*(cv|cavalli|hp)\b/g, (m, n) => { put('cv', +n - 2, +n + 2); });
  take(/\b(\d+)\s*(km|chilometri)\b/g, (m, n) => { put('km', null, +n); });
  take(/\b(\d+)\s*(euro|eur)\b/g, (m, n) => { put('prezzo', null, +n); });
  take(/\b(19\d\d|20[0-3]\d)\b/g, (m, n) => { put('anno', +n, +n); });
  // una cifra da sola tra 3.000 e 300.000 e' un budget: "cliente con 18 mila"
  take(/\b(\d{4,6})\b/g, (m, n) => { n = +n; if (n < 3000 || n > 300000) return false; put('prezzo', null, n); });

  const kw = (re, fn) => { if (re.test(t)) { t = t.replace(re, ' '); fn(); } };
  kw(/\bnon (?:e |sono )?su autoscout|\bsenza autoscout|\bno autoscout|\bnon pubblicat\w*/g, () => { Q.as = false; });
  kw(/\b(?:su )?autoscout\b|\bpubblicat\w*/g, () => { Q.as = true; });
  kw(/\bsenza prezzo\b/g, () => { Q.hasPrice = false; });
  kw(/\bcon prezzo\b/g, () => { Q.hasPrice = true; });
  kw(/\biva esposta\b|\biva esp\b/g, () => { Q.iva = true; });
  kw(/\bprezzo speciale\b/g, () => { Q.spec = true; });
  kw(/\bcheck ?list\b/g, () => { Q.check = true; });
  kw(/\bneopatentat\w*/g, () => { Q.neo = true; });
  kw(/\b(tele|retro)camera\b|\bcamera posteriore\b|\bcamera (di|per la) retromarcia\b/g, () => { Q.cam = true; });
  kw(/\btett(?:o|uccio) apribile\b|\btettuccio\b|\bsunroof\b|\btetto (?:elettrico|scorrevole|panoramico|panorama|in vetro|in cristallo|vetrato)\b|\bpanoramic roof\b/g, () => { Q.tetto = true; });
  kw(/\b4x4\b|\b4 ?x ?4\b|\btrazione integrale\b|\bintegrale\b|\b4 ?motion\b|\bawd\b|\b4wd\b|\bquattro ruote motrici\b/g, () => { Q.awd = true; });
  kw(/\bcon foto\b|\bsul sito\b/g, () => { Q.web = true; });
  kw(/\bsenza foto\b|\bnon sul sito\b|\bsenza annuncio\b/g, () => { Q.web = false; });
  kw(/\bnon in vendita\b/g, () => Q.st.add(4));
  kw(/\bin vendita\b/g, () => Q.st.add(0));
  kw(/\bin arrivo\b|\bviaggiant\w*|\barriv[oi]\b/g, () => Q.st.add(7));
  kw(/\b(?:in )?riparazione\b|\bin officina\b/g, () => Q.st.add(6));
  kw(/\btargat[aeo]\b/g, () => Q.st.add(9));
  kw(/\bliber[aeio]\b|\bdisponibil\w*/g, () => { Q.disp = 'free'; });
  kw(/\bprenotat\w*/g, () => { Q.disp = 'booked'; });
  kw(/\bplug ?-?in\b|\bphev\b/g, () => Q.fuel.add('Plug-in'));
  kw(/\bdiesel\b|\bgasolio\b|\btdi\b/g, () => Q.fuel.add('Diesel'));
  kw(/\bbenzina\b/g, () => Q.fuel.add('Benzina'));
  kw(/\bmetano\b/g, () => Q.fuel.add('Metano'));
  kw(/\bgpl\b/g, () => Q.fuel.add('GPL'));
  kw(/\belettric\w*\b/g, () => Q.fuel.add('Elettrica'));
  kw(/\bibrid\w*\b|\bhybrid\b/g, () => { Q.fuel.add('Ibrida'); Q.fuel.add('Plug-in'); });
  kw(/\bautomatic\w*\b|\bdsg\b/g, () => Q.cambio.add('Automatico'));
  kw(/\bmanual[ei]\b/g, () => Q.cambio.add('Manuale'));
  const cols = [['Bianco', /\bbianc\w+/g], ['Nero', /\bner[aoei]\b/g], ['Grigio', /\bgrigi\w*/g], ['Argento', /\bargento\b|\bsilver\b/g], ['Blu', /\bblu\b|\bazzurr\w+/g], ['Rosso', /\bross[aoei]\b/g], ['Verde', /\bverd[ei]\b/g], ['Giallo', /\bgiall\w+/g], ['Arancione', /\baranc\w+/g], ['Beige', /\bbeige\b/g]];
  for (const [name, re] of cols) kw(re, () => Q.color.add(name));

  for (const e of vocab) {
    const re = new RegExp('(^|[^a-z0-9])' + e.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])', 'g');
    if (!re.test(t)) continue;
    // "up" e simili: applico tutte le voci che condividono la stessa chiave
    const same = vocab.filter(o => o.key === e.key);
    t = t.replace(re, '$1 ');
    for (const o of same) {
      if (o.kind === 'ubic') Q.ubic.push(o.val.toLowerCase());
      else Q[o.kind].add(o.val);
    }
  }
  Q.terms = t.split(/\s+/).filter(w => w && !STOP.has(w) && /[a-z0-9]/.test(w));

  // etichette leggibili di cio' che e' stato capito
  const L = { prezzo: ['€', n => fmtN(n) + ' €'], km: ['km', n => fmtN(n) + ' km'], anno: ['anno', n => String(n)], cv: ['CV', n => n + ' CV'], giorni: ['giorni', n => n + ' gg in stock'] };
  for (const k in Q.r) { const [lo, hi] = Q.r[k], f = L[k][1]; Q.chips.push(lo != null && hi != null ? (lo === hi ? f(lo) : (k === 'cv' && hi - lo === 4 ? f(lo + 2) : `${f(lo).replace(/ \D+$/, '')} – ${f(hi)}`)) : lo != null ? `da ${f(lo)}` : `fino a ${f(hi)}`); }
  if (Q.disp) Q.chips.push(Q.disp === 'free' ? 'Libere' : 'Prenotate');
  for (const s of Q.st) Q.chips.push(STATI[s]);
  for (const k of ['brand', 'family', 'fuel', 'cambio', 'color', 'vend']) for (const v of Q[k]) Q.chips.push(v);
  if (Q.ubic.length) Q.chips.push('Ubicazione: ' + [...new Set(Q.ubic)].join(', '));
  if (Q.as != null) Q.chips.push(Q.as ? 'Su AutoScout' : 'Non su AutoScout');
  if (Q.hasPrice != null) Q.chips.push(Q.hasPrice ? 'Con prezzo' : 'Senza prezzo');
  if (Q.iva) Q.chips.push('IVA esposta');
  if (Q.spec) Q.chips.push('Prezzo speciale');
  if (Q.check) Q.chips.push('Check list fatta');
  if (Q.neo) Q.chips.push('Per neopatentati');
  if (Q.km0) Q.chips.push('Km 0');
  if (Q.awd) Q.chips.push('Trazione integrale (4x4)');
  if (Q.cam) Q.chips.push('Telecamera confermata');
  if (Q.tetto) Q.chips.push('Tetto apribile confermato');
  if (Q.web != null) Q.chips.push(Q.web ? 'Con annuncio sul sito' : 'Senza annuncio sul sito');
  for (const w of Q.terms) Q.chips.push('“' + w + '”');
  return Q;
}

function matchQuery(c, Q) {
  for (const k in Q.r) {
    const [lo, hi] = Q.r[k], v = c[k];
    if (v == null || (!v && k !== 'giorni' && k !== 'km')) return false;
    if (lo != null && v < lo) return false;
    if (hi != null && v > hi) return false;
  }
  if (Q.disp === 'free' && !c.free) return false;
  if (Q.disp === 'booked' && !c.booked) return false;
  if (Q.st.size && !Q.st.has(c.st)) return false;
  if (Q.fuel.size && !Q.fuel.has(c.fuel)) return false;
  if (Q.cambio.size && !Q.cambio.has(c.cambio)) return false;
  if (Q.color.size && !Q.color.has(c.colorG)) return false;
  if (Q.brand.size && !Q.brand.has(c.brand) && !(Q.family.size && Q.family.has(c.family))) return false;
  if (Q.family.size && !Q.family.has(c.family)) return false;
  if (Q.vend.size && !Q.vend.has(c.vend)) return false;
  if (Q.ubic.length) { const u = c.ubic.toLowerCase(); if (!Q.ubic.some(x => u.includes(x))) return false; }
  if (Q.as != null && c.as !== Q.as) return false;
  if (Q.hasPrice != null && (c.prezzo > 0) !== Q.hasPrice) return false;
  if (Q.iva && !c.iva) return false;
  if (Q.spec && !c.spec) return false;
  if (Q.check && !c.check) return false;
  if (Q.neo && !(c.web && c.web.neopatentati)) return false;
  if (Q.km0 && !km0(c)) return false;
  if (Q.awd && c.trazione !== 'Integrale') return false;
  if (Q.cam && !(c.web && c.web.cam && c.web.cam.esito === 'si')) return false;
  if (Q.tetto && !(c.web && c.web.tetto && c.web.tetto.esito === 'si')) return false;
  if (Q.web != null && !!c.web !== Q.web) return false;
  for (const w of Q.terms) if (!c._h.includes(w)) return false;
  return true;
}
