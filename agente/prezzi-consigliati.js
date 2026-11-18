// Prezzi consigliati per le auto libere senza prezzo: per ognuna acquisto e carrozzeria (da CROSS), le auto simili
// vendute da noi negli ultimi mesi (dalle stampe dello stock) e un prezzo consigliato. PDF riservato, mai sul sito.
// Uso: node agente/prezzi-consigliati.js   ->   agente/rapporti/Prezzi consigliati GG-MM-AAAA.pdf
//
// Come si calcola il prezzo consigliato:
//  1. auto simili vendute: stessa marca, modello e alimentazione; poi, se ce ne sono almeno 3, stesso allestimento,
//     stessa potenza (+-12%) e stesso cambio, vendute negli ultimi 12 mesi; se non bastano si allarga per gradi
//     (24 mesi, poi allestimento diverso, poi solo modello). Escluse le cessioni a commercianti (vendite-escluse.json).
//  2. prezzo di vendita = prezzo veicolo il giorno della prenotazione (lo sconto finale non e' nelle stampe). La stampa
//     ha il totale con il passaggio: il prezzo veicolo, che finisce sempre in 450 o 950, si ricava togliendo il passaggio.
//  3. ogni prezzo viene adeguato all'anno e ai km dell'auto da prezzare, con quanto pesano anno e km nelle nostre
//     vendite degli ultimi 2 anni (calcolato modello per modello, se ci sono abbastanza vendite, altrimenti su tutto).
//  4. consigliato = mediana delle 8 simili piu' vicine (per anno, km, data di vendita e prezzo speciale), arrotondata
//     al prezzo veicolo che finisce in 450 o 950, come li mette chi prezza.
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
const kwDa = (m, kw) => { if (kw) return kw; const k = /(\d{2,3})\s*KW/i.exec(m); if (k) return +k[1]; const c = /(\d{2,3})\s*CV/i.exec(m); return c ? Math.round(c[1] / 1.36) : 0; };
// allestimento principale (uno solo) e "plus" come dettaglio: "R-LINE PLUS" resta un R-Line
const TRIM = ['GTI', 'GTD', 'RLINE', 'SLINE', 'HIGHLINE', 'STYLE', 'SPORT', 'ADVANCED', 'ELEGANCE', 'EXECUTIVE', 'DESIGN', 'ADMIRAL', 'GOLD', 'UNITED', 'COMFORTLINE', 'LIFE', 'BUSINESS', 'URBAN', 'MOVE', 'TRENDLINE', 'EDITION'];
const parole = m => ' ' + String(m).toUpperCase().replace(/R\s*-\s*LINE/g, 'RLINE').replace(/S\s+LINE/g, 'SLINE').replace(/[^A-Z0-9]+/g, ' ') + ' ';
const trim = m => { const x = parole(m); return TRIM.find(t => x.includes(' ' + t + ' ')) || ''; };
const plus = m => parole(m).includes(' PLUS ');
const cambio = c => (c === 'Automatico' || c === 'Manuale') ? c : '';

// passaggio di proprieta' tipico per potenza, dalle auto prezzate oggi
const passPerKw = {}; s.cars.filter(c => c.prezzo && c.kw && c.pp).forEach(c => { (passPerKw[c.kw] = passPerKw[c.kw] || {})[c.pp] = (passPerKw[c.kw][c.pp] || 0) + 1; });
function passaggio(kw) {
  const kws = Object.keys(passPerKw).map(Number); if (!kw || !kws.length) return 700;
  const vicino = kws.sort((a, b) => Math.abs(a - kw) - Math.abs(b - kw))[0];
  return +Object.entries(passPerKw[vicino]).sort((a, b) => b[1] - a[1])[0][0];
}
// I prezzi si mettono sul veicolo e finiscono sempre in 450 o 950; la stampa mostra il totale con il passaggio
// (500, 650, 700, 750, 800 o 1000). Dal totale si ricava il prezzo veicolo: giusto per 811 auto su 816 di oggi.
function veicolo(tot, kw) {
  const r = ((tot % 500) + 500) % 500, perResto = { 100: 650, 150: 700, 200: 750, 250: 800 };
  const pass = perResto[r] || (r === 450 ? (kw >= 100 ? 1000 : 500) : passaggio(kw));
  return tot - pass;
}

// vendite degli ultimi 2 anni (prenotazioni rimaste tali, senza cessioni escluse), con il prezzo veicolo
const da2 = new Date(Date.parse(OGGI) - 730 * 864e5).toISOString().slice(0, 10);
const V = Object.entries(L).filter(([, a]) => a.pren && a.pp > 0 && a.imm && a.pren >= da2 && !esclusa(a)).map(([t, a]) => {
  const kw = kwDa(a.m);
  return { t, b: a.b, f: a.f, fu: a.fu, ca: cambio(a.ca), m: a.m, imm: a.imm, km: a.km || 0, kw, tr: trim(a.m), pl: plus(a.m),
    pren: a.pren, pp: veicolo(a.pp, kw), eta: mesi(a.pren, a.imm) / 12, d0: (a.p[0] || [])[0], spec: !!(A[t] && A[t].spec) };
}).filter(v => v.eta >= 0 && v.pp > 0);

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
    const adeg = v.pp * Math.exp(k.eta * (eta - v.eta) + k.km * dk);
    const dist = Math.abs(eta - v.eta) * 2 + Math.abs(dk) * 0.6 + mesi(OGGI, v.pren) / 6 + (c.spec !== v.spec ? 1 : 0) + (pl !== v.pl ? 0.5 : 0) + (v.tr !== tr ? 1 : 0);
    return { ...v, adeg, dist, gg: v.d0 ? Math.max(0, Math.round((Date.parse(v.pren) - Date.parse(v.d0)) / 864e5)) : null };
  }).sort((a, b) => a.dist - b.dist).slice(0, 8);
  const pass = passaggio(kw);
  let cons = null;
  if (usate.length >= 3) { const veic = arrotonda(med(usate.map(v => v.adeg))); cons = { veic, tot: veic + pass }; }
  const aff = !cons ? 'nessuna' : (liv <= 1 && usate.length >= 5 ? 'alta' : liv <= 2 ? 'media' : 'bassa');
  // simili in vendita oggi (stesso modello, alimentazione, allestimento e potenza)
  const inStock = libere.filter(x => x.targa !== c.targa && x.brand === c.brand && x.family === c.family && x.fuel === c.fuel && trim(x.modello) === tr && (!kw || !x.kw || Math.abs(x.kw - kw) / kw <= 0.12)
    && x.imm && c.imm && Math.abs(mesi(x.imm, c.imm)) <= 18);
  return { c, l, acq, cN, aN, costo: acq + cN + aN, kw, tr, usate, liv, cons, aff, pass, inStock, gg: med(usate.map(v => v.gg).filter(x => x != null)) };
}).sort((a, b) => (a.c.brand + a.c.family).localeCompare(b.c.brand + b.c.family) || a.kw - b.kw || (a.c.imm || '').localeCompare(b.c.imm || ''));

// ---------- PDF ----------
const box = (n, t) => `<div class="box"><b>${n}</b><span>${t}</span></div>`;
const conCons = righe.filter(r => r.cons), alta = righe.filter(r => r.aff === 'alta');
const valore = conCons.reduce((t, r) => t + r.cons.veic, 0);
const affTxt = { alta: 'alta', media: 'media', bassa: 'bassa', nessuna: '' };
const pct = x => (Math.abs(x) * 100).toFixed(1).replace('.', ',');
const kMed = perModello['Volkswagen|T-Roc'] || GLOB;
let n = 0;
const tab = righe.map(r => {
  const { c, usate, cons } = r, diff = cons && r.costo ? cons.veic - r.costo : null;
  const min = usate.length ? Math.min(...usate.map(v => v.pp)) : 0, max = usate.length ? Math.max(...usate.map(v => v.pp)) : 0;
  const stock = r.inStock.length ? `<br><small>in vendita oggi: ${r.inStock.length} simili da ${E(Math.min(...r.inStock.map(x => x.prezzoV || veicolo(x.prezzo, x.kw))))}</small>` : '';
  return `<tr>
  <td class="n">${++n}</td>
  <td class="t">${esc(c.targa)}${c.spec ? '<br><span class="ps">PREZZO SPECIALE</span>' : ''}</td>
  <td><b>${esc(c.brand)} ${esc(c.family)}</b><br><small>${esc(c.modello)}</small></td>
  <td>${mIt(c.imm)}<br><small>${c.km ? N(c.km) + ' km' : 'km non indicati'}</small></td>
  <td class="r">${r.acq ? E(r.acq) : '<small>non trovato</small>'}</td>
  <td class="r">${r.cN ? E(r.cN) : c.spec ? '<small>così com\'è</small>' : '<small>-</small>'}${r.aN ? `<br><small>altri lavori ${E(r.aN)}</small>` : ''}</td>
  <td class="r b">${E(r.costo)}</td>
  <td>${usate.length ? `<b>${usate.length}</b> vendute a ${min === max ? E(min) : E(min) + ' – ' + E(max)}<br><small>${esc(LIVELLI[r.liv].nome)}${r.gg != null && usate.length ? ' · vendute in ' + N(r.gg) + ' giorni (tipico)' : ''}</small>` : '<small>nessuna vendita simile</small>'}${stock}</td>
  <td class="r cons">${cons ? E(cons.veic) : '<small>da valutare<br>a mano</small>'}</td>
  <td class="r ${diff != null && diff < 0 ? 'neg' : ''}">${diff != null ? (diff < 0 ? '−' : '+') + E(Math.abs(diff)) : ''}</td>
  <td class="aff ${r.aff}">${affTxt[r.aff]}</td></tr>`;
}).join('');

// dettaglio: le auto simili usate per ogni prezzo, cosi' ogni numero si puo' controllare
const dett = righe.map((r, i) => !r.usate.length ? '' : `<div class="det"><div class="dh"><b>${i + 1}. ${esc(r.c.targa)} · ${esc(r.c.brand)} ${esc(r.c.family)}</b> <small>${esc(r.c.modello)} · ${mIt(r.c.imm)} · ${r.c.km ? N(r.c.km) + ' km' : 'km non indicati'}</small><span>${r.cons ? 'consigliato ' + E(r.cons.veic) : 'da valutare a mano'}</span></div>
<table><thead><tr><th>Targa</th><th>Versione</th><th>Immatr.</th><th class="r">Km</th><th>Venduta il</th><th class="r">Giorni in vendita</th><th class="r">Prezzo alla vendita</th><th class="r">Adeguato a anno e km</th></tr></thead><tbody>
${r.usate.map(v => `<tr><td>${esc(v.t)}${v.spec ? ' <span class="ps">PS</span>' : ''}</td><td><small>${esc(v.m)}</small></td><td>${mIt(v.imm)}</td><td class="r">${v.km ? N(v.km) : '-'}</td><td>${dIt(v.pren)}</td><td class="r">${v.gg ?? '-'}</td><td class="r">${E(v.pp)}</td><td class="r b">${E(v.adeg)}</td></tr>`).join('')}
</tbody></table></div>`).join('');

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prezzi consigliati ${dIt(OGGI)}</title><style>
@page { size: A4 landscape; margin: 11mm 10mm; }
body { font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #0c1a2b; font-size: 10px; margin: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0c1a2b; padding-bottom: 6px; }
h1 { font-size: 20px; margin: 0; } .sub { color: #5b6b80; font-size: 11px; } h2 { font-size: 14px; margin: 14px 0 4px; break-after: avoid; }
.boxes { display: flex; gap: 8px; margin: 10px 0 4px; flex-wrap: wrap; }
.box { background: #eef2f7; border-radius: 6px; padding: 6px 10px; min-width: 110px; } .box b { display: block; font-size: 17px; } .box span { color: #44556a; font-size: 10px; }
.note { color: #44556a; font-size: 9.5px; margin: 6px 0; line-height: 1.5; }
table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
th { text-align: left; font-size: 9px; color: #5b6b80; border-bottom: 2px solid #0c1a2b; padding: 4px 4px; }
td { border-bottom: 1px solid #dde3ea; padding: 4px 4px; vertical-align: top; } tr { break-inside: avoid; }
small { color: #5b6b80; font-size: 8.5px; } .r { text-align: right; } .n { color: #8a97a8; width: 16px; } .t { font-weight: 700; white-space: nowrap; } .b { font-weight: 700; }
td.cons { font-weight: 800; font-size: 12px; background: #eef4fc; white-space: nowrap; } td.neg { color: #8a4b00; font-weight: 700; }
.aff { font-size: 9px; font-weight: 700; } .aff.alta { color: #0a7a3d; } .aff.media { color: #a35a00; } .aff.bassa { color: #b3261e; }
.ps { display: inline-block; background: #0a5cf5; color: #fff; border-radius: 4px; padding: 1px 4px; font-size: 7.5px; font-weight: 700; line-height: 1.3; }
.det { break-inside: avoid; margin: 0 0 9px; } .dh { display: flex; gap: 8px; align-items: baseline; border-bottom: 1px solid #0c1a2b; padding: 2px 0; } .dh span { margin-left: auto; font-weight: 700; }
.det table td, .det table th { padding: 2px 4px; font-size: 9px; } .pag { break-before: page; }
</style></head><body>
<div class="top"><div><h1>Le ${righe.length} auto libere senza prezzo · prezzi consigliati</h1><div class="sub">Stampa stock del ${dIt(OGGI)} · acquisto e carrozzeria da CROSS · auto simili vendute da noi negli ultimi mesi · riservato</div></div><div class="sub">Valentino Automobili · Usato</div></div>
<div class="boxes">${box(righe.length, 'auto senza prezzo')}${box(conCons.length, 'con un prezzo consigliato')}${box(alta.length, 'con stima affidabile (5 o più vendite identiche)')}${box(righe.length - conCons.length, 'da valutare a mano (poche vendite simili)')}${box(E(valore), 'valore ai prezzi consigliati (prezzo veicolo)')}</div>
<p class="note"><b>Come leggere la tabella.</b> <b>Costo</b> = acquisto IVA compresa (fattura per VTI ed estero, ritiro per privati e permute) + carrozzeria e altri lavori registrati in CROSS. <b>Vendute simili</b>: auto dello stesso modello, alimentazione, allestimento, potenza e cambio vendute da noi, con il prezzo che avevano il giorno della prenotazione (l'eventuale sconto finale non è nelle stampe). <b>Tutti i prezzi sono prezzi veicolo, quelli che finiscono in 450 o 950</b>: il totale in stampa aggiunge il passaggio. <b>Prezzo consigliato</b>: il prezzo delle simili adeguato all'anno e ai km di questa auto (dalle nostre vendite: circa ${pct(kMed.eta)}% in meno per ogni anno in più e ${pct(kMed.km)}% ogni 10.000 km in più, calcolato modello per modello), poi la mediana delle 8 più vicine, arrotondata a 450 o 950. <b>Differenza</b> = prezzo veicolo consigliato meno costo, indicativa. <b>Affidabilità</b>: alta con 5 o più vendite identiche, media con meno vendite o allestimento diverso, bassa con il solo modello. Le auto sono ordinate per modello, così le simili stanno vicine. Dopo la tabella, per ogni auto, l'elenco delle vendite usate per il calcolo.</p>
<table><thead><tr><th>#</th><th>Targa</th><th>Auto</th><th>Immatr. · km</th><th class="r">Acquisto</th><th class="r">Carrozzeria</th><th class="r">Costo</th><th>Vendute simili</th><th class="r">Prezzo consigliato</th><th class="r">Differenza</th><th>Affid.</th></tr></thead><tbody>${tab}</tbody></table>
<div class="pag"></div><h2>Le vendite usate per ogni prezzo</h2>
<p class="note">Per ogni auto, le vendite simili più vicine (per anno, km, data di vendita e prezzo speciale), con il prezzo veicolo al giorno della prenotazione e lo stesso prezzo adeguato all'anno e ai km dell'auto da prezzare. PS = era a prezzo speciale.</p>
${dett}
</body></html>`;

const dir = path.join(__dirname, 'rapporti'); fs.mkdirSync(dir, { recursive: true });
const fileHtml = path.join(dir, 'prezzi-consigliati.html'), filePdf = path.join(dir, `Prezzi consigliati ${dIt(OGGI).replace(/\//g, '-')}.pdf`);
fs.writeFileSync(fileHtml, html);
stampaPdf(fileHtml, filePdf).then(() => console.log(`${righe.length} auto: ${conCons.length} con prezzo consigliato (${alta.length} affidabili), ${righe.length - conCons.length} da valutare a mano -> ${filePdf}`)).catch(e => { console.error(e.message); process.exit(1); });
