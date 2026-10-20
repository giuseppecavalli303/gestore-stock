// Presentazione giornaliera (e, il lunedi', riepilogo settimanale) dello stock usato, solo per Giuseppe.
// Legge le stampe salvate in git, gli annunci del sito e il giudizio di AutoScout24, disegna le slide in HTML
// e le stampa in PDF con Chrome. Mette in coda una mail a Giuseppe con i PDF allegati.
// Uso: node agente/rapporto.js [--settimana] [--non-inviare] [--immagini]
const fs = require('fs'), path = require('path');
const { fotografie } = require('./storico.js');

const root = path.join(__dirname, '..');
const OUT = path.join(__dirname, 'rapporti');
const IO = 'giuseppe.cavalli@valentinoautomobili.it', IO_NOME = 'Giuseppe Cavalli';
const APP = 'https://giuseppecavalli303.github.io/gestore-stock/';
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const args = process.argv.slice(2);

const leggi = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return def; } };
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const N = n => Math.round(n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
const eur = n => (n ? N(n) + ' €' : '—');
const eurC = n => (n >= 1e6 ? (n / 1e6).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mln €' : n >= 1e4 ? N(n / 1000) + ' mila €' : eur(n));
const pct = x => (isFinite(x) ? Math.round(x * 100) + '%' : '—');
const dIt = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dCorto = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const data = iso => new Date(iso + 'T12:00:00');
const dLungo = iso => data(iso).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const gg = (a, b) => Math.round((data(b) - data(a)) / 864e5);
const mediana = a => { const s = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const m4 = s => String(s || '').normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase().slice(0, 4);
const nome = c => `${c.brand} ${c.family || String(c.modello || '').split(' ')[0]}`;

/* ---------------- dati ---------------- */
const online = c => !!(c && (c.web || c.as));
const vendibile = c => !!(c && c.free && c.prezzo > 0 && online(c));

function kpi(d) {
  const cs = d.cars, lib = cs.filter(c => c.free), somma = l => l.reduce((s, c) => s + (c.prezzo || 0), 0);
  const f90 = lib.filter(c => (c.giorni ?? 0) >= 90);
  return {
    day: d.meta.day, tot: cs.length, libere: lib.length, prenotate: cs.filter(c => c.booked).length,
    arrivo: cs.filter(c => c.st === 7).length, rip: cs.filter(c => c.st === 6).length,
    valore: somma(lib), f90: f90.length, v90: somma(f90), f180: lib.filter(c => (c.giorni ?? 0) >= 180).length,
    senzaPrezzo: lib.filter(c => !c.prezzo).length, nonOnline: lib.filter(c => c.prezzo > 0 && !online(c)).length,
    vendibili: lib.filter(vendibile).length, eta: mediana(lib.map(c => c.giorni ?? 0))
  };
}

function movimenti(a, b) {
  const ma = new Map(a.cars.map(c => [c.targa, c])), mb = new Map(b.cars.map(c => [c.targa, c]));
  const prima = t => ma.get(t) || {};
  return {
    da: a.meta.day, a: b.meta.day,
    entrate: b.cars.filter(c => !ma.has(c.targa)),
    uscite: a.cars.filter(c => !mb.has(c.targa)),
    prenotate: b.cars.filter(c => c.booked && !prima(c.targa).booked),
    disdette: b.cars.filter(c => c.free && prima(c.targa).booked),
    ribassi: b.cars.filter(c => { const p = ma.get(c.targa); return c.free && p && p.prezzo > 0 && c.prezzo > 0 && c.prezzo < p.prezzo; }).map(c => ({ c, era: ma.get(c.targa).prezzo })),
    pronte: b.cars.filter(c => vendibile(c) && !vendibile(ma.get(c.targa))),
    passate90: b.cars.filter(c => c.free && ma.has(c.targa) && (c.giorni ?? 0) >= 90 && (prima(c.targa).giorni ?? 0) < 90),
    passate180: b.cars.filter(c => c.free && ma.has(c.targa) && (c.giorni ?? 0) >= 180 && (prima(c.targa).giorni ?? 0) < 180)
  };
}

// somma i movimenti giorno per giorno (cosi' una prenotazione fatta e disdetta in settimana si vede)
function movimentiPeriodo(snap) {
  const tot = { entrate: [], uscite: [], prenotate: [], disdette: [], ribassi: [], pronte: [], passate90: [], passate180: [], giorni: [] };
  for (let i = 1; i < snap.length; i++) {
    const m = movimenti(snap[i - 1], snap[i]);
    for (const k of Object.keys(tot)) if (k !== 'giorni') tot[k].push(...m[k]);
    tot.giorni.push(m);
  }
  return tot;
}

// giorni dall'ingresso in stock alla prenotazione, su tutte le prenotazioni viste nelle stampe
function tempiVendita(snap) {
  const m = new Map();
  for (const d of snap) for (const c of d.cars) {
    if (!c.booked || !c.dataPren || !c.ingr) continue;
    const g = gg(c.ingr, c.dataPren);
    if (g > -400 && g < 1500) m.set(c.targa, { c, g: Math.max(0, g), quando: c.dataPren });
  }
  return [...m.values()];
}

// ribassi e prenotazioni disdette nello storico, con l'esito
function eventi(snap) {
  const rib = [], dis = [];
  for (let i = 1; i < snap.length; i++) {
    const m = movimenti(snap[i - 1], snap[i]);
    for (const r of m.ribassi) {
      let esito = null;
      for (let j = i + 1; j < snap.length; j++) {
        const c = snap[j].cars.find(x => x.targa === r.c.targa);
        if (!c) { esito = { tipo: 'uscita', giorni: gg(m.a, snap[j].meta.day) }; break; }
        if (c.booked) { esito = { tipo: 'prenotata', giorni: gg(m.a, snap[j].meta.day) }; break; }
      }
      rib.push({ ...r, day: m.a, esito });
    }
    for (const c of m.disdette) dis.push({ c, day: m.a });
  }
  return { rib, dis };
}

function autoscout(cs, annunci) {
  const as = leggi(path.join(__dirname, 'autoscout.json'), null);
  if (!as || !as.annunci) return null;
  const sito = new Map((annunci || []).map(a => [a.url, a]));
  const k = new Map();
  as.annunci.forEach(a => { const key = m4(a.marca) + '|' + a.km + '|' + a.imm; k.set(key, (k.get(key) || []).concat(a)); });
  const per = new Map();
  for (const c of cs) {
    if (!online(c)) continue;
    const s = (c.web && sito.get(c.web.url)) || {};
    let l = k.get(m4(c.brand) + '|' + c.km + '|' + c.imm) || [];
    if (l.length !== 1) { const l2 = k.get(m4(c.brand) + '|' + s.km + '|' + s.imm) || []; if (l2.length) l = l2; }
    if (l.length > 1) { const p = l.filter(a => a.prezzo === c.prezzo || a.prezzo === c.prezzoV); if (p.length) l = p; }
    if (l.length && l.every(a => a.giudizio === l[0].giudizio && a.contatti === l[0].contatti)) per.set(c.targa, l[0]);
  }
  return { aggiornato: as.aggiornato, totale: as.annunci.length, tutti: as.annunci, per };
}

const GIUDIZI = [
  ['top-price', 'Prezzo top', '#0B7A55'], ['good-price', 'Buon prezzo', '#2BB07F'], ['fair-price', 'Nella media', '#9AA9BC'],
  ['somewhat-expensive', 'Un po\' alto', '#E8A33D'], ['expensive', 'Alto', '#D9534F']
];
const giudizio = g => (GIUDIZI.find(x => x[0] === g) || [g, 'Senza giudizio', '#CBD5E1']);
const caro = a => a && (a.giudizio === 'somewhat-expensive' || a.giudizio === 'expensive');
const FASCE_ETA = [[0, 30, '0-30'], [31, 60, '31-60'], [61, 90, '61-90'], [91, 180, '91-180'], [181, 365, '181-365'], [366, 1e9, 'oltre 365']];
const FASCE_PREZZO = [[0, 12000, 'fino a 12 mila'], [12000, 15000, '12-15 mila'], [15000, 20000, '15-20 mila'], [20000, 25000, '20-25 mila'], [25000, 30000, '25-30 mila'], [30000, 1e9, 'oltre 30 mila']];
const fascia = (F, v) => F.find(f => v >= f[0] && v <= f[1] - (F === FASCE_PREZZO ? 1 : 0)) || F[F.length - 1];

const statoDi = c => (c.free ? 'Libera' : c.booked ? 'Prenotata' : String(c.stato || '').charAt(0).toUpperCase() + String(c.stato || '').slice(1).toLowerCase());
const perStato = l => { const m = new Map(); l.forEach(c => m.set(statoDi(c), (m.get(statoDi(c)) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([s, v]) => ({ l: s, v })); };

/* ---------------- grafici (SVG disegnato a mano: niente librerie, stampa nitida) ---------------- */
const BLU = '#0A5CF5', NAVY = '#0B1B33', GRIGIO = '#5B6B80', CHIARO = '#E6EAF0', VERDE = '#0E9F6E', AMBRA = '#D98A1E', ROSSO = '#D9534F';

function barre(items, { w = 560, riga = 30, max, fmt = N, colore = BLU, etW = 170 } = {}) {
  if (!items.length) return '<p class="vuoto">Nessun dato ancora.</p>';
  max = max || Math.max(...items.map(i => i.v), 1);
  const h = items.length * riga, bw = w - etW - 150;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${items.map((it, i) => {
    const y = i * riga, L = Math.max(3, bw * it.v / max);
    return `<text x="0" y="${y + riga / 2 + 5}" class="et">${esc(it.l)}</text>
<rect x="${etW}" y="${y + 7}" width="${bw}" height="${riga - 14}" rx="${(riga - 14) / 2}" fill="#F1F4F8"/>
<rect x="${etW}" y="${y + 7}" width="${L}" height="${riga - 14}" rx="${(riga - 14) / 2}" fill="${it.c || colore}"/>
<text x="${etW + L + 8}" y="${y + riga / 2 + 5}" class="val">${fmt(it.v)}${it.n ? `<tspan class="n" dx="6">${esc(it.n)}</tspan>` : ''}</text>`;
  }).join('')}</svg>`;
}

function colonne(items, { w = 600, h = 300, fmt = N, sotto } = {}) {
  const max = Math.max(...items.map(i => i.v), 1), n = items.length, gap = 22, bw = (w - gap * (n - 1)) / n, base = h - 46;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${items.map((it, i) => {
    const x = i * (bw + gap), H = Math.max(3, (base - 34) * it.v / max);
    return `<rect x="${x}" y="${base - H}" width="${bw}" height="${H}" rx="8" fill="${it.c || BLU}"/>
<text x="${x + bw / 2}" y="${base - H - 10}" text-anchor="middle" class="val">${fmt(it.v)}</text>
<text x="${x + bw / 2}" y="${base + 20}" text-anchor="middle" class="et">${esc(it.l)}</text>
${sotto ? `<text x="${x + bw / 2}" y="${base + 38}" text-anchor="middle" class="n">${esc(sotto(it))}</text>` : ''}`;
  }).join('')}<line x1="0" x2="${w}" y1="${base}" y2="${base}" stroke="${CHIARO}"/></svg>`;
}

function impilata(seg, { w = 1150, h = 34 } = {}) {
  const tot = seg.reduce((s, x) => s + x.v, 0) || 1;
  let x = 0;
  const rett = seg.map(s => { const L = w * s.v / tot, r = `<rect x="${x}" y="0" width="${Math.max(0, L - 2)}" height="${h}" fill="${s.c}"/>${L > 54 ? `<text x="${x + L / 2}" y="${h / 2 + 5}" text-anchor="middle" class="sv">${pct(s.v / tot)}</text>` : ''}`; x += L; return r; }).join('');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><clipPath id="cl${w}"><rect width="${w}" height="${h}" rx="10"/></clipPath><g clip-path="url(#cl${w})">${rett}</g></svg>
<div class="legenda">${seg.map(s => `<span><i style="background:${s.c}"></i>${esc(s.l)} <b>${N(s.v)}</b></span>`).join('')}</div>`;
}

function linea(punti, { w = 540, h = 170, fmt = N, colore = BLU } = {}) {
  if (punti.length < 2) return '<p class="vuoto">Servono almeno due stampe.</p>';
  const vs = punti.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), pad = (hi - lo) * 0.25 || Math.max(1, hi * 0.02);
  const min = lo - pad, max = hi + pad, X = i => 24 + i * (w - 48) / (punti.length - 1), Y = v => 12 + (h - 46) * (1 - (v - min) / (max - min));
  const d = punti.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const area = `${d} L${X(punti.length - 1)},${h - 34} L${X(0)},${h - 34} Z`;
  const id = 'g' + Math.random().toString(36).slice(2, 8);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${colore}" stop-opacity=".18"/><stop offset="1" stop-color="${colore}" stop-opacity="0"/></linearGradient></defs>
<path d="${area}" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${colore}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
${punti.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.v)}" r="${i === punti.length - 1 ? 4.5 : 3}" fill="${i === punti.length - 1 ? colore : '#fff'}" stroke="${colore}" stroke-width="2"/>
<text x="${X(i)}" y="${h - 12}" text-anchor="middle" class="n">${dCorto(p.d)}</text>`).join('')}
</svg>`;
}

function imbuto(passi, { w = 560 } = {}) {
  const max = passi[0].v || 1, riga = 62;
  return `<svg width="${w}" height="${passi.length * riga}" viewBox="0 0 ${w} ${passi.length * riga}">${passi.map((p, i) => {
    const L = Math.max(40, (w - 150) * p.v / max), x = (w - 150 - L) / 2, y = i * riga;
    return `<rect x="${x}" y="${y + 6}" width="${L}" height="${riga - 16}" rx="10" fill="${p.c || BLU}" opacity="${1 - i * 0.12}"/>
<text x="${(w - 150) / 2}" y="${y + riga / 2 + 4}" text-anchor="middle" class="sv">${N(p.v)}</text>
<text x="${w - 140}" y="${y + riga / 2 - 2}" class="et">${esc(p.l)}</text>
<text x="${w - 140}" y="${y + riga / 2 + 15}" class="n">${i ? pct(p.v / max) + ' delle libere' : ''}</text>`;
  }).join('')}</svg>`;
}

/* ---------------- pezzi di slide ---------------- */
function delta(ora, prima, { meglioSu = true, fmt = N, unita = '' } = {}) {
  if (prima == null || ora == null) return '';
  const d = ora - prima;
  if (!d) return `<span class="delta pari">= ieri</span>`;
  const buono = meglioSu ? d > 0 : d < 0;
  return `<span class="delta ${buono ? 'su' : 'giu'}">${d > 0 ? '▲' : '▼'} ${fmt(Math.abs(d))}${unita}</span>`;
}
const tile = (v, l, extra = '', cls = '') => `<div class="tile ${cls}"><div class="v">${v}</div><div class="l">${l}</div>${extra ? `<div class="x">${extra}</div>` : ''}</div>`;
const immTxt = c => (c.imm && !/^0+/.test(c.imm) ? c.imm.slice(5, 7) + '/' + c.imm.slice(0, 4) + ' · ' : '');
const breve = v => String(v || '').replace(/^(\S)\S*\s+/, '$1. ');
const auto = c => `<b>${esc(nome(c))}</b> <span class="tg">${esc(c.targa)}</span><div class="md">${N(c.km)} km · ${esc(immTxt(c))}${esc(String(c.modello || ''))}</div>`;
const pill = g => { const [, l, col] = giudizio(g); return `<span class="pill" style="--c:${col}">${esc(l)}</span>`; };
function tabella(intest, righe, vuoto = 'Nessuna auto.') {
  if (!righe.length) return `<p class="vuoto">${vuoto}</p>`;
  return `<table><thead><tr>${intest.map(h => `<th${h[0] === '>' ? ' class="num"' : ''}>${h.replace(/^[<>!]/, '')}</th>`).join('')}</tr></thead><tbody>${righe.map(r => `<tr>${r.map((x, i) => `<td${intest[i][0] === '>' ? ' class="num"' : intest[i][0] === '!' ? ' class="nw"' : ''}>${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

const CSS = `
@page { size: 1280px 720px; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
html, body { background: #fff }
body { font-family: "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif; color: ${NAVY}; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-variant-numeric: tabular-nums }
.slide { width: 1280px; height: 720px; padding: 44px 64px 0; position: relative; overflow: hidden; break-after: page; background: #fff; display: flex; flex-direction: column }
.slide:last-child { break-after: auto }
.slide::before { content: ""; position: absolute; left: 0; top: 0; width: 6px; height: 100%; background: linear-gradient(${BLU}, #5B8CFF) }
.kicker { font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: ${BLU}; font-weight: 700 }
h2 { font-family: "Segoe UI Variable Display", "Segoe UI", sans-serif; font-size: 32px; font-weight: 650; letter-spacing: -.015em; margin-top: 6px; line-height: 1.15 }
.sub { font-size: 15px; color: ${GRIGIO}; margin-top: 6px; max-width: 1000px; line-height: 1.4 }
.body { flex: 1; padding: 24px 0 18px; display: flex; gap: 36px; min-height: 0 }
.col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 16px }
.col.s { flex: .8 }
footer { height: 44px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #8A97A8; border-top: 1px solid ${CHIARO} }
footer b { color: ${NAVY}; font-weight: 600 }
h3 { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: ${GRIGIO}; font-weight: 700 }
.card { background: #F6F8FB; border-radius: 16px; padding: 18px 20px }
.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px }
.tiles.t4 { grid-template-columns: repeat(4, 1fr) } .tiles.t6 { grid-template-columns: repeat(6, 1fr) } .tiles.t2 { grid-template-columns: repeat(2, 1fr) }
.tile { background: #F6F8FB; border-radius: 16px; padding: 16px 18px; min-width: 0 }
.tile .v { font-family: "Segoe UI Variable Display", "Segoe UI", sans-serif; font-size: 34px; font-weight: 650; letter-spacing: -.02em; line-height: 1.05; white-space: nowrap }
.tiles.t6 .tile .v { font-size: 28px }
.tile .l { font-size: 13px; color: ${GRIGIO}; margin-top: 6px; line-height: 1.3 }
.tile .x { margin-top: 8px; font-size: 12px }
.tile.forte { background: ${NAVY}; color: #fff } .tile.forte .l { color: #B7C4D8 }
.tile.allerta { background: #FFF6E9 } .tile.allerta .v { color: #A85F00 }
.delta { display: inline-block; font-size: 12px; font-weight: 650; padding: 2px 8px; border-radius: 99px }
.delta.su { color: #0B7A55; background: #E3F6EE } .delta.giu { color: #B42318; background: #FDECEA } .delta.pari { color: ${GRIGIO}; background: #EEF1F5 }
.punti { display: flex; flex-direction: column; gap: 14px; counter-reset: p }
.punti li { list-style: none; display: flex; gap: 14px; font-size: 16px; line-height: 1.4 }
.punti li::before { counter-increment: p; content: counter(p); flex: none; width: 28px; height: 28px; border-radius: 50%; background: ${BLU}; color: #fff; font-size: 14px; font-weight: 700; display: grid; place-items: center }
.punti b { font-weight: 650 }
table { width: 100%; border-collapse: collapse; font-size: 12.5px }
th { white-space: nowrap; text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase; color: ${GRIGIO}; font-weight: 700; padding: 0 8px 6px 0; border-bottom: 1.5px solid ${NAVY} }
td { padding: 6px 8px 6px 0; border-bottom: 1px solid ${CHIARO}; vertical-align: top; line-height: 1.3 }
td.num, th.num { text-align: right; white-space: nowrap }
.tg { color: ${GRIGIO}; font-size: 11.5px } .md { color: ${GRIGIO}; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 320px }
td.nw { white-space: nowrap } .az .md { max-width: 265px }
.pill { display: inline-block; font-size: 11px; font-weight: 650; padding: 2px 8px; border-radius: 99px; color: #fff; background: var(--c); white-space: nowrap }
svg text { font-family: "Segoe UI Variable Text", "Segoe UI", sans-serif }
svg .et { font-size: 13px; fill: ${NAVY} } svg .val { font-size: 13px; font-weight: 700; fill: ${NAVY} } svg .n { font-size: 11.5px; fill: ${GRIGIO}; font-weight: 400 }
svg .sv { font-size: 13px; font-weight: 700; fill: #fff }
.legenda { display: flex; flex-wrap: wrap; gap: 8px 18px; margin-top: 10px; font-size: 12.5px; color: ${GRIGIO} }
.legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: 0 }
.legenda b { color: ${NAVY} }
.vuoto { font-size: 13px; color: ${GRIGIO}; font-style: italic }
.nota { font-size: 11.5px; color: #8A97A8; line-height: 1.4 }
.testa { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px } .testa .tot { font-size: 13px; color: ${GRIGIO} } .testa .tot b { color: ${NAVY} }
.grande { font-family: "Segoe UI Variable Display", "Segoe UI", sans-serif; font-size: 52px; font-weight: 650; letter-spacing: -.02em; line-height: 1 }
.frase { font-size: 15px; line-height: 1.45; color: #2A3A52 } .frase b { color: ${NAVY} }
/* copertina */
.cover { background: radial-gradient(1200px 700px at 85% 0%, #1D4ED8 0%, rgba(29,78,216,0) 60%), radial-gradient(900px 600px at 0% 100%, #0A5CF5 0%, rgba(10,92,245,0) 55%), ${NAVY}; color: #fff; padding: 64px 72px }
.cover::before { display: none }
.cover .kicker { color: #9DB8FF }
.cover h1 { font-family: "Segoe UI Variable Display", "Segoe UI", sans-serif; font-size: 68px; font-weight: 650; letter-spacing: -.025em; line-height: 1.02; margin-top: 18px }
.cover .data { font-size: 22px; color: #C9D6EE; margin-top: 16px } .cover .data::first-letter { text-transform: uppercase }
.cover .firma { font-size: 15px; color: #9FB0CC; margin-top: 8px }
.cover .eroi { position: absolute; left: 72px; right: 72px; bottom: 64px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 }
.cover .eroe { border-left: 1px solid rgba(255,255,255,.22); padding: 4px 22px }
.cover .eroe:first-child { border-left: 0; padding-left: 0 }
.cover .eroe .v { font-family: "Segoe UI Variable Display", "Segoe UI", sans-serif; font-size: 44px; font-weight: 650; letter-spacing: -.02em }
.cover .eroe .l { font-size: 14px; color: #B7C4D8; margin-top: 4px }
.cover .marchio { position: absolute; right: 72px; top: 64px; text-align: right; font-size: 13px; color: #9FB0CC; letter-spacing: .12em; text-transform: uppercase }
.cover .linee { position: absolute; right: -180px; top: -60px; opacity: .13 }
`;

function slide(kicker, titolo, sotto, corpo) {
  return { html: (n, fonte) => `<section class="slide"><header><div class="kicker">${kicker}</div><h2>${titolo}</h2>${sotto ? `<p class="sub">${sotto}</p>` : ''}</header>
<div class="body">${corpo}</div><footer><span><b>Valentino Automobili</b> · Stock usato · a cura di ${IO_NOME}</span><span>${fonte}</span><span>${n}</span></footer></section>` };
}
function copertina(titolo, dataTxt, eroi, kicker) {
  return { html: () => `<section class="slide cover"><div class="marchio">Valentino Automobili<br>Roma</div>
<svg class="linee" width="760" height="760" viewBox="0 0 760 760">${Array.from({ length: 9 }, (_, i) => `<circle cx="380" cy="380" r="${60 + i * 40}" fill="none" stroke="#fff" stroke-width="1.2"/>`).join('')}</svg>
<div class="kicker">${kicker}</div><h1>${titolo}</h1><div class="data">${dataTxt}</div><div class="firma">a cura di ${IO_NOME}</div>
<div class="eroi">${eroi.map(e => `<div class="eroe"><div class="v">${e[0]}</div><div class="l">${e[1]}</div></div>`).join('')}</div></section>` };
}

/* ---------------- analisi comuni ---------------- */
function analisi(snap) {
  const cur = snap[snap.length - 1], prev = snap.length > 1 ? snap[snap.length - 2] : null;
  const cs = cur.cars, lib = cs.filter(c => c.free);
  const annunci = (leggi(path.join(root, 'data', 'annunci.json'), {}) || {}).annunci || [];
  const as = autoscout(cs, annunci);
  const tv = tempiVendita(snap);
  const per = movimentiPeriodo(snap);
  const intervalli = Math.max(1, snap.length - 1);
  const ritmo = per.prenotate.length / intervalli;          // prenotazioni per giorno lavorativo
  return { cur, prev, cs, lib, as, tv, per, ritmo, k: kpi(cur), kp: prev ? kpi(prev) : null, mov: prev ? movimenti(prev, cur) : null, ev: eventi(snap) };
}

function messaggi(A) {
  const { k, lib, as, tv, ritmo } = A, out = [];
  out.push(`<b>${pct(k.v90 / (k.valore || 1))} del valore libero</b> (${eurC(k.v90)}) è in auto ferme da oltre 90 giorni: ${N(k.f90)} vetture su ${N(k.libere)}.`);
  const med = mediana(tv.map(x => x.g));
  if (med != null) out.push(`Un'auto impiega in media <b>${N(med)} giorni</b> dall'ingresso alla prenotazione${ritmo ? `; con ${ritmo.toLocaleString('it-IT', { maximumFractionDigits: 1 })} prenotazioni al giorno lo stock libero basta per <b>${N(k.libere / ritmo)} giorni lavorativi</b>` : ''}.`);
  out.push(`<b>${N(k.senzaPrezzo + k.nonOnline)} auto libere non sono vendibili</b>: ${N(k.senzaPrezzo)} senza prezzo e ${N(k.nonOnline)} con prezzo ma non pubblicate.`);
  if (as) {
    const vecchieCare = lib.filter(c => (c.giorni ?? 0) >= 90 && caro(as.per.get(c.targa)));
    out.push(`<b>${N(vecchieCare.length)} auto ferme da 90+ giorni</b> hanno un prezzo che AutoScout giudica alto: sono le prime da rivedere.`);
  }
  return out;
}

/* ---------------- presentazione giornaliera ---------------- */
function giornaliera(snap) {
  const A = analisi(snap), { cur, cs, lib, as, tv, k, kp, mov } = A, day = cur.meta.day, S = [];
  const medV = mediana(tv.map(x => x.g));

  S.push(copertina('Stock usato<br>rapporto del giorno', dLungo(day), [
    [N(k.libere), 'auto libere'], [eurC(k.valore), 'valore dello stock libero'], [N(k.f90), 'ferme da oltre 90 giorni'], [medV != null ? N(medV) + ' gg' : '—', 'tempo medio per vendere']
  ], `Stampa delle ${esc((cur.meta.printDate || '').slice(11))} · ${N(cs.length)} vetture`));

  // sintesi
  S.push(slide('In sintesi', 'Lo stock oggi', kp ? `Confronto con la stampa del ${dIt(kp.day)}.` : '', `
<div class="col"><div class="tiles">
${tile(N(k.libere), 'auto libere', delta(k.libere, kp && kp.libere, { meglioSu: false }))}
${tile(eurC(k.valore), 'valore stock libero', delta(k.valore, kp && kp.valore, { meglioSu: false, fmt: eurC }))}
${tile(N(k.vendibili), 'pronte da vendere<br>(prezzo e annuncio)', delta(k.vendibili, kp && kp.vendibili))}
${tile(N(k.f90), 'libere da oltre 90 giorni', delta(k.f90, kp && kp.f90, { meglioSu: false }), 'allerta')}
${tile(eurC(k.v90), 'capitale fermo da 90+ giorni', delta(k.v90, kp && kp.v90, { meglioSu: false, fmt: eurC }), 'allerta')}
${tile(N(k.prenotate), 'prenotate in stock', delta(k.prenotate, kp && kp.prenotate))}
</div>
<div class="card" style="margin-top:6px"><h3 style="margin-bottom:12px">Le ${N(k.tot)} vetture in stock</h3>${impilata([
    { l: 'Libere', v: k.libere, c: BLU }, { l: 'Prenotate', v: k.prenotate, c: VERDE }, { l: 'In arrivo', v: k.arrivo, c: '#7FA6F8' },
    { l: 'In riparazione', v: k.rip, c: AMBRA }, { l: 'Altro', v: k.tot - k.libere - k.prenotate - k.arrivo - k.rip, c: '#CBD5E1' }], { w: 600, h: 30 })}</div></div>
<div class="col s"><h3>Da sapere oggi</h3><ol class="punti">${messaggi(A).map(m => `<li><span>${m}</span></li>`).join('')}</ol></div>`));

  // movimenti
  if (mov) {
    const pren = mov.prenotate.slice().sort((a, b) => (b.prezzo || 0) - (a.prezzo || 0)).slice(0, 6);
    const rib = mov.ribassi.slice().sort((a, b) => (b.era - b.c.prezzo) - (a.era - a.c.prezzo)).slice(0, 6);
    S.push(slide('Movimenti', `Cosa è cambiato dal ${dIt(mov.da)}`, '', `
<div class="col" style="gap:20px"><div class="tiles t6">
${tile(N(mov.entrate.length), 'entrate in stock')}${tile(N(mov.uscite.length), 'uscite dallo stock')}${tile(N(mov.prenotate.length), 'nuove prenotazioni', '', 'forte')}
${tile(N(mov.disdette.length), 'prenotazioni saltate')}${tile(N(mov.ribassi.length), 'prezzi abbassati')}${tile(N(mov.pronte.length), 'diventate vendibili')}
</div>
<div style="display:flex;gap:36px;min-height:0">
<div class="col"><h3>Nuove prenotazioni${mov.prenotate.length > 6 ? ' · le 6 di valore più alto' : ''}</h3>${tabella(['Auto', '>In stock', '>Prezzo', '!Venditore'], pren.map(c => [auto(c), N(c.giorni) + ' gg', eur(c.prezzo), esc(breve(c.vend) || '—')]), 'Nessuna nuova prenotazione.')}</div>
<div class="col">${rib.length ? `<h3>Prezzi abbassati</h3>${tabella(['Auto', '>Era', '>Ora', '>In stock'], rib.map(r => [auto(r.c), eur(r.era), `<b>${eur(r.c.prezzo)}</b>`, N(r.c.giorni) + ' gg']))}`
    : `<h3>Entrate in stock (${N(mov.entrate.length)}), per stato</h3>${barre(perStato(mov.entrate), { w: 520, riga: 30, etW: 150, colore: BLU })}
<h3 style="margin-top:10px">Uscite dallo stock (${N(mov.uscite.length)}), com'erano prima</h3>${barre(perStato(mov.uscite), { w: 520, riga: 30, etW: 150, colore: VERDE })}
<p class="nota">Nessun prezzo abbassato rispetto alla stampa precedente.</p>`}</div>
</div></div>`));
  }

  // capitale fermo
  const bande = FASCE_ETA.map(f => { const l = lib.filter(c => (c.giorni ?? 0) >= f[0] && (c.giorni ?? 0) <= f[1]); return { l: f[2] + ' gg', v: l.reduce((s, c) => s + (c.prezzo || 0), 0), n: l.length, c: f[0] > 180 ? ROSSO : f[0] > 90 ? AMBRA : BLU }; });
  const vecchie = lib.slice().sort((a, b) => (b.giorni ?? 0) - (a.giorni ?? 0)).slice(0, 8);
  S.push(slide('Capitale fermo', `${eurC(k.v90)} fermi in auto libere da oltre 90 giorni`, `Valore a prezzo di vendita delle ${N(k.libere)} auto libere, per giorni dall'ingresso in stock. ${N(k.senzaPrezzo)} auto senza prezzo non entrano nel valore.`, `
<div class="col"><h3>Valore per anzianità</h3>${colonne(bande, { w: 560, h: 380, fmt: eurC, sotto: it => N(it.n) + ' auto' })}</div>
<div class="col"><h3>Le libere più vecchie</h3>${tabella(['Auto', '>In stock', '>Prezzo', 'AutoScout'], vecchie.map(c => [auto(c), `<b>${N(c.giorni)} gg</b>`, eur(c.prezzo), as && as.per.get(c.targa) ? pill(as.per.get(c.targa).giudizio) : '<span class="tg">non online</span>']))}</div>`));

  // velocita' di vendita
  const gruppi = (chiave, filtro = () => true) => {
    const m = new Map();
    tv.filter(x => filtro(x.c)).forEach(x => { const kk = chiave(x.c); if (kk) m.set(kk, (m.get(kk) || []).concat(x.g)); });
    return [...m.entries()].map(([l, a]) => ({ l, v: mediana(a), n: N(a.length) + ' vendite', q: a.length }));
  };
  const colV = v => (v <= 60 ? VERDE : v <= 120 ? BLU : v <= 180 ? AMBRA : ROSSO);
  const modelli = gruppi(nome).filter(x => x.q >= 5).sort((a, b) => a.v - b.v).slice(0, 12).map(x => ({ ...x, c: colV(x.v) }));
  const prezzi = FASCE_PREZZO.map(f => { const a = tv.filter(x => x.c.prezzo > 0 && fascia(FASCE_PREZZO, x.c.prezzo) === f).map(x => x.g); return { l: f[2], v: mediana(a) || 0, n: N(a.length) + ' vendite', q: a.length }; }).filter(x => x.q >= 3).map(x => ({ ...x, c: colV(x.v) }));
  const alim = gruppi(c => c.fuel).filter(x => x.q >= 5).sort((a, b) => a.v - b.v).map(x => ({ ...x, c: colV(x.v) }));
  S.push(slide('Velocità di vendita', 'Cosa si vende e in quanto tempo', `Giorni dall'ingresso in stock alla prenotazione (valore mediano) su ${N(tv.length)} prenotazioni; un'auto prenotata prima di arrivare conta 0 giorni. Verde fino a 60 giorni, blu fino a 120, arancio fino a 180, rosso oltre.`, `
<div class="col"><h3>Per modello (almeno 5 vendite)</h3>${barre(modelli, { w: 640, riga: 31, fmt: v => N(v) + ' gg', etW: 160 })}</div>
<div class="col s"><h3>Per fascia di prezzo</h3>${barre(prezzi, { w: 500, riga: 30, fmt: v => N(v) + ' gg', etW: 120 })}
<h3 style="margin-top:8px">Per alimentazione</h3>${barre(alim, { w: 500, riga: 30, fmt: v => N(v) + ' gg', etW: 120 })}</div>`));

  // prezzo contro il mercato
  if (as) {
    const conta = l => GIUDIZI.map(g => ({ l: g[1], v: l.filter(a => a && a.giudizio === g[0]).length, c: g[2] }));
    const libOnline = lib.map(c => as.per.get(c.targa)).filter(Boolean);
    const vecchie90 = lib.filter(c => (c.giorni ?? 0) >= 90).map(c => as.per.get(c.targa)).filter(Boolean);
    const care = lib.filter(c => (c.giorni ?? 0) >= 90 && caro(as.per.get(c.targa))).sort((a, b) => b.giorni - a.giorni).slice(0, 6);
    const qV = vecchie90.filter(caro).length / (vecchie90.length || 1), qT = libOnline.filter(caro).length / (libOnline.length || 1);
    const confronto = Math.abs(qV - qT) >= 0.05
      ? `<b>${pct(qV)}</b> delle auto ferme da oltre 90 giorni ha un prezzo sopra il mercato, contro il <b>${pct(qT)}</b> di tutte le libere online.`
      : `Le auto ferme da oltre 90 giorni non sono più care delle altre (<b>${pct(qV)}</b> sopra il mercato, come il ${pct(qT)} di tutte le libere online): il prezzo da solo non spiega il fermo, conta anche il modello.`;
    S.push(slide('Prezzo contro il mercato', 'Come AutoScout24 giudica i nostri prezzi', `AutoScout confronta ogni annuncio con auto simili in vendita in Italia. Su ${N(as.totale)} annunci di Valentino, aggiornati il ${dIt(as.aggiornato.slice(0, 10))}.`, `
<div class="col" style="gap:22px">
<div><h3 style="margin-bottom:10px">Tutti i nostri annunci</h3>${impilata(conta(as.tutti), { w: 1150 })}</div>
<div style="display:flex;gap:36px">
<div class="col s"><h3 style="margin-bottom:10px">Libere ferme da 90+ giorni (${N(vecchie90.length)} online)</h3>${impilata(conta(vecchie90), { w: 470, h: 30 })}
<p class="frase" style="margin-top:16px">${confronto}</p></div>
<div class="col"><h3>Ferme da 90+ giorni e giudicate care</h3>${tabella(['Auto', '>In stock', '>Prezzo', 'Giudizio'], care.map(c => [auto(c), N(c.giorni) + ' gg', eur(c.prezzo), pill(as.per.get(c.targa).giudizio)]), 'Nessuna.')}</div>
</div></div>`));

    // interesse dei clienti
    const bandeC = FASCE_ETA.map(f => { const l = lib.filter(c => (c.giorni ?? 0) >= f[0] && (c.giorni ?? 0) <= f[1]).map(c => as.per.get(c.targa)).filter(Boolean); const z = l.filter(a => a.contatti === 'Zero').length; return { l: f[2] + ' gg', v: l.length ? Math.round(100 * z / l.length) : 0, n: l.length, c: f[0] > 90 ? AMBRA : BLU }; });
    const fredde = lib.filter(c => (c.giorni ?? 0) >= 90 && (as.per.get(c.targa) || {}).contatti === 'Zero').sort((a, b) => b.giorni - a.giorni);
    const tutteZero = as.tutti.filter(a => a.contatti === 'Zero').length;
    S.push(slide('Interesse dei clienti', `Per AutoScout, il ${pct(tutteZero / (as.totale || 1))} dei nostri annunci non riceve contatti`, 'Indicatore pubblico di AutoScout24 sui contatti di ogni annuncio (nessuno o qualcuno), incrociato con l\'anzianità in stock. I numeri esatti sono nel pannello concessionario di AutoScout.', `
<div class="col"><h3>Auto libere senza contatti, per anzianità</h3>${colonne(bandeC, { w: 560, h: 360, fmt: v => v + '%', sotto: it => N(it.n) + ' online' })}</div>
<div class="col"><h3>Ferme da 90+ giorni e nessun contatto (${N(fredde.length)})</h3>${tabella(['Auto', '>In stock', '>Prezzo', 'Prezzo AS'], fredde.slice(0, 7).map(c => [auto(c), N(c.giorni) + ' gg', eur(c.prezzo), pill(as.per.get(c.targa).giudizio)]), 'Nessuna.')}</div>`));
  }

  // vetrina e preparazione
  const conPrezzo = lib.filter(c => c.prezzo > 0), pubblicate = conPrezzo.filter(online), conFoto = pubblicate.filter(c => c.web && c.web.foto && c.web.foto.length >= 5);
  const rip = cs.filter(c => c.st === 6), arrivo = cs.filter(c => c.st === 7);
  const bandeR = FASCE_ETA.map(f => ({ l: f[2] + ' gg', v: rip.filter(c => (c.giorni ?? 0) >= f[0] && (c.giorni ?? 0) <= f[1]).length, c: f[0] > 60 ? AMBRA : BLU })).filter(x => x.v);
  S.push(slide('Vetrina e preparazione', `${N(lib.length - pubblicate.length)} auto libere che nessun cliente può trovare`, 'Dalle auto libere a quelle davvero in vetrina; e le auto ancora in preparazione, per giorni dall\'ingresso in stock.', `
<div class="col"><h3>Dalle libere alla vetrina</h3>${imbuto([{ l: 'Auto libere', v: lib.length }, { l: 'Con prezzo', v: conPrezzo.length }, { l: 'Pubblicate online', v: pubblicate.length }, { l: 'Con almeno 5 foto', v: conFoto.length }], { w: 600 })}
<div class="card"><p class="frase">Le ${N(lib.length - pubblicate.length)} auto libere non in vetrina sono in stock da <b>${N(mediana(lib.filter(c => !(c.prezzo > 0 && online(c))).map(c => c.giorni ?? 0)))} giorni</b> (mediana); quelle già prezzate valgono <b>${eurC(lib.filter(c => c.prezzo > 0 && !online(c)).reduce((s, c) => s + c.prezzo, 0))}</b>, e ${N(lib.filter(c => !c.prezzo).length)} non hanno ancora un prezzo.</p></div></div>
<div class="col s"><div class="tiles t2">${tile(N(rip.length), 'in riparazione')}${tile(N(arrivo.length), 'in arrivo')}</div>
<h3>In riparazione, per giorni in stock</h3>${barre(bandeR, { w: 470, riga: 32, etW: 110, fmt: v => N(v) + ' auto' })}
<p class="nota">I giorni contano dall'ingresso in stock: un'auto in riparazione da molto è capitale che non si può ancora vendere.</p></div>`));

  // ribassi e prenotazioni saltate
  const { rib, dis } = A.ev, chiusi = rib.filter(r => r.esito && r.esito.tipo === 'prenotata');
  const pren = A.per.prenotate.length;
  S.push(slide('Ribassi e prenotazioni saltate', 'Quanto funzionano i ribassi', `Dalle stampe dal ${dIt(snap[0].meta.day)}: ogni ribasso è seguito fino alla prenotazione. Le misure diventano affidabili dopo qualche settimana di storico.`, `
<div class="col"><div class="tiles">${tile(N(rib.length), 'ribassi osservati')}${tile(N(chiusi.length), 'prenotate dopo il ribasso', chiusi.length ? `in ${N(mediana(chiusi.map(r => r.esito.giorni)))} giorni (mediana)` : '')}${tile(rib.length ? pct(mediana(rib.map(r => (r.era - r.c.prezzo) / r.era))) : '—', 'ribasso tipico')}</div>
<h3>Ultimi ribassi e come è andata</h3>${tabella(['Auto', '>Da', '>A', 'Esito'], rib.slice(-6).reverse().map(r => [auto(r.c), eur(r.era), eur(r.c.prezzo), r.esito ? (r.esito.tipo === 'prenotata' ? `<b style="color:${VERDE}">prenotata dopo ${N(r.esito.giorni)} gg</b>` : 'uscita dallo stock') : `ancora libera (${N(gg(r.day, A.cur.meta.day))} gg)`]), 'Nessun ribasso nel periodo.')}</div>
<div class="col s"><div class="tiles t2">${tile(N(dis.length), 'prenotazioni saltate')}${tile(pren ? pct(dis.length / pren) : '—', 'sul totale delle nuove prenotazioni')}</div>
<h3>Ultime prenotazioni saltate</h3>${tabella(['Auto', 'Quando', '>Prezzo'], dis.slice(-6).reverse().map(d => [auto(d.c), dCorto(d.day), eur(d.c.prezzo)]), 'Nessuna nel periodo.')}</div>`));

  // i tuoi numeri
  const miei = cs.filter(c => c.booked && c.vend === IO_NOME), venditori = new Set(cs.filter(c => c.booked && c.vend).map(c => c.vend));
  const mieiTv = tv.filter(x => x.c.vend === IO_NOME).map(x => x.g), mediaV = cs.filter(c => c.booked && c.vend).length / (venditori.size || 1);
  const nuoviMiei = A.per.prenotate.filter(c => c.vend === IO_NOME);
  S.push(slide('I tuoi numeri', 'Le tue prenotazioni in corso', `Auto prenotate a tuo nome nella stampa di oggi, confrontate con la media dei ${N(venditori.size)} venditori che hanno prenotazioni in stock.`, `
<div class="col s"><div class="tiles t2">
${tile(N(miei.length), 'prenotazioni in corso', `media per venditore: ${mediaV.toLocaleString('it-IT', { maximumFractionDigits: 1 })}`, 'forte')}
${tile(eurC(miei.reduce((s, c) => s + (c.prezzo || 0), 0)), 'valore delle tue prenotazioni')}
${tile(mieiTv.length ? N(mediana(mieiTv)) + ' gg' : '—', 'giorni in stock delle auto che vendi', medV != null ? `media di tutti: ${N(medV)} gg` : '')}
${tile(N(nuoviMiei.length), `nuove dal ${dIt(snap[0].meta.day)}`, `su ${N(A.per.prenotate.length)} di tutto il salone`)}
${tile(pct(miei.length / (cs.filter(c => c.booked && c.vend).length || 1)), 'delle prenotazioni in stock sono tue', `quota media per venditore: ${pct(1 / (venditori.size || 1))}`)}
${tile(miei.length ? eur(miei.reduce((s, c) => s + (c.prezzo || 0), 0) / miei.length) : '—', 'valore medio delle tue auto', `media di tutti: ${eur(cs.filter(c => c.booked && c.vend).reduce((s, c) => s + (c.prezzo || 0), 0) / (cs.filter(c => c.booked && c.vend).length || 1))}`)}
</div></div>
<div class="col"><h3>Le tue prenotazioni</h3>${tabella(['Auto', 'Prenotata', '>Prezzo', 'Pagamento'], miei.sort((a, b) => (b.dataPren || '').localeCompare(a.dataPren || '')).slice(0, 8).map(c => [auto(c), c.dataPren ? dIt(c.dataPren) : '—', eur(c.prezzo), esc(c.modVen || '—')]), 'Nessuna prenotazione a tuo nome.')}</div>`));

  S.push(azioni(A));
  return { slide: S, A };
}

function azioni(A) {
  const { lib, as } = A;
  const daPrezzare = lib.filter(c => !c.prezzo).sort((a, b) => b.giorni - a.giorni);
  const daPubblicare = lib.filter(c => c.prezzo > 0 && !online(c)).sort((a, b) => b.giorni - a.giorni);
  const daRivedere = as ? lib.filter(c => (c.giorni ?? 0) >= 90 && caro(as.per.get(c.targa))).sort((a, b) => b.giorni - a.giorni) : [];
  const lista = (l, extra) => '<div class="az">' + tabella(['Auto', '>In stock'], l.slice(0, extra ? 6 : 7).map(c => [auto(c) + (extra ? `<div style="margin-top:3px">${extra(c)}</div>` : ''), N(c.giorni) + ' gg']), 'Niente da fare qui.') + '</div>';
  return slide('Azioni consigliate', 'Da dove partire', 'Le auto libere più vecchie in ciascun gruppo. L\'elenco completo è nello stock online.', `
<div class="col"><h3>Da prezzare (${N(daPrezzare.length)})</h3>${lista(daPrezzare)}</div>
<div class="col"><h3>Con prezzo, da pubblicare (${N(daPubblicare.length)})</h3>${lista(daPubblicare, c => `<span class="tg">${eur(c.prezzo)}</span>`)}</div>
<div class="col"><h3>90+ giorni e sopra mercato (${N(daRivedere.length)})</h3>${lista(daRivedere, c => { const a = as.per.get(c.targa); return `${pill(a.giudizio)} <span class="tg">${eur(c.prezzo)}${a.contatti === 'Zero' ? ' · nessun contatto' : ''}</span>`; })}</div>`);
}

/* ---------------- riepilogo settimanale ---------------- */
function settimanale(tutte) {
  const fine = tutte[tutte.length - 1].meta.day;
  const da = new Date(data(fine) - 7 * 864e5).toISOString().slice(0, 10);
  // la stampa di partenza e' l'ultima di 7 giorni fa (o la prima disponibile)
  let i0 = 0;
  tutte.forEach((d, i) => { if (d.meta.day <= da) i0 = i; });
  const snap = tutte.slice(i0), A = analisi(tutte), P = movimentiPeriodo(snap);
  const k0 = kpi(snap[0]), k1 = kpi(snap[snap.length - 1]), S = [];
  const serie = f => snap.map(d => ({ d: d.meta.day, v: f(kpi(d)) }));
  const tvSett = tempiVendita(snap).filter(x => x.quando > snap[0].meta.day);

  S.push(copertina('Stock usato<br>la settimana', `dal ${dIt(snap[0].meta.day)} al ${dIt(fine)}`, [
    [N(P.prenotate.length), 'nuove prenotazioni'], [N(P.entrate.length), 'auto entrate'], [N(P.uscite.length), 'auto uscite'], [N(P.ribassi.length), 'prezzi abbassati']
  ], 'Riepilogo settimanale'));

  const riga = (l, a, b, o = {}) => [l, (o.fmt || N)(a), `<b>${(o.fmt || N)(b)}</b>`, delta(b, a, o)];
  S.push(slide('La settimana in numeri', `Da ${dCorto(snap[0].meta.day)} a ${dCorto(fine)}: come è cambiato lo stock`, '', `
<div class="col">${tabella(['Indicatore', '>' + dCorto(snap[0].meta.day), '>' + dCorto(fine), '>Variazione'], [
    riga('Auto in stock', k0.tot, k1.tot, { meglioSu: false }), riga('Auto libere', k0.libere, k1.libere, { meglioSu: false }),
    riga('Valore stock libero', k0.valore, k1.valore, { meglioSu: false, fmt: eurC }), riga('Pronte da vendere', k0.vendibili, k1.vendibili),
    riga('Libere da oltre 90 giorni', k0.f90, k1.f90, { meglioSu: false }), riga('Capitale fermo da 90+ giorni', k0.v90, k1.v90, { meglioSu: false, fmt: eurC }),
    riga('Libere da oltre 180 giorni', k0.f180, k1.f180, { meglioSu: false }), riga('Libere senza prezzo', k0.senzaPrezzo, k1.senzaPrezzo, { meglioSu: false }),
    riga('Con prezzo ma non pubblicate', k0.nonOnline, k1.nonOnline, { meglioSu: false }), riga('Prenotate in stock', k0.prenotate, k1.prenotate),
    riga('In riparazione', k0.rip, k1.rip, { meglioSu: false }), riga('In arrivo', k0.arrivo, k1.arrivo)
  ].map(r => r.map((x, i) => (i ? x : `<b>${x}</b>`))))}</div>
<div class="col s"><h3>In breve</h3><ol class="punti">${[
    `<b>${N(P.prenotate.length)} nuove prenotazioni</b> in ${N(snap.length - 1)} giorni lavorativi${P.disdette.length ? `, ${N(P.disdette.length)} saltate` : ''}.`,
    `Entrate <b>${N(P.entrate.length)}</b> auto e uscite <b>${N(P.uscite.length)}</b>: lo stock è ${k1.tot > k0.tot ? 'cresciuto' : k1.tot < k0.tot ? 'calato' : 'stabile'} di ${N(Math.abs(k1.tot - k0.tot))}.`,
    `<b>${N(P.passate90.length)} auto</b> hanno superato i 90 giorni in stock questa settimana${P.passate180.length ? `, ${N(P.passate180.length)} i 180` : ''}.`,
    tvSett.length ? `Le auto prenotate questa settimana erano in stock da <b>${N(mediana(tvSett.map(x => x.g)))} giorni</b> (mediana).` : ''
  ].filter(Boolean).map(m => `<li><span>${m}</span></li>`).join('')}</ol></div>`));

  const nuovePerGiorno = P.giorni.map(m => ({ d: m.a, v: m.prenotate.length }));
  const scheda = (t, s, fmt, col, meglioSu) => `<div class="card"><div class="testa"><h3>${t}</h3><span class="tot">${fmt(s[0].v)} → <b>${fmt(s[s.length - 1].v)}</b> ${delta(s[s.length - 1].v, s[0].v, { meglioSu, fmt }).replace('= ieri', '=')}</span></div>${linea(s, { w: 520, h: 165, fmt, colore: col })}</div>`;
  S.push(slide('Andamento', 'Giorno per giorno', 'Una stampa per giorno lavorativo.', `
<div class="col">${scheda('Auto libere', serie(x => x.libere), N, BLU, false)}${scheda('Capitale fermo da 90+ giorni', serie(x => x.v90), eurC, AMBRA, false)}</div>
<div class="col">${scheda('Valore stock libero', serie(x => x.valore), eurC, BLU, false)}<div class="card"><div class="testa"><h3>Nuove prenotazioni al giorno</h3><span class="tot">${N(P.prenotate.length)} in settimana</span></div>${colonne(nuovePerGiorno.map(x => ({ l: dCorto(x.d), v: x.v, c: VERDE })), { w: 520, h: 165 })}</div></div>`));

  // cosa si e' venduto
  const perModello = new Map();
  P.prenotate.forEach(c => perModello.set(nome(c), (perModello.get(nome(c)) || 0) + 1));
  const top = [...perModello.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([l, v]) => ({ l, v, c: BLU }));
  const perFascia = FASCE_PREZZO.map(f => ({ l: f[2], v: P.prenotate.filter(c => c.prezzo > 0 && fascia(FASCE_PREZZO, c.prezzo) === f).length, c: BLU })).filter(x => x.v);
  S.push(slide('Cosa si è venduto', `${N(P.prenotate.length)} prenotazioni in settimana`, 'Prenotazioni nuove apparse nelle stampe della settimana, per modello e fascia di prezzo.', `
<div class="col"><h3>Per modello</h3>${barre(top, { w: 600, riga: 31, etW: 170 })}</div>
<div class="col s"><h3>Per fascia di prezzo</h3>${barre(perFascia, { w: 470, riga: 32, etW: 120 })}
${tvSett.length ? `<div class="card" style="margin-top:8px"><div class="grande">${N(mediana(tvSett.map(x => x.g)))} gg</div><p class="frase" style="margin-top:8px">tempo mediano in stock delle auto prenotate in settimana, su ${N(tvSett.length)} con data di prenotazione.</p></div>` : ''}</div>`));

  // stock che invecchia
  const libere = new Set(A.lib.map(c => c.targa));
  const p90 = P.passate90.filter(c => libere.has(c.targa)).sort((a, b) => (b.prezzo || 0) - (a.prezzo || 0));
  const p180 = P.passate180.filter(c => libere.has(c.targa));
  const perNome = l => { const m = new Map(); l.forEach(c => m.set(nome(c), (m.get(nome(c)) || 0) + 1)); return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v })); };
  S.push(slide('Stock che invecchia', `${N(p90.length)} auto libere hanno superato i 90 giorni questa settimana`, 'Sono le auto da spingere subito, prima che diventino difficili da vendere.', `
<div class="col"><div class="tiles t2">${tile(N(p90.length), 'libere che hanno passato i 90 giorni', `valgono ${eurC(p90.reduce((s, c) => s + (c.prezzo || 0), 0))}`, 'allerta')}${tile(N(p180.length), 'libere che hanno passato i 180 giorni', `valgono ${eurC(p180.reduce((s, c) => s + (c.prezzo || 0), 0))}`, 'allerta')}</div>
<h3>Per modello</h3>${barre(perNome(p90).slice(0, 7), { w: 520, riga: 30, etW: 170, colore: AMBRA })}</div>
<div class="col"><h3>Le auto</h3>${tabella(['Auto', '>In stock', '>Prezzo', 'AutoScout'], p90.slice(0, 9).map(c => [auto(c), N(c.giorni) + ' gg', eur(c.prezzo), A.as && A.as.per.get(c.targa) ? pill(A.as.per.get(c.targa).giudizio) : '<span class="tg">non online</span>']), 'Nessuna questa settimana.')}</div>`));

  S.push(azioni(A));
  return { slide: S, A, da: snap[0].meta.day, a: fine, P };
}

/* ---------------- stampa ---------------- */
function documento(titolo, slides, fonte) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>${esc(titolo)}</title><style>${CSS}</style></head><body>${slides.map((s, i) => s.html(i + 1, fonte)).join('\n')}</body></html>`;
}

async function stampa(lavori) {
  const puppeteer = require(path.join(root, 'video', 'node_modules', 'puppeteer-core'));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--force-color-profile=srgb'] });
  try {
    for (const l of lavori) {
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
      await page.goto('file:///' + l.html.replace(/\\/g, '/'), { waitUntil: 'load' });
      await page.pdf({ path: l.pdf, width: '1280px', height: '720px', printBackground: true, preferCSSPageSize: true });
      if (args.includes('--immagini')) {
        const el = await page.$$('section');
        for (let i = 0; i < el.length; i++) await el[i].screenshot({ path: l.pdf.replace(/\.pdf$/, `-${String(i + 1).padStart(2, '0')}.png`) });
      }
      await page.close();
    }
  } finally { await browser.close(); }
}

function mail(A, titolo, file, extra) {
  const { k, kp } = A;
  const box = (v, l) => `<td style="padding:12px 14px;background:#ffffff;border-radius:12px"><div style="font-size:22px;font-weight:700;color:${NAVY}">${v}</div><div style="font-size:12px;color:${GRIGIO}">${l}</div></td>`;
  const corpo = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7">
<div style="max-width:640px;margin:0 auto;padding:20px 14px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:${NAVY};font-size:14px;line-height:1.5">
<div style="font-size:12px;color:${GRIGIO};margin-bottom:6px">Solo per te · Gestore stock usato</div>
<h1 style="font-size:21px;margin:0 0 14px">${esc(titolo)}</h1>
<table role="presentation" cellpadding="0" cellspacing="6" style="width:100%"><tr>${box(N(k.libere), 'auto libere')}${box(eurC(k.valore), 'valore libero')}${box(N(k.f90), 'ferme da 90+ giorni')}</tr></table>
<ol style="padding-left:20px;margin:16px 0">${messaggi(A).map(m => `<li style="margin-bottom:8px">${m}</li>`).join('')}</ol>
${extra || ''}
<p style="margin-top:16px">In allegato la presentazione completa${file.length > 1 ? ' e il riepilogo della settimana' : ''}, pronta da mostrare.</p>
<p style="margin-top:22px;font-size:12px;color:${GRIGIO}">Preparato dall'agente dello stock${kp ? ` · confronto con la stampa del ${dIt(kp.day)}` : ''}. <a href="${APP}?vista=venditore" style="color:${BLU}">Apri lo stock</a></p>
</div></body></html>`;
  const f = path.join(__dirname, 'posta-da-inviare.json'), coda = leggi(f, []);
  coda.push({ to: IO, subject: titolo, html: corpo, allegati: file });
  fs.writeFileSync(f, JSON.stringify(coda, null, 1));
}

async function main() {
  const snap = fotografie();
  if (!snap.length) throw new Error('Nessuna stampa dello stock trovata.');
  const day = snap[snap.length - 1].meta.day;
  const settimana = args.includes('--settimana') || data(day).getDay() === 1;
  fs.mkdirSync(OUT, { recursive: true });
  const fonte = `Fonti: stampa stock del ${dIt(day)}, valentinoautomobili.it, AutoScout24`;
  const lavori = [], dG = giornaliera(snap);
  const base = path.join(OUT, `Stock usato - rapporto ${day.split('-').reverse().join('-')}`);
  fs.writeFileSync(base + '.html', documento(`Stock usato - rapporto del ${dIt(day)}`, dG.slide, fonte));
  lavori.push({ html: base + '.html', pdf: base + '.pdf' });
  let dS = null;
  if (settimana) {
    dS = settimanale(snap);
    const bs = path.join(OUT, `Stock usato - settimana ${dS.da.split('-').reverse().join('-')} al ${dS.a.split('-').reverse().join('-')}`);
    fs.writeFileSync(bs + '.html', documento('Stock usato - riepilogo settimanale', dS.slide, fonte));
    lavori.push({ html: bs + '.html', pdf: bs + '.pdf' });
  }
  await stampa(lavori);
  // tengo gli ultimi 60 file
  fs.readdirSync(OUT).map(f => path.join(OUT, f)).sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs).slice(120).forEach(f => fs.rmSync(f, { force: true }));
  if (!args.includes('--non-inviare')) {
    const t = `Rapporto stock ${dCorto(day)}: ${N(dG.A.k.f90)} ferme da 90+ giorni, ${eurC(dG.A.k.v90)} di capitale fermo`;
    mail(dG.A, settimana ? `Settimana ${dCorto(dS.da)}–${dCorto(dS.a)}: ${N(dS.P.prenotate.length)} prenotazioni, ${N(dS.P.entrate.length)} entrate · ${t.replace(/^Rapporto stock \S+: /, '')}` : t, lavori.map(l => l.pdf));
  }
  console.log(`Rapporto pronto: ${lavori.map(l => path.basename(l.pdf)).join(', ')}.`);
}

main().catch(e => { console.error('Rapporto non riuscito: ' + e.message); process.exit(1); });
