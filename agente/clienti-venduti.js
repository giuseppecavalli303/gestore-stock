// Elenco dei clienti di ogni venditore, raggruppati per cliente, in PDF ed Excel. Solo per Giuseppe: resta sul PC
// (agente/rapporti/) e nella sua cartella privata di Google Drive. Mai nel repo (file in .gitignore).
//
// Dati: agente/cross-clienti-tutte.txt (escluso dal repo), esportato da CROSS (F8, lista pratiche VU; scheda
// Prop.d'acq.: esistente = Si', data prop. d'acq. da ...; "Leggere tutto") con le colonne Nr.prat., Descrizione modello,
// CL della prop.d'acq. (Intest.riga1, Contatto 1, Contatto 2, Agg.al nome), Data prop.d'acq., Data consegna, Targa,
// Venditore da prop.d'acq.
// In CROSS un venditore puo' avere piu' codici (i vecchi sono "-- CANCELLATO --"): si raggruppa per nome. Le vendite che
// le stampe dello stock danno al venditore ma che in CROSS hanno un altro venditore si ritrovano per targa (segnate *).
//
// Di base fa gli elenchi dei colleghi di Tiburtina (i destinatari della mail del riepilogo, Giuseppe compreso);
// --tutti per tutti i venditori, --solo COGNOME per uno solo.
// --mio: solo la lista di Giuseppe, con le prenotazioni nuove prese dalla stampa (l'agente la rifa' ogni sera),
// in agente/rapporti/i-miei-clienti e, con --drive, direttamente nella cartella data ("I miei clienti.pdf/.xlsx").
// Uso: node agente/clienti-venduti.js [--mio | --tutti | --solo COGNOME] [--drive "G:\Il mio Drive\lavoro\Clienti venduti"]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const DIR = __dirname;
const DAL = '2022-05-05';
const MIN_AUTO = 5;
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const iso = s => (s && /\d\d\/\d\d\/\d{4}/.test(s)) ? s.trim().split('/').reverse().join('-') : '';
const it = s => s ? s.split('-').reverse().join('/') : '';
const giorni = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// "700 ROSSI MARIO (620) -- CANCELLATO --" e "Mario Rossi" (stampa) -> stessa chiave "MARIO ROSSI" (parole ordinate)
const pulisci = s => (s || '').replace(/^\d+\s+/, '').replace(/\(\d+\)/g, '').replace(/--\s*CANCELLATO\s*--/i, '').replace(/\s+/g, ' ').trim().toUpperCase();
const chiaveNome = s => pulisci(s).split(' ').filter(Boolean).sort().join(' ');
const titolo = s => s.toLowerCase().replace(/(^|[\s'])\S/g, m => m.toUpperCase());

function leggi() {
  const p = path.join(DIR, 'cross-clienti-tutte.txt');
  const L = fs.readFileSync(p, 'latin1').split(/\r?\n/).filter(Boolean);
  const h = L[0].split(';');
  const col = n => h.indexOf(n);
  const c = {
    mod: col('Descrizione modello'), int: col("CL della prop.d'acq. - Intest.riga1"),
    c1: col("CL della prop.d'acq. - Contatto 1"), c2: col("CL della prop.d'acq. - Contatto 2"),
    agg: col("CL della prop.d'acq. - Agg.al nome"), data: col("Data prop.d'acq."), cons: col('Data consegna'),
    targa: col('Targa'), vend: col("Venditore da prop.d'acq."),
  };
  if (Object.values(c).some(i => i < 0)) throw new Error('cross-clienti-tutte.txt: mancano colonne, rifare l\'esportazione da CROSS');
  // facoltative (servono al file contatti): cognome e nome separati, indirizzo
  const o = {
    cog: col("CL della prop.d'acq. - Cognome"), nom: col("CL della prop.d'acq. - Nome"), via: col("CL della prop.d'acq. - Strada"),
    civ: col("CL della prop.d'acq. - Strada numero"), cap: col("CL della prop.d'acq. - C.A.P."),
    loc: col("CL della prop.d'acq. - Località"), prov: col("CL della prop.d'acq. - Provincia"),
  };
  const f = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  return L.slice(1).map(l => l.split(';')).map(r => ({
    cognome: f(r, o.cog), nomeP: f(r, o.nom),
    indirizzo: { via: [f(r, o.via), f(r, o.civ)].filter(Boolean).join(' '), cap: f(r, o.cap), loc: f(r, o.loc), prov: f(r, o.prov) },
    modello: r[c.mod].replace(/\s+/g, ' ').trim(), intest: r[c.int].trim(), agg: (r[c.agg] || '').trim(),
    contatti: [r[c.c1], r[c.c2]].map(s => (s || '').trim()).filter(Boolean),
    data: iso(r[c.data]), consegna: iso(r[c.cons]), targa: r[c.targa].trim(), vend: chiaveNome(r[c.vend]), vendNome: pulisci(r[c.vend]),
  })).filter(v => v.data >= DAL && v.vend);
}

function nomeCliente(v) {
  // solo nome e cognome: via i titoli davanti (Signor, Signora, Sig.ra, Ditta, Dott., Frau, Herr...), anche piu' di uno
  const TITOLO = /^(Signora|Signorina|Signori|Signor|Sig\.ra|Sig\.na|Sigg\.|Sig\.?|Sgr\.|Ditta|Spett\.le|Spett\.|Dott\.ssa|Dott\.|Dr\.|Avv\.|Ing\.|Prof\.ssa|Prof\.|Frau|Herr|Firma|Mr\.?|Mrs\.?)\s+/i;
  let n = v.intest.trim();
  while (TITOLO.test(n)) n = n.replace(TITOLO, '').trim();
  return (n + (v.agg && !n.includes(v.agg) ? ' ' + v.agg : '')).replace(/\s+/g, ' ');
}

// La mail aziendale del venditore a volte e' messa al posto di quella del cliente: si toglie.
function contatti(v, cognome) {
  const tel = [], mail = [];
  for (const c of v.contatti) {
    if (c.includes('@')) { if (!(/valentinoautomobili/i.test(c) && c.toLowerCase().includes(cognome))) mail.push(c.toLowerCase()); }
    else if (/\d{6}/.test(c.replace(/\D/g, ''))) tel.push(c);
  }
  return { tel, mail };
}

// Le prenotazioni nuove arrivano con la stampa del mattino prima che si rifaccia l'esportazione da CROSS: dalla stampa
// si prendono cliente (nome cifrato, si legge con la chiave dei nomi), data, modello e targa. Restano in
// agente/clienti-stampe.json (locale) anche quando l'auto esce dallo stock, finche' CROSS non le ha.
const MEMORIA = path.join(DIR, 'clienti-stampe.json');
function decifra(x, chiave) {
  const b = Buffer.from(x, 'base64');
  const d = require('crypto').createDecipheriv('aes-256-gcm', Buffer.from(chiave, 'base64url'), b.subarray(0, 12));
  d.setAuthTag(b.subarray(b.length - 16));
  return Buffer.concat([d.update(b.subarray(12, b.length - 16)), d.final()]).toString('utf8');
}
function dalleStampe(chiaveVend) {
  const mem = fs.existsSync(MEMORIA) ? JSON.parse(fs.readFileSync(MEMORIA, 'utf8')) : {};
  const k = require('./nomi.js').leggiChiave();
  const stock = JSON.parse(fs.readFileSync(path.join(DIR, '..', 'data', 'stock.json'), 'utf8')).cars || [];
  for (const c of stock) {
    if (!c.vend || chiaveNome(c.vend) !== chiaveVend || !c.dataPren || c.dataPren < DAL) continue;
    let cliente = c.acq || '';
    if (!cliente && c.acqX && k) try { cliente = decifra(c.acqX, k); } catch (e) {}
    if (cliente) mem[c.targa] = { cliente: cliente.trim(), data: c.dataPren, modello: (c.modello || '').replace(/\s+/g, ' ').trim() };
  }
  fs.writeFileSync(MEMORIA, JSON.stringify(mem, null, 1));
  return mem;
}

// Se in CROSS e' stata rifatta l'esportazione con le colonne giuste (anche da Giuseppe), la si prende da sola.
function prendiEsportazione() {
  const src = 'c:/cross2/temp/export.txt', dst = path.join(DIR, 'cross-clienti-tutte.txt');
  try {
    if (fs.statSync(src).mtimeMs <= (fs.existsSync(dst) ? fs.statSync(dst).mtimeMs : 0)) return false;
    const h = fs.readFileSync(src, 'latin1').split(/\r?\n/, 1)[0];
    if (!h.includes("Venditore da prop.d'acq.") || !h.includes("CL della prop.d'acq. - Contatto 1")) return false;
    fs.copyFileSync(src, dst);
    return true;
  } catch (e) { return false; }
}

function prepara(righe, cache, chiave, stampe) {
  const mie = righe.filter(v => v.vend === chiave);
  if (stampe) {
    const inCross = new Set(righe.map(v => v.targa));
    for (const [t, s] of Object.entries(stampe)) {
      if (!inCross.has(t)) mie.push({ intest: s.cliente, agg: '', contatti: [], data: s.data, consegna: '', modello: s.modello, targa: t, vend: chiave, vendNome: '', nuova: true });
    }
  }
  const nome = mie.reduce((m, v) => (v.vendNome.length > m.length ? v.vendNome : m), '');
  const cognome = nome.split(' ')[0].toLowerCase();
  const giaMie = new Set(mie.map(v => v.targa));
  const perTarga = {};
  for (const v of righe) (perTarga[v.targa] = perTarga[v.targa] || []).push(v);
  const altre = [], senza = [];
  for (const [t, a] of Object.entries(cache)) {
    if (!a.vend || chiaveNome(a.vend) !== chiave || !a.pren || a.pren < DAL || giaMie.has(t)) continue;
    const v = (perTarga[t] || []).filter(x => giorni(x.data, a.pren) <= 60).sort((x, y) => giorni(x.data, a.pren) - giorni(y.data, a.pren))[0];
    if (v) altre.push({ ...v, altro: true }); else senza.push({ targa: t, data: a.pren, modello: a.m });
  }
  const clienti = new Map();
  for (const v of [...mie, ...altre]) {
    const n = nomeCliente(v);
    const k = n.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const c = clienti.get(k) || { nome: n, tel: new Set(), mail: new Set(), auto: [] };
    if (!c.cognome && v.cognome) { c.cognome = v.cognome; c.nomeP = v.nomeP; }
    const ind = v.indirizzo;
    if (ind && (ind.via || ind.loc) && (!c.indData || v.data > c.indData)) { c.indirizzo = ind; c.indData = v.data; }
    const { tel, mail } = contatti(v, cognome);
    tel.forEach(x => c.tel.add(x)); mail.forEach(x => c.mail.add(x));
    c.auto.push(v);
    clienti.set(k, c);
  }
  const L = [...clienti.values()].map(c => ({ ...c, tel: [...c.tel], mail: [...c.mail], auto: c.auto.sort((a, b) => a.data.localeCompare(b.data)) }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
  senza.sort((a, b) => a.data.localeCompare(b.data));
  return { venditore: titolo(nome), clienti: L, mie: mie.length, altre: altre.length, nuove: mie.filter(v => v.nuova).length, senza };
}

function html(d, oggi) {
  const nAuto = d.clienti.reduce((s, c) => s + c.auto.length, 0);
  const piu = d.clienti.filter(c => c.auto.length > 1).length;
  const righe = d.clienti.map(c => c.auto.map((a, i) => `<tr class="${i ? 'seg' : 'cli'}">
    ${i ? '<td></td><td></td>' : `<td class="nome">${esc(c.nome)}${c.auto.length > 1 ? ` <span class="n">${c.auto.length} auto</span>` : ''}${indirizzoTesto(c.indirizzo) ? `<div class="ind">${esc(indirizzoTesto(c.indirizzo))}</div>` : ''}</td><td>${c.tel.map(esc).join('<br>') || '<span class="manca">manca</span>'}${c.mail.length ? `<div class="mail">${c.mail.map(esc).join('<br>')}</div>` : ''}</td>`}
    <td class="data">${it(a.data)}</td><td>${esc(a.modello)}${a.altro ? ' <span class="alt">*</span>' : ''}${a.nuova ? ' <span class="nuo">nuova</span>' : ''}</td><td class="targa">${esc(a.targa)}</td></tr>`).join('')).join('');
  const senza = d.senza.length ? `<h2>Vendite nelle stampe senza dati cliente in CROSS (${d.senza.length})</h2>
    <p class="nota">La stampa dello stock le segna a questo venditore, ma in CROSS non c'è una proposta d'acquisto con questa targa vicino a quella data: per le auto con il telaio al posto della targa (estero, km 0) in CROSS c'è la targa italiana, che la stampa non conosce. Le più recenti potrebbero non avere ancora la proposta.</p>
    <table><thead><tr><th>Data</th><th>Modello</th><th>Targa / telaio</th></tr></thead><tbody>${d.senza.map(s => `<tr><td class="data">${it(s.data)}</td><td>${esc(s.modello)}</td><td class="targa">${esc(s.targa)}</td></tr>`).join('')}</tbody></table>` : '';
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Clienti di ${esc(d.venditore)}</title><style>
  @page { size: A4; }
  body { font: 9.5pt/1.35 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; }
  h1 { font-size: 17pt; margin: 0 0 2px; } h2 { font-size: 12pt; margin: 22px 0 6px; page-break-before: always; }
  .sotto { color: #555; margin-bottom: 10px; }
  .box { display: flex; gap: 10px; margin: 8px 0 12px; } .box div { border: 1px solid #ddd; border-radius: 6px; padding: 6px 10px; }
  .box b { display: block; font-size: 14pt; }
  table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 8.5pt; color: #555; border-bottom: 1.5px solid #333; padding: 4px; }
  td { padding: 3px 4px; vertical-align: top; } tr.cli td { border-top: 1px solid #ccc; } tr { page-break-inside: avoid; }
  .nome { font-weight: 600; width: 30%; } .n { font-weight: 400; font-size: 8pt; background: #eef3fb; color: #24548f; border-radius: 3px; padding: 0 4px; white-space: nowrap; }
  .ind { font-weight: 400; color: #666; font-size: 8pt; } .mail { color: #666; font-size: 8pt; word-break: break-all; } .data { white-space: nowrap; width: 62px; } .targa { white-space: nowrap; font-family: Consolas, monospace; font-size: 8.5pt; }
  .manca { color: #a33; font-style: italic; } .nuo { font-size: 7.5pt; background: #e8f5e9; color: #2e7d32; border-radius: 3px; padding: 0 4px; } .alt { color: #a35a00; font-weight: 700; } .nota { color: #555; font-size: 8.5pt; }
  </style></head><body>
  <h1>Clienti di ${esc(d.venditore)}</h1>
  <div class="sotto">Auto vendute dal ${it(DAL)} al ${it(oggi)} · da CROSS Sales (proposte d'acquisto) · uso interno, dati riservati</div>
  <div class="box"><div><b>${d.clienti.length}</b>clienti</div><div><b>${nAuto}</b>auto</div><div><b>${piu}</b>clienti con più auto</div></div>
  <p class="nota">Data = data della proposta d'acquisto. Chi ha comprato più auto le ha tutte sotto il suo nome, dalla più vecchia.${d.altre ? ` <span class="alt">*</span> = venduta da questo venditore secondo la stampa dello stock, ma in CROSS la proposta è registrata con un altro venditore (${d.altre} auto).` : ''}${d.nuove ? ` <span class="nuo">nuova</span> = prenotazione presa dalla stampa dello stock e non ancora nell'ultima esportazione da CROSS: il telefono arriva con la prossima esportazione (${d.nuove} auto).` : ''}</p>
  <table><thead><tr><th>Cliente</th><th>Telefono / email</th><th>Data</th><th>Modello</th><th>Targa</th></tr></thead><tbody>${righe}</tbody></table>
  ${senza}
  </body></html>`;
}

// indirizzo su una riga: "Via Roma 1, 00100 Roma (RM)"
const indirizzoTesto = a => (a && (a.via || a.loc) ? [titolo(a.via), [a.cap, titolo(a.loc)].filter(Boolean).join(' ') + (a.prov ? ` (${a.prov.toUpperCase()})` : '')].filter(x => x.trim()).join(', ') : '');

// Excel: tabella HTML aperta da Excel e salvata come .xlsx. Il nome del cliente sta sulla prima riga del gruppo.
function excelHtml(d) {
  const r = d.clienti.map(c => c.auto.map((a, i) => `<tr>
    <td style="font-weight:${i ? 400 : 700}">${i ? '' : esc(c.nome)}</td><td style="mso-number-format:'\\@'">${i ? '' : esc(c.tel.join(' / '))}</td><td>${i ? '' : esc(c.mail.join(' / '))}</td><td>${i ? '' : esc(indirizzoTesto(c.indirizzo))}</td>
    <td>${i ? '' : c.auto.length}</td><td style="mso-number-format:'dd\\/mm\\/yyyy'">${it(a.data)}</td><td style="mso-number-format:'dd\\/mm\\/yyyy'">${it(a.consegna)}</td><td>${esc(a.modello)}</td><td>${esc(a.targa)}</td><td>${a.altro ? 'altro venditore in CROSS' : a.nuova ? 'nuova: dalla stampa, telefono da CROSS' : ''}</td></tr>`).join('')).join('');
  return `<html><head><meta charset="utf-8"></head><body><table>
  <tr style="font-weight:700;background:#dde6f3"><td>Cliente</td><td>Telefono</td><td>Email</td><td>Indirizzo</td><td>Auto comprate</td><td>Data acquisto</td><td>Data consegna</td><td>Modello</td><td>Targa</td><td>Nota</td></tr>${r}</table></body></html>`;
}

// File contatti per l'iPhone (vCard 3.0, UTF-8): nome e cognome, telefoni, email, indirizzo (quando l'esportazione
// CROSS ha le colonne dell'indirizzo) e nelle note le auto comprate.
function vcard(d) {
  const e = x => String(x || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
  const t = x => titolo(String(x || ''));
  return d.clienti.map(c => {
    const azienda = !c.nomeP && c.auto.some(a => /^(Ditta|Firma)\b/i.test(a.intest || ''));
    const r = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (azienda) r.push('N:' + e(t(c.nome)) + ';;;;', 'FN:' + e(t(c.nome)), 'ORG:' + e(t(c.nome)));
    else if (c.cognome) r.push(`N:${e(t(c.cognome))};${e(t(c.nomeP))};;;`, 'FN:' + e(t([c.nomeP, c.cognome].filter(Boolean).join(' '))));
    else r.push('N:' + e(t(c.nome)) + ';;;;', 'FN:' + e(t(c.nome)));
    c.tel.forEach(x => r.push('TEL;TYPE=CELL:' + x.replace(/[^\d+]/g, '')));
    c.mail.forEach(x => r.push('EMAIL;TYPE=INTERNET:' + e(x)));
    const a = c.indirizzo;
    if (a && (a.via || a.loc)) r.push(`ADR;TYPE=HOME:;;${e(t(a.via))};${e(t(a.loc))};${e(a.prov.toUpperCase())};${e(a.cap)};Italia`);
    r.push('NOTE:' + e('Cliente Valentino Automobili: ' + c.auto.map(x => `${x.modello} (${it(x.data)}${x.targa ? ', ' + x.targa : ''})`).join(' · ')));
    r.push('CATEGORIES:Clienti Valentino', 'END:VCARD');
    return r.join('\r\n');
  }).join('\r\n') + '\r\n';
}

function salvaXlsx(coppie) {
  const lista = coppie.map(([h, x]) => `$l+=,@('${h.replace(/'/g, "''")}','${x.replace(/'/g, "''")}')`).join(';');
  const ps = `$l=@();${lista};$e=New-Object -ComObject Excel.Application;$e.DisplayAlerts=$false;$e.Visible=$false;try{foreach($c in $l){$w=$e.Workbooks.Open($c[0]);$s=$w.Worksheets.Item(1);$s.Name='Clienti';$s.UsedRange.Columns.AutoFit()|Out-Null;$s.Columns.Item(7).ColumnWidth=45;$s.UsedRange.AutoFilter()|Out-Null;$w.SaveAs($c[1],51);$w.Close($false)}}finally{$e.Quit();[void][Runtime.InteropServices.Marshal]::ReleaseComObject($e)}`;
  const f = path.join(DIR, 'rapporti', '_excel.ps1');
  fs.writeFileSync(f, '\ufeff' + ps);
  try { execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', f], { stdio: 'inherit' }); } finally { fs.unlinkSync(f); }
}

// I colleghi sono quelli che ricevono la mail del riepilogo (agente/destinatari.txt, locale): da "nome.cognome@..."
// a una prova sul nome CROSS ("DI CASTRO LUCA" va bene per luca.dicastro).
const IO = 'giuseppe.cavalli@valentinoautomobili.it';
function colleghi(indirizzi) {
  return (indirizzi || fs.readFileSync(path.join(DIR, 'destinatari.txt'), 'utf8').split(/\r?\n/)).map(x => x.trim())
    .filter(x => /^[a-z]+\.[a-z]+@/i.test(x) && !x.startsWith('#'))
    .map(x => { const [n, c] = x.split('@')[0].toUpperCase().split('.'); return k => { const w = k.split(' '); return w.includes(n) && w.filter(x => x !== n).sort().join('') .length === c.length && c.split('').sort().join('') === w.filter(x => x !== n).join('').split('').sort().join(''); }; });
}

async function main() {
  const oggi = new Date().toISOString().slice(0, 10);
  if (prendiEsportazione()) console.log('Presa la nuova esportazione da CROSS');
  const righe = leggi();
  const cache = JSON.parse(fs.readFileSync(path.join(DIR, 'storico-lungo-cache.json'), 'utf8')).auto;
  const conta = {};
  for (const v of righe) conta[v.vend] = (conta[v.vend] || 0) + 1;
  const iSolo = process.argv.indexOf('--solo');
  const filtro = iSolo > 0 ? process.argv[iSolo + 1].toUpperCase() : null;
  const mio = process.argv.includes('--mio');
  const squadra = process.argv.includes('--tutti') || filtro || mio ? null : colleghi();
  const io = mio ? colleghi([IO]) : null;
  const venditori = Object.keys(conta).filter(k => !io || io[0](k)).filter(k => conta[k] >= MIN_AUTO && (!filtro || k.includes(filtro)) && (!squadra || squadra.some(s => s(k)))).sort();
  if (squadra && venditori.length < squadra.length) console.log(`Attenzione: trovati ${venditori.length} venditori su ${squadra.length} destinatari della mail`);

  const out = path.join(DIR, 'rapporti', mio ? 'i-miei-clienti' : `clienti-venditori-${oggi}`);
  fs.mkdirSync(out, { recursive: true });
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const excel = [], fatti = [];
  try {
    const p = await b.newPage();
    for (const k of venditori) {
      const d = prepara(righe, cache, k, mio ? dalleStampe(k) : null);
      const base = path.join(out, mio ? 'I miei clienti' : `Clienti ${d.venditore}`);
      fs.writeFileSync(base + '.html', html(d, oggi));
      await p.goto('file:///' + (base + '.html').replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
      await p.pdf({ path: base + '.pdf', format: 'A4', preferCSSPageSize: true, printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
      fs.unlinkSync(base + '.html');
      fs.writeFileSync(base + '-excel.html', excelHtml(d));
      excel.push([base + '-excel.html', base + '.xlsx']);
      if (mio) fs.writeFileSync(base + '.vcf', vcard(d));
      const nAuto = d.clienti.reduce((s, c) => s + c.auto.length, 0);
      fatti.push(`${d.venditore}: ${d.clienti.length} clienti, ${nAuto} auto (${d.altre} con altro venditore in CROSS, ${d.nuove} nuove dalla stampa), ${d.senza.length} senza dati`);
    }
  } finally { await b.close(); }
  salvaXlsx(excel);
  excel.forEach(([h]) => fs.unlinkSync(h));
  console.log(fatti.join('\n'));
  console.log(out);
  const iDrive = process.argv.indexOf('--drive');
  if (iDrive > 0) {
    const dest = mio ? process.argv[iDrive + 1] : path.join(process.argv[iDrive + 1], path.basename(out));
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(out)) fs.copyFileSync(path.join(out, f), path.join(dest, f));
    console.log('copiati in ' + dest);
  }
}

module.exports = { prepara, leggi, chiaveNome };
if (require.main === module) main().catch(e => { console.error(e.message); process.exit(1); });
