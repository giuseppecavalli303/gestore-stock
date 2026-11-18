// Elenco delle auto libere senza prezzo (dall'ultima stampa pubblicata), in PDF per Giuseppe.
// Uso: node agente/libere-senza-prezzo.js   ->   agente/rapporti/Libere senza prezzo GG-MM-AAAA.pdf (cartella fuori dal repo pubblico)
const fs = require('fs'), path = require('path');
const { stampaPdf } = require('./stampa-pdf');
const root = path.join(__dirname, '..');
const s = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stock.json'), 'utf8').replace(/^﻿/, ''));
const day = s.meta.day, dIt = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const N = n => Math.round(n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
const auto = s.cars.filter(c => c.free && !c.prezzo);

const gruppo = c => {
  const x = (c.section || '').toUpperCase();
  if (/REMARKETING|RMKT/.test(x)) return 'Remarketing';
  if (/^VTI/.test(x)) return 'VTI (vetture aziendali)';
  return 'Stock Valentino';
};
const ORDINE = ['Stock Valentino', 'Remarketing', 'VTI (vetture aziendali)'];
const fascia = g => (g >= 90 ? 'vecchia' : g >= 60 ? 'media' : '');

const conta = f => { const m = {}; auto.forEach(c => { const k = f(c); m[k] = (m[k] || 0) + 1; }); return m; };
const perGruppo = conta(gruppo), perSede = conta(c => c.ubic || '—');
const oltre60 = auto.filter(c => (c.giorni || 0) >= 60).length, oltre90 = auto.filter(c => (c.giorni || 0) >= 90).length;
const box = (n, t) => `<div class="box"><b>${n}</b><span>${t}</span></div>`;

let n = 0;
const sezioni = ORDINE.filter(g => perGruppo[g]).map(g => {
  const lista = auto.filter(c => gruppo(c) === g).sort((a, b) => (b.giorni || 0) - (a.giorni || 0));
  const righe = lista.map(c => `<tr class="${fascia(c.giorni || 0)}">
    <td class="n">${++n}</td>
    <td class="t">${esc(c.targa)}</td>
    <td><b>${esc(c.brand)} ${esc(c.family)}</b><br><small>${esc(c.modello)}</small></td>
    <td>${esc(c.imm ? c.imm.slice(5, 7) + '/' + c.imm.slice(0, 4) : '')}</td>
    <td class="r">${c.km ? N(c.km) : ''}</td>
    <td>${esc(c.fuel || '')}<br><small>${esc(c.cambio || '')}</small></td>
    <td>${esc(c.colore || '')}</td>
    <td>${esc(c.ubic || '')}</td>
    <td class="r g">${c.giorni ?? ''}</td>
    <td><small>${esc(c.section || '')}</small></td>
    <td class="spazio"></td></tr>`).join('');
  return `<h2>${g} <span>${lista.length}</span></h2>
  <table><thead><tr><th>#</th><th>Targa</th><th>Auto</th><th>Immatr.</th><th class="r">Km</th><th>Alim. / cambio</th><th>Colore</th><th>Ubicazione</th><th class="r">Giorni</th><th>Sezione</th><th>Prezzo da inserire</th></tr></thead><tbody>${righe}</tbody></table>`;
}).join('');

const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Libere senza prezzo ${dIt(day)}</title><style>
@page { size: A4 landscape; }
body { font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #0c1a2b; font-size: 10.5px; margin: 0; }
.top { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #0c1a2b; padding-bottom: 6px; }
h1 { font-size: 20px; margin: 0; } .sub { color: #5b6b80; font-size: 11px; }
.boxes { display: flex; gap: 8px; margin: 10px 0 4px; flex-wrap: wrap; }
.box { background: #eef2f7; border-radius: 6px; padding: 6px 10px; min-width: 90px; }
.box b { display: block; font-size: 17px; } .box span { color: #44556a; font-size: 10px; }
.legenda { color: #44556a; font-size: 10px; margin: 6px 0 0; }
.legenda i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: -1px; margin: 0 3px 0 8px; }
h2 { font-size: 14px; margin: 16px 0 4px; break-after: avoid; } h2 span { background: #0c1a2b; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 11px; margin-left: 4px; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
th { text-align: left; font-size: 9.5px; color: #5b6b80; border-bottom: 2px solid #0c1a2b; padding: 4px 5px; }
td { border-bottom: 1px solid #dde3ea; padding: 4px 5px; vertical-align: top; }
tr { break-inside: avoid; }
small { color: #5b6b80; font-size: 9px; }
.r { text-align: right; } .n { color: #8a97a8; width: 18px; } .t { font-weight: 700; white-space: nowrap; }
.g { font-weight: 700; }
tr.media td.g { color: #a35a00; } tr.vecchia td.g { color: #b3261e; }
tr.vecchia { background: #fdf1f0; } tr.media { background: #fff8ec; }
.spazio { width: 95px; border-bottom: 1px solid #8a97a8; }
.piede { margin-top: 14px; color: #5b6b80; font-size: 9.5px; }
</style></head><body>
<div class="top"><div><h1>Auto libere senza prezzo</h1><div class="sub">Stampa stock del ${dIt(day)} · in vendita nel gestionale ma senza prezzo inserito</div></div>
<div class="sub">Valentino Automobili · Usato</div></div>
<div class="boxes">${box(auto.length, 'auto in totale')}${ORDINE.filter(g => perGruppo[g]).map(g => box(perGruppo[g], g)).join('')}${box(oltre60, 'ferme da 60+ giorni')}${box(oltre90, 'ferme da 90+ giorni')}</div>
<div class="sub">Per ubicazione: ${Object.entries(perSede).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(' · ')}</div>
<p class="legenda">Ogni gruppo è ordinato dalle più vecchie in stock.<i style="background:#fdf1f0;border:1px solid #b3261e"></i>90 giorni o più<i style="background:#fff8ec;border:1px solid #a35a00"></i>da 60 a 89 giorni</p>
${sezioni}
<p class="piede">Nell'app queste auto risultano "prezzo non inserito". L'ultima colonna è lasciata vuota per segnare il prezzo a mano.</p>
</body></html>`;
const dir = path.join(__dirname, 'rapporti'); fs.mkdirSync(dir, { recursive: true });
const fileHtml = path.join(dir, 'libere-senza-prezzo.html'), filePdf = path.join(dir, `Libere senza prezzo ${dIt(day).replace(/\//g, '-')}.pdf`);
fs.writeFileSync(fileHtml, html);
stampaPdf(fileHtml, filePdf).then(() => console.log(`${auto.length} auto libere senza prezzo -> ${filePdf}`)).catch(e => { console.error(e.message); process.exit(1); });
