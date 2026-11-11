// Rapporto mensile sui venditori: SOLO per Giuseppe, mai pubblicato e mai inviato ad altri.
// Legge la storia ricostruita dalle stampe (agente/storico-lungo-cache.json, resta sul PC) e prepara:
//  - un file HTML con le classifiche (mese, ultimi 12 mesi, anno per anno), da aprire col browser
//  - un file CSV con tutte le vendite del mese, da aprire con Excel
// e li mette in coda come allegati di una mail a Giuseppe.
// Uso: node agente/venditori.js [AAAA-MM] [--senza-mail]     (senza mese: il mese scorso)
const fs = require('fs'), path = require('path');
const IO = 'giuseppe.cavalli@valentinoautomobili.it';
const { esclusa } = require('./storico-lungo.js');
const CACHE = path.join(__dirname, 'storico-lungo-cache.json'), OUT = path.join(__dirname, 'rapporti');
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const giorni = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
const mediana = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const N = v => (v == null ? '—' : Math.round(v).toLocaleString('it-IT'));
const eur = v => (v ? N(v) + ' €' : '—');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const dIt = iso => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');
// lo stesso venditore scritto in modi diversi nella stampa ("ROSSI MARIO", "Mario  Rossi "): spazi e maiuscole uguali
const nome = s => String(s || '').replace(/\s+/g, ' ').trim().toLowerCase().replace(/(^|[\s'-])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase());

function vendite(S) {
  const al = S.giorni.reduce((m, g) => (g.d > m ? g.d : m), ''), out = [];
  for (const [targa, a] of Object.entries(S.auto)) {
    if (!a.bk || !a.pren || !a.vend || !a.ingr || a.pren > al || esclusa(a)) continue;
    const g = giorni(a.pren, a.ingr);
    if (g < -400 || g > 1500) continue;
    const prezzi = a.p.filter(x => x[0] <= a.pren || x === a.p[0]);
    let cali = 0; for (let i = 1; i < prezzi.length; i++) if (prezzi[i][1] < prezzi[i - 1][1]) cali++;
    out.push({ targa, d: a.pren, vend: nome(a.vend), auto: `${a.b} ${a.f}`, modello: a.m, fuel: a.fu, gg: Math.max(0, g), prezzo: a.pp || (prezzi.length ? prezzi[prezzi.length - 1][1] : 0), cali, uscita: a.a < al ? a.a : '' });
  }
  return out;
}

function classifica(l) {
  const m = new Map();
  for (const v of l) { if (!m.has(v.vend)) m.set(v.vend, []); m.get(v.vend).push(v); }
  return [...m].map(([vend, x]) => {
    const mod = new Map(); x.forEach(v => mod.set(v.auto, (mod.get(v.auto) || 0) + 1));
    return { vend, n: x.length, valore: x.reduce((s, v) => s + (v.prezzo || 0), 0), medio: x.filter(v => v.prezzo).length ? x.reduce((s, v) => s + (v.prezzo || 0), 0) / x.filter(v => v.prezzo).length : 0,
      gg: mediana(x.map(v => v.gg)), ferme: x.filter(v => v.gg > 90).length, ribassate: Math.round(x.filter(v => v.cali > 0).length / x.length * 100), top: [...mod].sort((a, b) => b[1] - a[1])[0] };
  }).sort((a, b) => b.n - a.n || b.valore - a.valore);
}

function tabella(c, totale) {
  if (!c.length) return '<p style="color:#5b6675">Nessuna vendita in questo periodo.</p>';
  const th = t => `<th style="text-align:${t === 'Venditore' || t === 'Modello più venduto' ? 'left' : 'right'};padding:8px 10px;border-bottom:2px solid #0b2545;font-size:12px;color:#5b6675;white-space:nowrap">${t}</th>`;
  const td = (t, sx) => `<td style="text-align:${sx ? 'left' : 'right'};padding:7px 10px;border-bottom:1px solid #e3e7ed;white-space:nowrap">${t}</td>`;
  return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr>${['#', 'Venditore', 'Vendite', 'Quota', 'Valore a listino', 'Prezzo medio', 'Giorni in stock delle auto vendute', 'Auto ferme da 90+ gg vendute', 'Con ribasso', 'Modello più venduto'].map(th).join('')}</tr></thead><tbody>${
    c.map((r, i) => `<tr>${td(i + 1)}${td('<b>' + esc(r.vend) + '</b>', 1)}${td('<b>' + N(r.n) + '</b>')}${td(Math.round(r.n / totale * 100) + '%')}${td(eur(r.valore))}${td(eur(r.medio))}${td(N(r.gg))}${td(N(r.ferme))}${td(r.ribassate + '%')}${td(esc(r.top ? `${r.top[0]} (${r.top[1]})` : ''), 1)}</tr>`).join('')}</tbody></table>`;
}

// auto ad alto valore: prezzo esposto da SOGLIA_ALTO in su (circa una vendita su otto)
const SOGLIA_ALTO = 30000;
function altoValore(titolo, l) {
  const alte = l.filter(v => v.prezzo >= SOGLIA_ALTO), tot = new Map(); l.forEach(v => tot.set(v.vend, (tot.get(v.vend) || 0) + 1));
  const m = new Map(); alte.forEach(v => { if (!m.has(v.vend)) m.set(v.vend, []); m.get(v.vend).push(v); });
  const c = [...m].map(([vend, x]) => { const top = [...x].sort((a, b) => b.prezzo - a.prezzo)[0]; return { vend, n: x.length, valore: x.reduce((t, v) => t + v.prezzo, 0), quota: Math.round(x.length / tot.get(vend) * 100), top }; }).sort((a, b) => b.n - a.n || b.valore - a.valore);
  const th = (t, sx) => `<th style="text-align:${sx ? 'left' : 'right'};padding:8px 10px;border-bottom:2px solid #0b2545;font-size:12px;color:#5b6675;white-space:nowrap">${t}</th>`;
  const td = (t, sx) => `<td style="text-align:${sx ? 'left' : 'right'};padding:7px 10px;border-bottom:1px solid #e3e7ed;white-space:nowrap">${t}</td>`;
  return `<h2 style="font-size:18px;margin:30px 0 4px">${titolo}</h2><p style="margin:0 0 10px;color:#5b6675;font-size:13px">Auto con prezzo esposto da ${N(SOGLIA_ALTO)} € in su · ${N(alte.length)} vendite su ${N(l.length)}</p>${c.length ? `<div style="overflow-x:auto"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr>${th('#')}${th('Venditore', 1)}${th('Auto ad alto valore')}${th('Valore a listino')}${th('Prezzo medio')}${th('Quota sulle sue vendite')}${th('La più cara', 1)}</tr></thead><tbody>${c.map((r, i) => `<tr>${td(i + 1)}${td('<b>' + esc(r.vend) + '</b>', 1)}${td('<b>' + N(r.n) + '</b>')}${td(eur(r.valore))}${td(eur(r.valore / r.n))}${td(r.quota + '%')}${td(esc(r.top.auto) + ' · ' + eur(r.top.prezzo), 1)}</tr>`).join('')}</tbody></table></div>` : '<p style="color:#5b6675">Nessuna in questo periodo.</p>'}`;
}

// auto di altre marche: tutto quello che non e' Volkswagen
function altreMarche(titolo, l) {
  const altre = l.filter(v => !/^Volkswagen /.test(v.auto)), tot = new Map(); l.forEach(v => tot.set(v.vend, (tot.get(v.vend) || 0) + 1));
  const m = new Map(); altre.forEach(v => { if (!m.has(v.vend)) m.set(v.vend, []); m.get(v.vend).push(v); });
  const piu = (x, k) => { const c = new Map(); x.forEach(v => c.set(k(v), (c.get(k(v)) || 0) + 1)); const t = [...c].sort((a, b) => b[1] - a[1])[0]; return t ? t[0] + ' (' + t[1] + ')' : ''; };
  const c = [...m].map(([vend, x]) => ({ vend, n: x.length, valore: x.reduce((t, v) => t + (v.prezzo || 0), 0), quota: Math.round(x.length / tot.get(vend) * 100), gg: mediana(x.map(v => v.gg)), marca: piu(x, v => v.auto.split(' ')[0] === 'Altre' ? 'Altre marche' : v.auto.split(' ')[0]), modello: piu(x, v => v.auto) })).sort((a, b) => b.n - a.n || b.valore - a.valore);
  const th = (t, sx) => `<th style="text-align:${sx ? 'left' : 'right'};padding:8px 10px;border-bottom:2px solid #0b2545;font-size:12px;color:#5b6675;white-space:nowrap">${t}</th>`;
  const td = (t, sx) => `<td style="text-align:${sx ? 'left' : 'right'};padding:7px 10px;border-bottom:1px solid #e3e7ed;white-space:nowrap">${t}</td>`;
  return `<h2 style="font-size:18px;margin:30px 0 4px">${titolo}</h2><p style="margin:0 0 10px;color:#5b6675;font-size:13px">Auto di marche diverse da Volkswagen · ${N(altre.length)} vendite su ${N(l.length)}</p>${c.length ? `<div style="overflow-x:auto"><table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr>${th('#')}${th('Venditore', 1)}${th('Auto non Volkswagen')}${th('Quota sulle sue vendite')}${th('Valore a listino')}${th('Giorni in stock')}${th('Marca più venduta', 1)}${th('Modello più venduto', 1)}</tr></thead><tbody>${c.map((r, i) => `<tr>${td(i + 1)}${td('<b>' + esc(r.vend) + '</b>', 1)}${td('<b>' + N(r.n) + '</b>')}${td(r.quota + '%')}${td(eur(r.valore))}${td(N(r.gg))}${td(esc(r.marca), 1)}${td(esc(r.modello), 1)}</tr>`).join('')}</tbody></table></div>` : '<p style="color:#5b6675">Nessuna in questo periodo.</p>'}`;
}

function prepara(mese, S) {
  const tutteV = vendite(S), al = S.giorni.reduce((m, g) => (g.d > m ? g.d : m), '');
  // nel rapporto mensile solo i venditori in forza: chi ha almeno una vendita negli ultimi 60 giorni di stampe.
  // Chi non c'e' piu' resta solo nella classifica storica.
  const attivi = new Set(tutteV.filter(v => giorni(al, v.d) <= 60).map(v => v.vend)), V = tutteV.filter(v => attivi.has(v.vend));
  const [y, mm] = mese.split('-'), titoloMese = `${MESI[+mm - 1]} ${y}`;
  const delMese = V.filter(v => v.d.slice(0, 7) === mese);
  const da12 = `${+y - 1}-${mm}`, ultimi12 = V.filter(v => v.d.slice(0, 7) > da12 && v.d.slice(0, 7) <= mese);
  const anni = [...new Set(V.map(v => v.d.slice(0, 4)))].filter(a => a >= '2022' && a <= y).sort().reverse();
  const sez = (t, sotto, l) => `<h2 style="font-size:18px;margin:30px 0 4px">${t}</h2><p style="margin:0 0 10px;color:#5b6675;font-size:13px">${sotto} · ${N(l.length)} vendite in tutto</p><div style="overflow-x:auto">${tabella(classifica(l), l.length || 1)}</div>`;
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Venditori · ${titoloMese}</title></head>
<body style="margin:0;background:#f4f6f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0b2545"><div style="max-width:1150px;margin:0 auto;padding:26px 18px 50px">
<div style="font-size:12px;color:#5b6675;letter-spacing:.04em;text-transform:uppercase">Riservato · solo per Giuseppe Cavalli</div>
<h1 style="font-size:26px;margin:6px 0 4px">Vendite per venditore · ${titoloMese}</h1>
<p style="margin:0;color:#5b6675;font-size:13.5px">Ricostruito dalle stampe dello stock fino al ${dIt(al)}. Una vendita è un'auto prenotata con data di prenotazione nel periodo, assegnata al venditore scritto nella stampa. Sono compresi solo i ${attivi.size} venditori in forza oggi (almeno una vendita negli ultimi 60 giorni): chi non c'è più è solo nella classifica storica. Le prenotazioni poi annullate non contano. Il valore è il prezzo esposto, non quello del contratto.</p>
${sez(`Il mese: ${titoloMese}`, 'Classifica per numero di vendite', delMese)}
${altoValore(`Alto valore · ${titoloMese}`, delMese)}
${altreMarche(`Non Volkswagen · ${titoloMese}`, delMese)}
${sez('Ultimi 12 mesi', `Da ${MESI[+mm % 12]} ${+mm === 12 ? y : +y - 1} a ${titoloMese}`, ultimi12)}
${altoValore('Alto valore · ultimi 12 mesi', ultimi12)}
${altreMarche('Non Volkswagen · ultimi 12 mesi', ultimi12)}
${anni.map(a => sez(`Anno ${a}`, a === y ? `Fino a ${titoloMese}` : a === '2022' ? 'Da maggio, quando comincia l’archivio' : 'Anno intero', V.filter(v => v.d.slice(0, 4) === a && v.d.slice(0, 7) <= mese))).join('')}
</div></body></html>`;
  const csv = '﻿' + [['Data prenotazione', 'Venditore', 'Targa', 'Auto', 'Versione', 'Alimentazione', 'Prezzo esposto', 'Giorni in stock', 'Ribassi', 'Uscita dallo stock']].concat(
    delMese.sort((a, b) => (a.d < b.d ? -1 : 1)).map(v => [dIt(v.d), v.vend, v.targa, v.auto, v.modello, v.fuel, v.prezzo || '', v.gg, v.cali, dIt(v.uscita)])).map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  return { html, csv, titoloMese, delMese, cl: classifica(delMese), ultimi12: classifica(ultimi12) };
}

// una tantum: la classifica di tutto il periodo coperto dalle stampe, con il dettaglio anno per anno
function storico(S) {
  const V = vendite(S), dal = S.giorni.reduce((m, g) => (g.d < m ? g.d : m), '9'), al = S.giorni.reduce((m, g) => (g.d > m ? g.d : m), '');
  const tutte = V.filter(v => v.d >= dal), anni = [...new Set(tutte.map(v => v.d.slice(0, 4)))].sort();
  const cl = classifica(tutte);
  const perAnno = new Map(); tutte.forEach(v => { const k = v.vend + '|' + v.d.slice(0, 4); perAnno.set(k, (perAnno.get(k) || 0) + 1); });
  const th = (t, sx) => `<th style="text-align:${sx ? 'left' : 'right'};padding:8px 10px;border-bottom:2px solid #0b2545;font-size:12px;color:#5b6675">${t}</th>`;
  const td = (t, sx) => `<td style="text-align:${sx ? 'left' : 'right'};padding:7px 10px;border-bottom:1px solid #e3e7ed;white-space:nowrap">${t}</td>`;
  const matrice = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13.5px"><thead><tr>${th('#')}${th('Venditore', 1)}${anni.map(a => th(a)).join('')}${th('Totale')}</tr></thead><tbody>${cl.map((r, i) => `<tr>${td(i + 1)}${td('<b>' + esc(r.vend) + '</b>', 1)}${anni.map(a => td(N(perAnno.get(r.vend + '|' + a) || 0) === '0' ? '·' : N(perAnno.get(r.vend + '|' + a)))).join('')}${td('<b>' + N(r.n) + '</b>')}</tr>`).join('')}</tbody></table>`;
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Venditori · classifica storica</title></head>
<body style="margin:0;background:#f4f6f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0b2545"><div style="max-width:1150px;margin:0 auto;padding:26px 18px 50px">
<div style="font-size:12px;color:#5b6675;letter-spacing:.04em;text-transform:uppercase">Riservato · solo per Giuseppe Cavalli</div>
<h1 style="font-size:26px;margin:6px 0 4px">Classifica storica dei venditori · dal ${dIt(dal)} al ${dIt(al)}</h1>
<p style="margin:0;color:#5b6675;font-size:13.5px">Ricostruita da ${N(S.file.length)} stampe dello stock: ${N(tutte.length)} vendite, ${N(cl.length)} venditori. Una vendita è un'auto prenotata con data di prenotazione nel periodo, assegnata al venditore scritto nella stampa; le prenotazioni annullate non contano. Il valore è il prezzo esposto, non quello del contratto. Il 2022 parte da maggio e l'ultimo anno non è finito.</p>
<h2 style="font-size:18px;margin:30px 0 10px">Tutto il periodo</h2><div style="overflow-x:auto">${tabella(cl, tutte.length || 1)}</div>
${altoValore('Chi vende più auto ad alto valore · tutto il periodo', tutte)}
${anni.slice().reverse().map(a => altoValore('Alto valore · ' + a, tutte.filter(v => v.d.slice(0, 4) === a))).join('')}
${altreMarche('Chi vende più auto non Volkswagen · tutto il periodo', tutte)}
${anni.slice().reverse().map(a => altreMarche('Non Volkswagen · ' + a, tutte.filter(v => v.d.slice(0, 4) === a))).join('')}
<h2 style="font-size:18px;margin:30px 0 10px">Vendite anno per anno</h2><div style="overflow-x:auto">${matrice}</div>
</div></body></html>`;
  const csv = '﻿' + [['Data prenotazione', 'Venditore', 'Targa', 'Auto', 'Versione', 'Alimentazione', 'Prezzo esposto', 'Giorni in stock', 'Ribassi', 'Uscita dallo stock']].concat(
    tutte.sort((a, b) => (a.d < b.d ? -1 : 1)).map(v => [dIt(v.d), v.vend, v.targa, v.auto, v.modello, v.fuel, v.prezzo || '', v.gg, v.cali, dIt(v.uscita)])).map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  return { html, csv, cl, tutte, dal, al };
}

if (require.main === module && process.argv.includes('--storico')) {
  const S = JSON.parse(fs.readFileSync(CACHE, 'utf8')), r = storico(S);
  fs.mkdirSync(OUT, { recursive: true });
  const fH = path.join(OUT, 'Venditori - classifica storica.html'), fC = path.join(OUT, 'Vendite - tutte dal 2022.csv');
  fs.writeFileSync(fH, r.html); fs.writeFileSync(fC, r.csv);
  if (!process.argv.includes('--senza-mail')) {
    const corpo = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7"><div style="max-width:640px;margin:0 auto;padding:20px 14px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0b2545;font-size:14px;line-height:1.5">
<div style="font-size:12px;color:#5b6675;margin-bottom:6px">Solo per te · Gestore stock usato</div>
<h1 style="font-size:21px;margin:0 0 10px">Classifica storica dei venditori</h1>
<p style="margin:0 0 12px">Dal ${dIt(r.dal)} al ${dIt(r.al)}: ${N(r.tutte.length)} vendite ricostruite dalle stampe, ${N(r.cl.length)} venditori.</p>
<ol style="padding-left:22px;margin:0 0 12px">${r.cl.slice(0, 10).map(x => `<li style="margin-bottom:4px"><b>${esc(x.vend)}</b>: ${N(x.n)} vendite, ${eur(x.valore)} a listino</li>`).join('')}</ol>
<p>In allegato la classifica completa con il dettaglio anno per anno e l'elenco di tutte le vendite per Excel.</p>
<p style="margin-top:20px;font-size:12px;color:#5b6675">Invio unico, solo a te. I dati dei venditori non sono pubblicati sul sito.</p></div></body></html>`;
    const f = path.join(__dirname, 'posta-da-inviare.json'); let coda = []; try { coda = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
    coda.push({ to: IO, subject: 'Vendite per venditore | Classifica storica dal 2022', html: corpo, allegati: [fH, fC] });
    fs.writeFileSync(f, JSON.stringify(coda, null, 1));
  }
  console.log(`Classifica storica: ${r.tutte.length} vendite, ${r.cl.length} venditori.`);
} else if (require.main === module) {
  if (!fs.existsSync(CACHE)) { console.error('Storico non ancora letto: lancia prima node agente/storico-lungo.js'); process.exit(1); }
  const S = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}$/.test(a));
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const mese = arg || `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const r = prepara(mese, S);
  fs.mkdirSync(OUT, { recursive: true });
  const fH = path.join(OUT, `Venditori ${mese}.html`), fC = path.join(OUT, `Vendite ${mese}.csv`);
  fs.writeFileSync(fH, r.html); fs.writeFileSync(fC, r.csv);
  if (!process.argv.includes('--senza-mail')) {
    const riga = (x, i) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #e3e7ed">${i + 1}</td><td style="padding:6px 10px;border-bottom:1px solid #e3e7ed"><b>${esc(x.vend)}</b></td><td style="padding:6px 10px;border-bottom:1px solid #e3e7ed;text-align:right"><b>${N(x.n)}</b></td><td style="padding:6px 10px;border-bottom:1px solid #e3e7ed;text-align:right">${eur(x.valore)}</td></tr>`;
    const corpo = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7"><div style="max-width:640px;margin:0 auto;padding:20px 14px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0b2545;font-size:14px;line-height:1.5">
<div style="font-size:12px;color:#5b6675;margin-bottom:6px">Solo per te · Gestore stock usato</div>
<h1 style="font-size:21px;margin:0 0 10px">Vendite per venditore · ${r.titoloMese}</h1>
<p style="margin:0 0 12px">${N(r.delMese.length)} vendite ricostruite dalle stampe, ${N(r.cl.length)} venditori.</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;background:#fff;font-size:13.5px"><tr><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #0b2545">#</th><th style="text-align:left;padding:6px 10px;border-bottom:2px solid #0b2545">Venditore</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #0b2545">Vendite</th><th style="text-align:right;padding:6px 10px;border-bottom:2px solid #0b2545">Valore a listino</th></tr>${r.cl.slice(0, 10).map(riga).join('')}</table>
<p style="margin-top:14px">In allegato la classifica completa (mese, ultimi 12 mesi, anno per anno) e l'elenco delle vendite del mese per Excel.</p>
<p style="margin-top:20px;font-size:12px;color:#5b6675">Questa mail arriva solo a te, una volta al mese. I dati dei venditori non sono pubblicati sul sito.</p></div></body></html>`;
    const f = path.join(__dirname, 'posta-da-inviare.json'); let coda = []; try { coda = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {}
    coda.push({ to: IO, subject: `Vendite per venditore | ${r.titoloMese}`, html: corpo, allegati: [fH, fC] });
    fs.writeFileSync(f, JSON.stringify(coda, null, 1));
  }
  console.log(`Rapporto venditori di ${r.titoloMese}: ${r.delMese.length} vendite, ${r.cl.length} venditori.`);
}
module.exports = { vendite, classifica, prepara, storico, altoValore };
