// Raccoglie dalle stampe su Drive (dal 2022) i dati per capire quanto ci mettono le auto ad avere un prezzo:
// per ogni targa provenienza (sezione), sede, anticipo, prezzo speciale, primo giorno visto, primo giorno con prezzo, prenotazione;
// per ogni giorno quante libere senza prezzo, divise per provenienza e sede.
// Resta sul PC (agente/analisi-prezzi-cache.json, escluso dal repo). Le stampe gia' lette non si rileggono.
// Uso: node agente/analisi-prezzi-raccogli.js [--da-capo]
const fs = require('fs'), path = require('path');
const _w = console.warn, _l = console.log; console.warn = console.log = () => {};
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.warn = _w; console.log = _l;

const root = path.join(__dirname, '..');
const ARCHIVIO = process.env.ARCHIVIO_STAMPE || 'G:\\Il mio Drive\\lavoro\\Stock usato - stampe';
const CACHE = path.join(__dirname, 'analisi-prezzi-cache.json');
const src = f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8');
const { extract, normalize } = new Function(src('parser.js') + '\n' + src('norm.js') + '\nreturn { extract, normalize };')();

async function leggi(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), h = page.view[3], tc = await page.getTextContent();
    pages.push({ items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: h - i.transform[5], w: i.width, fs: i.transform[0] })) });
  }
  await doc.destroy();
  return normalize(extract(pages));
}
const quando = f => { const m = f.match(/-(\d{2})(\d{2})(\d{4})-(\d{6})/); return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : ''; };
const gruppo = sec => { const x = String(sec || '').toUpperCase(); return /REMARKETING|RMKT/.test(x) ? 'Remarketing' : /^VTI/.test(x) ? 'VTI' : x ? 'Stock' : '?'; };

// Per ogni targa: provenienza, sede di ingresso, sedi in cui e' passata (con la data di arrivo), prezzi (primo, ultimo, ribassi),
// giorni da libera senza prezzo, prenotazione (data, sede, giorni passati in quella sede, prezzo, venditore).
// Per ogni giorno, per sede: libere, libere oltre 90 giorni, libere senza prezzo, prenotazioni nuove.
const RESET = ['p1', 'pz1', 'pzU', 'tagli', 'taglio1', 'pren', 'ubicP', 'statoP', 'ggSedeP', 'pzP', 'vend', 'prenSenza', 'ggSenza', 'ggLib', 'spec', 'sedi', 'stato'];
function aggiungi(S, day, cars) {
  const g = { d: day, lib: 0, senza: 0, perGr: {}, perSede: {}, libSede: {}, vecchieSede: {}, prenSede: {}, nuove: 0 };
  for (const c of cars) {
    let a = S.auto[c.targa];
    const nuova = () => ({ da: day, ingr: c.ingr, sec: c.section, ubic: c.ubic, ing: c.ingresso, antic: c.antic, b: c.brand, f: c.family, fu: c.fuel, imm: c.imm, sedi: [[day, c.ubic]] });
    if (!a) { a = S.auto[c.targa] = nuova(); g.nuove++; }
    else if (c.ingr && a.ingr && c.ingr > a.ingr && a.a && (Date.parse(day) - Date.parse(a.a)) / 864e5 > 30) {   // rientrata: si riparte
      const r = (a.rientri || 0) + 1; RESET.forEach(k => delete a[k]); Object.assign(a, nuova(), { rientri: r });
    }
    const statoPrima = a.stato || '';
    a.a = day; a.stato = c.stato; a.giorni = c.giorni;
    if (c.spec) a.spec = 1;
    if (!a.sec && c.section) a.sec = c.section;
    const ultima = a.sedi[a.sedi.length - 1];
    if (c.ubic && ultima[1] !== c.ubic) a.sedi.push([day, c.ubic]);                       // spostata in un'altra sede
    if (c.prezzo > 0) {
      if (!a.p1) { a.p1 = day; a.pz1 = c.prezzo; a.sec1 = c.section; a.ubic1 = c.ubic; }
      else if (c.prezzo < a.pzU) { a.tagli = (a.tagli || 0) + 1; if (!a.taglio1) a.taglio1 = day; }
      a.pzU = c.prezzo;
    }
    if (c.booked && !a.pren) {
      const arrivo = a.sedi[a.sedi.length - 1][0];
      Object.assign(a, { pren: c.dataPren || day, ubicP: c.ubic, statoP: statoPrima, ggSedeP: Math.round((Date.parse(day) - Date.parse(arrivo)) / 864e5), pzP: c.prezzo || a.pzU || 0, vend: c.vend || '' });
      if (!a.p1) a.prenSenza = 1;
      if (c.ubic) g.prenSede[c.ubic] = (g.prenSede[c.ubic] || 0) + 1;
    } else if (!c.booked && a.pren) { ['pren', 'ubicP', 'statoP', 'ggSedeP', 'pzP', 'vend'].forEach(k => delete a[k]); }   // prenotazione saltata
    if (c.free) {
      g.lib++; a.ggLib = (a.ggLib || 0) + 1;
      const se = c.ubic || '?';
      g.libSede[se] = (g.libSede[se] || 0) + 1;
      if ((c.giorni || 0) > 90) g.vecchieSede[se] = (g.vecchieSede[se] || 0) + 1;
      if (!(c.prezzo > 0)) {
        g.senza++; a.ggSenza = (a.ggSenza || 0) + 1;
        const gr = gruppo(c.section);
        g.perGr[gr] = (g.perGr[gr] || 0) + 1; g.perSede[se] = (g.perSede[se] || 0) + 1;
      }
    }
  }
  S.giorni = S.giorni.filter(x => x.d !== day);
  S.giorni.push(g);
}

(async () => {
  const daCapo = process.argv.includes('--da-capo');
  const S = !daCapo && fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { file: [], giorni: [], auto: {} };
  // stesse stampe buone gia' controllate dallo storico lungo (conti che tornano)
  const buone = JSON.parse(fs.readFileSync(path.join(__dirname, 'storico-lungo-cache.json'), 'utf8')).file;
  const fatti = new Set(S.file), nuovi = buone.filter(f => !fatti.has(f)).sort((a, b) => (quando(a) < quando(b) ? -1 : 1));
  let n = 0;
  for (const f of nuovi) {
    try { const d = await leggi(path.join(ARCHIVIO, f)); aggiungi(S, quando(f).slice(0, 10), d.cars); S.file.push(f); }
    catch (e) { console.log(`  saltata ${f}: ${e.message}`); }
    if (++n % 100 === 0) { fs.writeFileSync(CACHE, JSON.stringify(S)); console.log(`${n} di ${nuovi.length}...`); }
  }
  fs.writeFileSync(CACHE, JSON.stringify(S));
  console.log(`Fatto: ${S.file.length} stampe, ${Object.keys(S.auto).length} auto.`);
})().catch(e => { console.error(e.message); process.exit(1); });
