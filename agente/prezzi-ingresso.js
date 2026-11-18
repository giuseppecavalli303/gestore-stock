// Prezzi di ingresso delle auto libere senza prezzo, in PDF solo per Giuseppe (dati riservati: mai sul sito).
// I dati si leggono a mano da CROSS Sales (F6 + numero pratica: accordo di ritiro, fattura vettura, righe OFF-Fattura d'entrata)
// e stanno in agente/cross-ingresso.json, escluso dal repo. Formato: [{ targa, prat, ritiro, fattura|null, off: [[fornitore, importo]] }]
// Importi IVA compresa: fattura vettura se c'e' (VTI/estero), altrimenti ritiro (privati/permute); fatture OFF come in CROSS.
// Le auto a prezzo speciale (c.spec) si vendono cosi' come sono: niente carrozzeria, ed e' normale.
// Uso: node agente/prezzi-ingresso.js   ->   agente/rapporti/Prezzi di ingresso GG-MM-AAAA.pdf
const fs = require('fs'), path = require('path');
const { stampaPdf } = require('./stampa-pdf');
const root = path.join(__dirname, '..');
const s = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stock.json'), 'utf8').replace(/^﻿/, ''));
const letti = new Map(JSON.parse(fs.readFileSync(path.join(__dirname, 'cross-ingresso.json'), 'utf8')).map(x => [x.targa, x]));
const day = s.meta.day, dIt = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const N = n => Math.round(n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
const E = n => N(n) + ' €';

const CARROZZERIE = /croce autogroup|corvaglia|carrozzeria|autocentri/i;
// tutti gli importi IVA compresa, come li mostra CROSS: acquisto = fattura della vettura se c'e' (VTI/estero con IVA),
// altrimenti il ritiro (privati/permute, senza IVA da aggiungere); fatture OFF cosi' come registrate
const auto = s.cars.filter(c => c.free && !c.prezzo).map(c => {
  const l = letti.get(c.targa) || { off: [] };
  const acq = l.fattura || l.ritiro || 0;
  const carr = l.off.filter(([n]) => CARROZZERIE.test(n)), altri = l.off.filter(([n]) => !CARROZZERIE.test(n));
  const cN = carr.reduce((t, [, v]) => t + v, 0), aN = altri.reduce((t, [, v]) => t + v, 0);
  return { c, l, acq, carr, altri, cN, aN, tot: acq + cN + aN };
});

const gruppo = c => { const x = (c.section || '').toUpperCase(); return /REMARKETING|RMKT/.test(x) ? 'Remarketing' : /^VTI/.test(x) ? 'VTI (vetture aziendali)' : 'Stock Valentino'; };
const ORDINE = ['Stock Valentino', 'Remarketing', 'VTI (vetture aziendali)'];
const box = (n, t) => `<div class="box"><b>${n}</b><span>${t}</span></div>`;
const conCarr = auto.filter(a => a.cN > 0), spec = auto.filter(a => a.c.spec);
const daFare = auto.filter(a => !a.cN && !a.c.spec);
const totAcq = auto.reduce((t, a) => t + a.acq, 0), totCarr = conCarr.reduce((t, a) => t + a.cN, 0);

let n = 0;
const sezioni = ORDINE.map(g => {
  const lista = auto.filter(a => gruppo(a.c) === g).sort((x, y) => (y.c.giorni || 0) - (x.c.giorni || 0));
  if (!lista.length) return '';
  const righe = lista.map(({ c, l, acq, carr, altri, cN, aN, tot }) => {
    const imp = l.fattura && l.fattura - l.ritiro > 1;
    const orig = imp ? `<br><small>fattura con IVA · netto ${E(l.ritiro)}</small>` : '';
    const nomi = arr => arr.map(([nm]) => esc(nm.replace(/ \(.*\)$/, '').replace('Valentino Automobili', 'officina interna'))).join(', ');
    const vuota = c.spec ? '<span class="ps">prezzo speciale<br>così com\'è</span>' : '<small>nessuna fattura in CROSS</small>';
    return `<tr class="${(c.giorni || 0) >= 90 ? 'vecchia' : (c.giorni || 0) >= 60 ? 'media' : ''}">
    <td class="n">${++n}</td><td class="t">${esc(c.targa)}${c.spec ? '<br><span class="ps">PREZZO SPECIALE</span>' : ''}</td>
    <td><b>${esc(c.brand)} ${esc(c.family)}</b><br><small>${esc(c.modello)}</small></td>
    <td>${esc(c.imm ? c.imm.slice(5, 7) + '/' + c.imm.slice(0, 4) : '')}<br><small>${c.km ? N(c.km) + ' km' : ''}</small></td>
    <td class="r g">${c.giorni ?? ''}</td>
    <td class="r">${acq ? E(acq) : '<small>non trovato</small>'}${orig}</td>
    <td class="r">${cN ? E(cN) + `<br><small>${nomi(carr)}</small>` : vuota}</td>
    <td class="r">${aN ? E(aN) + `<br><small>${nomi(altri)}</small>` : ''}</td>
    <td class="r tot">${E(tot)}</td></tr>`;
  }).join('');
  return `<h2>${g} <span>${lista.length}</span></h2>
  <table><thead><tr><th>#</th><th>Targa</th><th>Auto</th><th>Immatr.</th><th class="r">Giorni</th><th class="r">Acquisto</th><th class="r">Ripristino carrozzeria</th><th class="r">Altri lavori</th><th class="r">Totale ingresso</th></tr></thead><tbody>${righe}</tbody></table>`;
}).join('');

// casella a parte: solo le auto passate in carrozzeria, con il costo di ripristino
const carrLista = conCarr.slice().sort((x, y) => y.cN - x.cN || (y.c.giorni || 0) - (x.c.giorni || 0));
const perFornitore = {};
carrLista.forEach(a => a.carr.forEach(([nm, v]) => { const k = nm.replace(/ \(.*\)$/, ''); perFornitore[k] = perFornitore[k] || { n: 0, t: 0 }; perFornitore[k].n++; perFornitore[k].t += v; }));
const casella = `<div class="casella">
<h2 style="margin-top:0">Auto passate in carrozzeria <span>${carrLista.length}</span></h2>
<p class="note" style="margin:0 0 6px">Costo di ripristino carrozzeria IVA compresa, dal più alto. Totale ${E(totCarr)} · media ${E(totCarr / carrLista.length)} · ${Object.entries(perFornitore).sort((a, b) => b[1].t - a[1].t).map(([k, v]) => `${esc(k)}: ${v.n} auto, ${E(v.t)}`).join(' · ')}</p>
<table><thead><tr><th>#</th><th>Targa</th><th>Auto</th><th>Carrozzeria</th><th class="r">Giorni</th><th class="r">Acquisto</th><th class="r">Ripristino carrozzeria</th><th class="r">Incidenza sull'acquisto</th></tr></thead><tbody>
${carrLista.map((a, i) => `<tr><td class="n">${i + 1}</td><td class="t">${esc(a.c.targa)}</td><td><b>${esc(a.c.brand)} ${esc(a.c.family)}</b> <small>${esc(a.c.imm ? a.c.imm.slice(0, 4) : '')}${a.c.km ? ' · ' + N(a.c.km) + ' km' : ''}</small></td><td>${a.carr.map(([nm]) => esc(nm.replace(/ \(.*\)$/, ''))).join(', ')}</td><td class="r">${a.c.giorni ?? ''}</td><td class="r">${E(a.acq)}</td><td class="r tot">${E(a.cN)}</td><td class="r">${(a.cN / a.acq * 100).toFixed(1).replace('.', ',')}%</td></tr>`).join('')}
<tr class="somma"><td></td><td colspan="5"><b>Totale ${carrLista.length} auto</b></td><td class="r tot">${E(totCarr)}</td><td></td></tr>
</tbody></table></div>`;

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Prezzi di ingresso ${dIt(day)}</title><style>
@page { size: A4 landscape; }
body { font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #0c1a2b; font-size: 10.5px; margin: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0c1a2b; padding-bottom: 6px; }
h1 { font-size: 20px; margin: 0; } .sub { color: #5b6b80; font-size: 11px; }
.boxes { display: flex; gap: 8px; margin: 10px 0 4px; flex-wrap: wrap; }
.box { background: #eef2f7; border-radius: 6px; padding: 6px 10px; min-width: 110px; }
.box b { display: block; font-size: 17px; } .box span { color: #44556a; font-size: 10px; }
.note { color: #44556a; font-size: 10px; margin: 6px 0 0; line-height: 1.5; }
h2 { font-size: 14px; margin: 16px 0 4px; break-after: avoid; } h2 span { background: #0c1a2b; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 11px; margin-left: 4px; }
table { width: 100%; border-collapse: collapse; } thead { display: table-header-group; }
th { text-align: left; font-size: 9.5px; color: #5b6b80; border-bottom: 2px solid #0c1a2b; padding: 4px 5px; }
td { border-bottom: 1px solid #dde3ea; padding: 4px 5px; vertical-align: top; } tr { break-inside: avoid; }
small { color: #5b6b80; font-size: 9px; }
.r { text-align: right; } .n { color: #8a97a8; width: 18px; } .t { font-weight: 700; white-space: nowrap; } .g { font-weight: 700; }
.tot { font-weight: 700; font-size: 11.5px; }
.casella { break-before: page; border: 2px solid #0c1a2b; border-radius: 8px; padding: 10px 12px; }
tr.somma td { border-top: 2px solid #0c1a2b; border-bottom: none; }
.ps { display: inline-block; background: #0a5cf5; color: #fff; border-radius: 4px; padding: 1px 5px; font-size: 8.5px; font-weight: 700; line-height: 1.3; }
tr.media td.g { color: #a35a00; } tr.vecchia td.g { color: #b3261e; } tr.vecchia { background: #fdf1f0; } tr.media { background: #fff8ec; }
</style></head><body>
<div class="top"><div><h1>Prezzi di ingresso · auto libere senza prezzo</h1><div class="sub">Stampa stock del ${dIt(day)} · ritiro e costi letti dalle pratiche CROSS · riservato</div></div>
<div class="sub">Valentino Automobili · Usato</div></div>
<div class="boxes">${box(auto.length, 'auto')}${box(E(totAcq / auto.length), 'acquisto medio (IVA compresa)')}${box(conCarr.length, 'con ripristino carrozzeria')}${box(E(conCarr.length ? totCarr / conCarr.length : 0), 'carrozzeria media (IVA compresa)')}${box(spec.length, 'a prezzo speciale, così come sono')}${box(daFare.length, 'senza carrozzeria e non a prezzo speciale')}</div>
<p class="note">Tutti gli importi sono <b>IVA compresa</b>, come in CROSS. <b>Acquisto</b>: per le auto VTI ed estero è la fattura d'acquisto con IVA (sotto c'è il netto); per privati e permute è il prezzo di ritiro, che non ha IVA. <b>Ripristino carrozzeria</b>: fatture OFF di Croce Autogroup, Corvaglia e altre carrozzerie. <b>Altri lavori</b>: officina interna e altri fornitori. Le auto a <b>prezzo speciale</b> si vendono così come sono e in carrozzeria non vanno: per loro l'assenza di fatture è normale. Contano solo le fatture già registrate in pratica. Ogni gruppo è ordinato dalle più vecchie in stock; in rosso 90 giorni o più, in giallo 60-89.</p>
${sezioni}
${casella}
</body></html>`;
const dir = path.join(__dirname, 'rapporti'); fs.mkdirSync(dir, { recursive: true });
const fileHtml = path.join(dir, 'prezzi-ingresso.html'), filePdf = path.join(dir, `Prezzi di ingresso ${dIt(day).replace(/\//g, '-')}.pdf`);
fs.writeFileSync(fileHtml, html);
stampaPdf(fileHtml, filePdf).then(() => console.log(`${auto.length} auto, ${auto.filter(a => !a.l.ritiro).length} senza dati CROSS -> ${filePdf}`)).catch(e => { console.error(e.message); process.exit(1); });
