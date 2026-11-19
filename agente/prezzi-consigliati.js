// Prezzi consigliati per le auto libere senza prezzo: per ognuna acquisto e carrozzeria (da CROSS), le auto simili
// vendute da noi negli ultimi mesi (dalle stampe dello stock) e un prezzo consigliato. PDF riservato, mai sul sito.
// Uso: node agente/prezzi-consigliati.js -> agente/rapporti/Prezzi consigliati GG-MM-AAAA.pdf (prima pagina: grafico
//      delle piu' urgenti, cioe' pronte e in casa da piu' di 45 giorni; poi la tabella divisa in tre gruppi)
//      e "Prezzi consigliati - vendute simili GG-MM-AAAA.pdf" (le vendite usate per ogni calcolo)
//
// Come si calcola il prezzo consigliato:
//  1. auto simili vendute: stessa marca, modello e alimentazione; poi, se ce ne sono almeno 3, stesso allestimento,
//     stessa potenza (+-12%) e stesso cambio, vendute negli ultimi 12 mesi; se non bastano si allarga per gradi
//     (24 mesi, poi allestimento diverso, poi solo modello). Escluse le cessioni a commercianti (vendite-escluse.json).
//  2. prezzo di vendita = prezzo veicolo il giorno della prenotazione (lo sconto finale non e' nelle stampe). La stampa
//     ha il totale con il passaggio: il prezzo veicolo, che finisce sempre in 450 o 950, si ricava togliendo il passaggio.
//  3. ogni prezzo viene adeguato all'anno e ai km dell'auto da prezzare, con quanto pesano anno e km nelle nostre
//     vendite degli ultimi 2 anni (calcolato modello per modello, se ci sono abbastanza vendite, altrimenti su tutto).
//  4. consigliato = PRIMO prezzo dato alle simili al loro arrivo (cosi' prezza chi mette i prezzi, e lascia il margine
//     di trattativa), adeguato, mediana delle 8 simili piu' vicine (per anno, km, data di vendita e prezzo speciale), arrotondata
//     al prezzo veicolo che finisce in 450 o 950, come li mette chi prezza.
//  5. incasso atteso = consigliato x mediana di (prezzo vero CROSS / primo prezzo) delle stesse simili; la differenza
//     tra consigliato e incasso e' il margine di trattativa.
const fs = require('fs'), path = require('path');
const { stampaPdf } = require('./stampa-pdf');
const { esclusa } = require('./storico-lungo');
const root = path.join(__dirname, '..');
const leggi = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const s = leggi(path.join(root, 'data', 'stock.json')), OGGI = s.meta.day;
const L = leggi(path.join(__dirname, 'storico-lungo-cache.json')).auto;
const A = (() => { try { return leggi(path.join(__dirname, 'analisi-prezzi-cache.json')).auto; } catch (e) { return {}; } })();
const letti = new Map(leggi(path.join(__dirname, 'cross-ingresso.json')).map(x => [x.targa, x]));
const dIt = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`, mIt = iso => iso ? `${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const N = n => Math.round(n || 0).toLocaleString('it-IT', { useGrouping: 'always' }), E = n => N(n) + ' €';
const med = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };
const mesi = (a, b) => (Date.parse(a.slice(0, 7) + '-15') - Date.parse(b.slice(0, 7) + '-15')) / (30.44 * 864e5);
const { kwDa, creaVeicolo } = require('./prezzo-veicolo');
// allestimento principale (uno solo) e "plus" come dettaglio: "R-LINE PLUS" resta un R-Line
const TRIM = ['GTI', 'GTD', 'RLINE', 'SLINE', 'HIGHLINE', 'STYLE', 'SPORT', 'ADVANCED', 'ELEGANCE', 'EXECUTIVE', 'DESIGN', 'ADMIRAL', 'GOLD', 'UNITED', 'COMFORTLINE', 'LIFE', 'BUSINESS', 'URBAN', 'MOVE', 'TRENDLINE', 'EDITION'];
const parole = m => ' ' + String(m).toUpperCase().replace(/R\s*-\s*LINE/g, 'RLINE').replace(/S\s+LINE/g, 'SLINE').replace(/[^A-Z0-9]+/g, ' ') + ' ';
const trim = m => { const x = parole(m); return TRIM.find(t => x.includes(' ' + t + ' ')) || ''; };
const plus = m => parole(m).includes(' PLUS ');
const cambio = c => (c === 'Automatico' || c === 'Manuale') ? c : '';

// passaggio tipico per potenza (dalle auto prezzate oggi) e prezzo veicolo dal totale in stampa
const { veicolo, passaggio } = creaVeicolo(s.cars);

// prezzo di vendita vero (PV-lordo) dalle pratiche concluse di CROSS: lista pratiche VU (F8), stato "Concluso",
// colonne Targa, PV-lordo e Data consegna, esportata in agente/cross-vendute.txt (escluso dal repo)
const PV = new Map();
try {
  const righe = fs.readFileSync(path.join(__dirname, 'cross-vendute.txt'), 'latin1').split(/\r?\n/).filter(Boolean), h = righe[0].split(';');
  const iT = h.indexOf('Targa'), iP = h.indexOf('PV-lordo'), num = x => +String(x || '').replace(/\./g, '').replace(',', '.') || 0;
  righe.slice(1).forEach(r => { const c = r.split(';'), v = num(c[iP]); if (c[iT] && v > 0) PV.set(c[iT].trim(), v); });
} catch (e) { /* senza export CROSS si usano solo i prezzi esposti */ }

// vendite degli ultimi 2 anni (prenotazioni rimaste tali, senza cessioni escluse), con il prezzo veicolo
const da2 = new Date(Date.parse(OGGI) - 730 * 864e5).toISOString().slice(0, 10);
const V = Object.entries(L).filter(([, a]) => a.pren && a.pp > 0 && a.imm && a.pren >= da2 && !esclusa(a)).map(([t, a]) => {
  const kw = kwDa(a.m), pp = veicolo(a.pp, kw), pv = PV.get(t), primo = a.p[0] || [a.pren, a.pp];
  return { t, b: a.b, f: a.f, fu: a.fu, ca: cambio(a.ca), m: a.m, imm: a.imm, km: a.km || 0, kw, tr: trim(a.m), pl: plus(a.m),
    pren: a.pren, pp, pv: pv && pv / pp >= 0.7 && pv / pp <= 1.1 ? pv : null,      // fuori da questa forbice e' un errore di registrazione
    p0: veicolo(primo[1], kw), eta0: mesi(primo[0], a.imm) / 12,                    // il primo prezzo dato all'arrivo
    eta: mesi(a.pren, a.imm) / 12, d0: primo[0], spec: !!(A[t] && A[t].spec) };
}).filter(v => v.eta >= 0 && v.pp > 0 && v.p0 > 0);
const rappGlob = med(V.filter(v => v.pv).map(v => v.pv / v.pp)) || 1;     // incasso / prezzo alla prenotazione
const rappP0 = med(V.filter(v => v.pv).map(v => v.pv / v.p0)) || 1;       // incasso / primo prezzo

// quanto pesano un anno e 10.000 km sul prezzo: regressione sul logaritmo del prezzo dentro gruppi di auto uguali
function coeff(lista) {
  const g = {}; lista.filter(v => v.km > 0).forEach(v => { const k = [v.b, v.f, v.fu, Math.round(v.kw / 10), v.tr, v.ca, v.spec].join('|'); (g[k] = g[k] || []).push(v); });
  const X = [];
  for (const a of Object.values(g)) {
    if (a.length < 3) continue;
    const me = f => a.reduce((t, v) => t + f(v), 0) / a.length, ml = me(v => Math.log(v.pp)), mE = me(v => v.eta), mK = me(v => v.km / 1e4);
    a.forEach(v => X.push([v.eta - mE, v.km / 1e4 - mK, Math.log(v.pp) - ml]));
  }
  if (X.length < 30) return null;
  let s11 = 0, s12 = 0, s22 = 0, s1y = 0, s2y = 0; X.forEach(([x, y, z]) => { s11 += x * x; s12 += x * y; s22 += y * y; s1y += x * z; s2y += y * z; });
  const det = s11 * s22 - s12 * s12;
  return { eta: (s1y * s22 - s2y * s12) / det, km: (s2y * s11 - s1y * s12) / det, n: X.length };
}
const GLOB = coeff(V), perModello = {};
for (const f of new Set(V.map(v => v.b + '|' + v.f))) { const c = coeff(V.filter(v => v.b + '|' + v.f === f)); if (c && c.eta < 0 && c.km < 0) perModello[f] = c; }

const arrotonda = v => Math.max(450, Math.round((v + 50) / 500) * 500 - 50);   // prezzo veicolo che finisce in 450 o 950

const LIVELLI = [
  { nome: 'stesso allestimento e motore, ultimi 12 mesi', mesi: 12, tr: 1, kw: 1, ca: 1 },
  { nome: 'stesso allestimento e motore, ultimi 24 mesi', mesi: 24, tr: 1, kw: 1, ca: 1 },
  { nome: 'stesso motore, allestimento diverso', mesi: 24, tr: 0, kw: 1, ca: 1 },
  { nome: 'stesso modello e alimentazione', mesi: 24, tr: 0, kw: 0, ca: 0 },
];
const CARROZZERIE = /croce autogroup|corvaglia|carrozzeria|autocentri/i;
const libere = s.cars.filter(c => c.free && c.prezzo > 0);

const righe = s.cars.filter(c => c.free && !c.prezzo).map(c => {
  const l = letti.get(c.targa) || { off: [] };
  const acq = l.fattura || l.ritiro || 0;
  const cN = l.off.filter(([n]) => CARROZZERIE.test(n)).reduce((t, [, v]) => t + v, 0), aN = l.off.filter(([n]) => !CARROZZERIE.test(n)).reduce((t, [, v]) => t + v, 0);
  const kw = kwDa(c.modello, c.kw), tr = trim(c.modello), pl = plus(c.modello), ca = cambio(c.cambio), eta = c.imm ? mesi(OGGI, c.imm) / 12 : 0;
  const k = perModello[c.brand + '|' + c.family] || GLOB;
  let simili = [], liv = 0;
  for (; liv < LIVELLI.length; liv++) {
    const L_ = LIVELLI[liv], lim = new Date(Date.parse(OGGI) - L_.mesi * 30.44 * 864e5).toISOString().slice(0, 10);
    simili = V.filter(v => v.t !== c.targa && v.b === c.brand && v.f === c.family && v.fu === c.fuel && v.pren >= lim && Math.abs(v.eta - eta) <= 2.5
      && (!L_.kw || !kw || !v.kw || Math.abs(v.kw - kw) / kw <= 0.12)
      && (!L_.tr || v.tr === tr)
      && (!L_.ca || !ca || !v.ca || v.ca === ca));
    if (simili.length >= 3) break;
  }
  if (liv === LIVELLI.length) liv = LIVELLI.length - 1;
  const usate = simili.map(v => {
    const dk = c.km && v.km ? (c.km - v.km) / 1e4 : 0;
    const fatt = Math.exp(k.eta * (eta - v.eta) + k.km * dk), adeg = v.pp * fatt, adegPv = v.pv ? v.pv * fatt : null;
    const adegP0 = v.p0 * Math.exp(k.eta * (eta - v.eta0) + k.km * dk);
    const dist = Math.abs(eta - v.eta) * 2 + Math.abs(dk) * 0.6 + mesi(OGGI, v.pren) / 6 + (c.spec !== v.spec ? 1 : 0) + (pl !== v.pl ? 0.5 : 0) + (v.tr !== tr ? 1 : 0);
    return { ...v, adeg, adegPv, adegP0, dist, gg: v.d0 ? Math.max(0, Math.round((Date.parse(v.pren) - Date.parse(v.d0)) / 864e5)) : null };
  }).sort((a, b) => a.dist - b.dist).slice(0, 8);
  const pass = passaggio(kw);
  let cons = null;
  if (usate.length >= 3) {
    // il prezzo come lo mette chi prezza: il primo prezzo dato alle simili al loro arrivo, adeguato ad anno e km
    const veic = arrotonda(med(usate.map(v => v.adegP0)));
    const prenot = med(usate.map(v => v.adeg));                                   // prezzo esposto quando si sono prenotate
    // incasso atteso: per ogni simile, incasso vero (CROSS) diviso il suo primo prezzo = quanto si e' sceso tra ribassi e
    // trattativa; la mediana di questo rapporto applicata al consigliato
    const conPv = usate.filter(v => v.pv), daCross = conPv.length >= 3;
    const rapp = daCross ? med(conPv.map(v => v.pv / v.p0)) : rappP0;
    const incasso = Math.round(veic * Math.min(rapp, 1) / 50) * 50;
    cons = { veic, tot: veic + pass, prenot: Math.round(prenot / 50) * 50, incasso, trattativa: 1 - incasso / veic, daCross };
  }
  const aff = !cons ? 'nessuna' : (liv <= 1 && usate.length >= 5 ? 'alta' : liv <= 2 ? 'media' : 'bassa');
  // simili in vendita oggi (stesso modello, alimentazione, allestimento e potenza)
  const inStock = libere.filter(x => x.targa !== c.targa && x.brand === c.brand && x.family === c.family && x.fuel === c.fuel && trim(x.modello) === tr && (!kw || !x.kw || Math.abs(x.kw - kw) / kw <= 0.12)
    && x.imm && c.imm && Math.abs(mesi(x.imm, c.imm)) <= 18);
  return { c, l, acq, cN, aN, costo: acq + cN + aN, kw, tr, usate, liv, cons, aff, pass, inStock, gg: med(usate.map(v => v.gg).filter(x => x != null)) };
});
// urgenza: pronte (fattura di carrozzeria in CROSS o prezzo speciale, che non va in carrozzeria) e in casa da piu' di
// 45 giorni = da prezzare per prime; poi le vecchie senza fattura di carrozzeria; poi quelle entrate da poco
const SOGLIA = 45, pronta = r => !!(r.c.spec || r.cN > 0);
righe.forEach(r => { r.casa = r.c.giorni || 0; r.pronta = pronta(r); r.gruppo = r.casa > SOGLIA ? (r.pronta ? 1 : 2) : 3; });
righe.sort((a, b) => a.gruppo - b.gruppo || b.casa - a.casa);
const G = [1, 2, 3].map(g => righe.filter(r => r.gruppo === g));

// ---------- PDF ----------
const box = (n, t) => `<div class="box"><b>${n}</b><span>${t}</span></div>`;
const conCons = righe.filter(r => r.cons), alta = righe.filter(r => r.aff === 'alta');
const valore = conCons.reduce((t, r) => t + r.cons.veic, 0);
const affTxt = { alta: 'alta', media: 'media', bassa: 'bassa', nessuna: '' };
const pct = x => (Math.abs(x) * 100).toFixed(1).replace('.', ',');
const kMed = perModello['Volkswagen|T-Roc'] || GLOB;
let n = 0;
const anno = iso => iso ? iso.slice(5, 7) + '/' + iso.slice(2, 4) : '';
const riga = r => {
  const { c, usate, cons } = r;
  const min = usate.length ? Math.min(...usate.map(v => v.pp)) : 0, max = usate.length ? Math.max(...usate.map(v => v.pp)) : 0;
  const stock = r.inStock.length ? '<br><small>oggi in vendita ' + r.inStock.length + ' da ' + E(Math.min(...r.inStock.map(x => x.prezzoV || veicolo(x.prezzo, x.kw)))) + '</small>' : '';
  return '<tr><td class="n">' + (++n) + '</td>'
    + '<td class="t">' + esc(c.targa) + (c.spec ? ' <span class="ps">PS</span>' : '') + '</td>'
    + '<td class="r b">' + r.casa + ' gg</td>'
    + '<td class="auto"><b>' + esc(c.brand === 'Volkswagen' ? '' : c.brand + ' ') + esc(c.family) + '</b><small>' + esc(c.modello) + '</small></td>'
    + '<td class="r">' + anno(c.imm) + '<br><small>' + (c.km ? N(c.km) + ' km' : 'km n.d.') + '</small></td>'
    + '<td class="r">' + (r.acq ? E(r.acq) : '-') + (r.cN ? '<br><small>carr. ' + E(r.cN) + '</small>' : '') + (r.aN ? '<br><small>altri ' + E(r.aN) + '</small>' : '') + '</td>'
    + '<td class="r b">' + E(r.costo) + '</td>'
    + '<td>' + (usate.length ? '<b>' + usate.length + '</b> · ' + (min === max ? E(min) : N(min) + '–' + E(max)) : '<small>nessuna</small>') + stock + '</td>'
    + '<td class="r cons">' + (cons ? E(cons.veic) + '<br><small>trattativa ' + pct(cons.trattativa) + '%</small>' : '<small>a mano</small>') + '</td>'
    + '<td class="r">' + (cons ? E(cons.incasso) + (cons.daCross ? '' : '*') : '') + '</td>'
    + '<td class="aff ' + r.aff + '">' + affTxt[r.aff] + '</td></tr>';
};
const THEAD = '<thead><tr><th>#</th><th>Targa</th><th class="r">In casa</th><th>Auto</th><th class="r">Imm. · km</th><th class="r">Acquisto</th><th class="r">Costo</th><th>Simili vendute</th><th class="r">Prezzo consigliato</th><th class="r">Incasso atteso</th><th>Affid.</th></tr></thead>';
const SEZIONI = [
  ['Pronte e in casa da più di ' + SOGLIA + ' giorni', 'carrozzeria fatta (fattura in CROSS) o prezzo speciale: si possono prezzare subito. Dalla più vecchia.'],
  ['In casa da più di ' + SOGLIA + ' giorni, senza fattura di carrozzeria in CROSS', 'da verificare: ancora in carrozzeria, fattura non registrata o lavoro non necessario.'],
  ['Entrate da ' + SOGLIA + ' giorni o meno', G[2].filter(r => r.pronta).length + ' già pronte (carrozzeria fatta o prezzo speciale). Dalla più vecchia.'],
];
const tab = G.map((g, i) => !g.length ? '' : '<h2 class="sez g' + (i + 1) + '">' + SEZIONI[i][0] + ' · ' + g.length + ' auto <small>' + SEZIONI[i][1] + '</small></h2>'
  + '<table>' + THEAD + '<tbody>' + g.map(riga).join('') + '</tbody></table>').join('');

// ---------- prima pagina: le piu' urgenti ----------
const C = { ar: '#eb6834', bl: '#2a78d6', gr: '#c3c2b7', grid: '#e1e0d9', ink: '#0b0b0b', ink2: '#52514e', mute: '#898781' };
const barra = (x, y, w, h, col) => { const r = h / 2, l = Math.max(0, w - r); return '<path d="M' + x + ' ' + y + 'h' + l + 'a' + r + ' ' + r + ' 0 0 1 0 ' + h + 'h-' + l + 'z" fill="' + col + '"/>'; };
function grafico() {
  const lista = G[0].concat(G[1]), W = 770, H = 605, top = 34, gap = G[1].length ? 22 : 0, lx = 205, rx = 46;
  const rh = Math.min(16, (H - top - gap - 6) / lista.length), max = Math.ceil(Math.max(...lista.map(r => r.casa), 60) / 50) * 50;
  const X = d => lx + (W - lx - rx) * d / max, bh = Math.min(9, rh - 4);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">';
  for (let d = 0; d <= max; d += 50) s += '<line x1="' + X(d) + '" x2="' + X(d) + '" y1="' + (top - 6) + '" y2="' + (H - 4) + '" stroke="' + C.grid + '" stroke-width="1"/><text x="' + X(d) + '" y="' + (top - 10) + '" font-size="9" fill="' + C.mute + '" text-anchor="middle">' + d + '</text>';
  s += '<text x="0" y="' + (top - 10) + '" font-size="9" fill="' + C.mute + '">giorni in casa →</text>';
  s += '<line x1="' + X(SOGLIA) + '" x2="' + X(SOGLIA) + '" y1="' + (top - 6) + '" y2="' + (H - 4) + '" stroke="' + C.ink2 + '" stroke-width="1.2" stroke-dasharray="3 3"/>'
    + '<text x="' + (X(SOGLIA) + 4) + '" y="' + (top - 22) + '" font-size="9" font-weight="700" fill="' + C.ink2 + '">' + SOGLIA + ' giorni</text>';
  let y = top;
  lista.forEach((r, i) => {
    if (i === G[0].length && gap) { s += '<text x="0" y="' + (y + 13) + '" font-size="9.5" font-weight="700" fill="' + C.ink2 + '">Senza fattura di carrozzeria in CROSS: da verificare</text>'; y += gap; }
    const cy = y + rh / 2, col = r.gruppo === 1 ? C.ar : C.gr, nome = (r.c.brand === 'Volkswagen' ? '' : r.c.brand + ' ') + r.c.family;
    s += '<text x="0" y="' + (cy + 3.3) + '" font-size="9.5" fill="' + C.ink + '"><tspan font-weight="700">' + esc(r.c.targa) + '</tspan> <tspan fill="' + C.ink2 + '">' + esc(nome.length > 22 ? nome.slice(0, 21) + '…' : nome) + '</tspan>' + (r.c.spec ? ' <tspan font-size="7.5" font-weight="700" fill="' + C.bl + '">PS</tspan>' : '') + '</text>'
      + barra(lx, cy - bh / 2, X(r.casa) - lx, bh, col)
      + '<text x="' + (X(r.casa) + 4) + '" y="' + (cy + 3.2) + '" font-size="9" fill="' + C.ink2 + '">' + r.casa + '</text>';
    y += rh;
  });
  return s + '</svg>';
}
// le entrate da poco su una riga da 0 a 45 giorni: un punto per auto (blu = gia' pronta)
function striscia() {
  const W = 230, H = 64, b = 44, X = d => 8 + (W - 30) * d / SOGLIA, conta = {};
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">'
    + '<line x1="6" x2="' + (W - 6) + '" y1="' + (b + 5) + '" y2="' + (b + 5) + '" stroke="' + C.gr + '"/>';
  G[2].slice().sort((a, c) => a.pronta - c.pronta).forEach(r => { const k = Math.round(r.casa / 2); conta[k] = (conta[k] || 0) + 1;
    s += '<circle cx="' + X(r.casa) + '" cy="' + (b - (conta[k] - 1) * 7.5) + '" r="3.2" fill="' + (r.pronta ? C.bl : '#fff') + '" stroke="' + (r.pronta ? '#fcfcfb' : C.mute) + '" stroke-width="1"/>'; });
  [0, 15, 30, 45].forEach(d => { s += '<text x="' + X(d) + '" y="' + (H - 2) + '" font-size="8.5" fill="' + C.mute + '" text-anchor="middle">' + d + (d === SOGLIA ? ' gg' : '') + '</text>'; });
  return s + '</svg>';
}
const valG1 = G[0].reduce((t, r) => t + (r.cons ? r.cons.veic : 0), 0), entro7 = G[2].filter(r => r.casa > SOGLIA - 7);
const tile = (n, t, cl) => '<div class="tile ' + (cl || '') + '"><b>' + n + '</b><span>' + t + '</span></div>';
const infografica = () => '<section class="info">' + testata('Le ' + righe.length + ' auto senza prezzo: quali prezzare per prime', 'Stampa stock del ' + dIt(OGGI) + ' · giorni in casa dalla data di ingresso · carrozzeria dalle fatture in CROSS')
  + '<div class="ig"><div class="lato">'
  + tile(G[0].length, 'auto <b>pronte</b> e in casa da più di ' + SOGLIA + ' giorni: carrozzeria fatta o prezzo speciale, manca solo il prezzo', 'forte')
  + tile(E(valG1), 'il loro valore ai prezzi consigliati')
  + tile(med(G[0].map(r => r.casa)) + ' giorni', 'metà di queste auto è in casa da più di ' + med(G[0].map(r => r.casa)) + ' giorni')
  + tile(G[1].length, 'in casa da più di ' + SOGLIA + ' giorni senza fattura di carrozzeria in CROSS (in grigio): da verificare')
  + '<div class="tile"><b>' + G[2].length + '</b><span>entrate da ' + SOGLIA + ' giorni o meno, ' + G[2].filter(r => r.pronta).length + ' già pronte (punti blu)' + (entro7.length ? '. <b>' + entro7.length + '</b> passano i ' + SOGLIA + ' giorni entro una settimana' : '') + '</span>' + striscia() + '</div>'
  + '</div><div class="graf"><div class="leg"><i style="background:' + C.ar + '"></i>pronte <i style="background:' + C.gr + '"></i>senza fattura di carrozzeria <span>· PS = prezzo speciale · i numeri sono i giorni in casa</span></div>' + grafico() + '</div></div>'
  + '<p class="note">Nelle pagine seguenti le stesse auto divise in tre gruppi, ognuno dalla più vecchia, con costo, vendite simili e prezzo consigliato.</p></section>';

// dettaglio in un file a parte: le 5 simili piu' vicine per ogni auto, per controllare i numeri
const dett = righe.map((r, i) => !r.usate.length ? '' : '<div class="det"><div class="dh"><b>' + (i + 1) + '. ' + esc(r.c.targa) + ' · ' + esc(r.c.family) + '</b> <small>' + anno(r.c.imm) + ' · ' + (r.c.km ? N(r.c.km) + ' km' : 'km n.d.') + '</small><span>' + (r.cons ? E(r.cons.veic) : 'a mano') + '</span></div>'
  + '<table><thead><tr><th>Targa</th><th>Immatr.</th><th class="r">Km</th><th>Prenotata</th><th class="r">Primo prezzo</th><th class="r">Adeguato</th><th class="r">Incasso CROSS</th></tr></thead><tbody>'
  + r.usate.slice(0, 5).map(v => '<tr><td>' + esc(v.t) + (v.spec ? ' <span class="ps">PS</span>' : '') + '</td><td>' + anno(v.imm) + '</td><td class="r">' + (v.km ? N(v.km) : '-') + '</td><td>' + dIt(v.pren) + '</td><td class="r">' + E(v.p0) + (v.pp !== v.p0 ? '<br><small>ribassata ' + E(v.pp) + '</small>' : '') + '</td><td class="r b">' + E(v.adegP0) + '</td><td class="r">' + (v.pv ? E(v.pv) : '-') + '</td></tr>').join('')
  + '</tbody></table></div>').join('');

const CSS = '@page { size: A4 landscape; margin: 9mm 9mm; }'
  + 'body { font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #0c1a2b; font-size: 9.5px; margin: 0; }'
  + '.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0c1a2b; padding-bottom: 4px; }'
  + 'h1 { font-size: 18px; margin: 0; } .sub { color: #5b6b80; font-size: 10px; }'
  + '.boxes { display: flex; gap: 6px; margin: 7px 0 3px; } .box { background: #eef2f7; border-radius: 6px; padding: 4px 9px; flex: 1; } .box b { display: block; font-size: 15px; } .box span { color: #44556a; font-size: 9px; }'
  + '.note { color: #44556a; font-size: 8.8px; margin: 4px 0 6px; line-height: 1.4; }'
  + 'table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }'
  + 'th { text-align: left; font-size: 8.5px; color: #5b6b80; border-bottom: 2px solid #0c1a2b; padding: 3px 4px; }'
  + 'td { border-bottom: 1px solid #dde3ea; padding: 2.5px 4px; vertical-align: top; line-height: 1.25; } tr { break-inside: avoid; }'
  + 'small { color: #5b6b80; font-size: 8px; } .r { text-align: right; } td.r { white-space: nowrap; } .n { color: #8a97a8; } .t { font-weight: 700; white-space: nowrap; } .b { font-weight: 700; }'
  + 'td.auto { max-width: 280px; } td.auto small { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }'
  + 'td.cons { font-weight: 800; font-size: 11.5px; background: #eef4fc; } td.cons small { font-weight: 400; }'
  + '.aff { font-size: 8.5px; font-weight: 700; } .aff.alta { color: #0a7a3d; } .aff.media { color: #a35a00; } .aff.bassa { color: #b3261e; }'
  + '.ps { display: inline-block; background: #0a5cf5; color: #fff; border-radius: 3px; padding: 0 3px; font-size: 7px; font-weight: 700; }'
  + '.colonne { column-count: 2; column-gap: 14px; } .det { break-inside: avoid; margin: 0 0 7px; } .dh { display: flex; gap: 6px; align-items: baseline; border-bottom: 1px solid #0c1a2b; padding: 1px 0; } .dh span { margin-left: auto; font-weight: 800; }'
  + '.det td, .det th { padding: 1.5px 3px; font-size: 8.5px; }'
  + '.info { break-after: page; } .ig { display: flex; gap: 14px; margin-top: 8px; } .lato { width: 250px; flex: none; display: flex; flex-direction: column; gap: 6px; }'
  + '.tile { background: #f4f3ef; border-radius: 6px; padding: 6px 9px; } .tile > b { display: block; font-size: 20px; line-height: 1.15; } .tile span { color: #52514e; font-size: 9.5px; line-height: 1.35; display: block; } .tile span b { color: #0b0b0b; }'
  + '.tile.forte { background: #fdeee7; border-left: 4px solid #eb6834; } .tile.forte > b { font-size: 30px; } .tile svg { display: block; margin-top: 4px; }'
  + '.graf { flex: 1; } .leg { font-size: 9.5px; color: #0b0b0b; margin-bottom: 2px; } .leg i { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin: 0 3px -1px 8px; } .leg i:first-child { margin-left: 0; } .leg span { color: #898781; }'
  + 'h2.sez { font-size: 13px; margin: 10px 0 3px; padding-left: 7px; border-left: 4px solid #c3c2b7; break-after: avoid; } h2.sez.g1 { border-color: #eb6834; } h2.sez small { font-size: 9px; font-weight: 400; margin-left: 4px; }';
const pagina = (titolo, corpo) => '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>' + titolo + '</title><style>' + CSS + '</style></head><body>' + corpo + '</body></html>';
const testata = (t, sotto) => '<div class="top"><div><h1>' + t + '</h1><div class="sub">' + sotto + '</div></div><div class="sub">Valentino Automobili · Usato · riservato</div></div>';

const html = pagina('Prezzi consigliati ' + dIt(OGGI), infografica() + testata('Le ' + righe.length + ' auto libere senza prezzo · prezzi consigliati', 'Stampa stock del ' + dIt(OGGI) + ' · costi da CROSS · confronto con le auto simili vendute da noi')
  + '<div class="boxes">' + box(conCons.length + ' su ' + righe.length, 'con prezzo consigliato (' + alta.length + ' con stima affidabile)') + box(E(valore), 'valore ai prezzi consigliati') + box(E(conCons.reduce((t, r) => t + r.cons.incasso, 0)), 'incasso atteso dopo la trattativa') + box('−' + pct(kMed.eta) + '% · −' + pct(kMed.km) + '%', 'quanto toglie un anno in più · 10.000 km in più') + '</div>'
  + '<p class="note">Prezzi veicolo (finiscono in 450 o 950; in stampa si aggiunge il passaggio). <b>In casa</b>: giorni dalla data di ingresso. <b>Costo</b>: acquisto IVA compresa + carrozzeria e altri lavori da CROSS. <b>Simili vendute</b>: quante auto uguali (modello, allestimento, potenza, cambio) abbiamo venduto e a che prezzi; sotto, quante simili sono in vendita oggi. <b>Prezzo consigliato</b>: il primo prezzo dato alle simili al loro arrivo (8 su 10 si vendono a quel prezzo), adeguato ad anno e km; sotto, il margine di trattativa. <b>Incasso atteso</b>: quanto si incassa dopo la trattativa, dai prezzi di vendita veri in CROSS (* = stima media). <b>Affid.</b> (quanto è affidabile il prezzo consigliato): <b>alta</b> = almeno 5 vendite della stessa auto (modello, allestimento, motore, cambio) negli ultimi 2 anni; <b>media</b> = stesso motore ma allestimento diverso, o meno di 5 vendite uguali; <b>bassa</b> = solo stesso modello e alimentazione; vuota = nessuna vendita simile, prezzo da fare a mano. PS = prezzo speciale. Le vendite usate per ogni calcolo sono nel file "vendute simili".</p>'
  + tab);
const htmlDett = pagina('Vendute simili ' + dIt(OGGI), testata('Le vendite usate per i prezzi consigliati', 'Per ogni auto le 5 simili più vicine: primo prezzo all\'arrivo (e ribasso, se c\'è stato), lo stesso adeguato ad anno e km dell\'auto da prezzare, incasso vero da CROSS · stampa del ' + dIt(OGGI)) + '<div class="colonne" style="margin-top:8px">' + dett + '</div>');

const dir = path.join(__dirname, 'rapporti'); fs.mkdirSync(dir, { recursive: true });
const giorno = dIt(OGGI).replace(/\//g, '-');
const filePdf = path.join(dir, 'Prezzi consigliati ' + giorno + '.pdf'), fileDett = path.join(dir, 'Prezzi consigliati - vendute simili ' + giorno + '.pdf');
fs.writeFileSync(path.join(dir, 'prezzi-consigliati.html'), html); fs.writeFileSync(path.join(dir, 'prezzi-consigliati-dettaglio.html'), htmlDett);
stampaPdf(path.join(dir, 'prezzi-consigliati.html'), filePdf).then(() => stampaPdf(path.join(dir, 'prezzi-consigliati-dettaglio.html'), fileDett))
  .then(() => console.log(righe.length + ' auto: ' + conCons.length + ' con prezzo consigliato (' + alta.length + ' affidabili) -> ' + filePdf + ' + dettaglio'))
  .catch(e => { console.error(e.message); process.exit(1); });
