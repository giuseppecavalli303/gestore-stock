// Storico lungo: rilegge tutte le stampe salvate su Drive (dal 2022) e ricostruisce la storia di ogni auto.
//  - agente/storico-lungo-cache.json  resta sul PC (non pubblicato): storia per targa, con i venditori
//  - data/storico-lungo.json          pubblicato: solo numeri aggregati per i grafici, senza nomi
// Le stampe gia' lette non si rileggono: ogni giorno si aggiunge solo quella nuova.
// Uso: node agente/storico-lungo.js [--da-capo] [--solo-conti]
const fs = require('fs'), path = require('path');
const _w = console.warn, _l = console.log; console.warn = console.log = () => {};
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.warn = _w; console.log = _l;

const root = path.join(__dirname, '..');
const ARCHIVIO = process.env.ARCHIVIO_STAMPE || 'G:\\Il mio Drive\\lavoro\\Stock usato - stampe';
const CACHE = path.join(__dirname, 'storico-lungo-cache.json');
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
// nome del file: stock_auto_usato-GGMMAAAA-HHMMSS.pdf
const quando = f => { const m = f.match(/-(\d{2})(\d{2})(\d{4})-(\d{6})/); return m ? `${m[3]}-${m[2]}-${m[1]}T${m[4]}` : ''; };

// aggiunge una stampa alla storia: per ogni auto i dati fissi, il primo e l'ultimo giorno visto, i cambi di prezzo e l'ultima situazione
function aggiungi(S, day, cars) {
  const g = { d: day, tot: cars.length, lib: 0, pren: 0, vecchie: 0, sommaP: 0, conP: 0, sommaGg: 0, fuel: {} };
  for (const c of cars) {
    let a = S.auto[c.targa];
    if (!a) a = S.auto[c.targa] = { b: c.brand, f: c.family, fu: c.fuel, ca: c.cambio, m: c.modello, imm: c.imm, ingr: c.ingr, da: day, p: [] };
    if (c.ingr && a.ingr && c.ingr > a.ingr && a.a && giorni(day, a.a) > 30) { a.rientri = (a.rientri || 0) + 1; a.ingr = c.ingr; a.p = []; delete a.pren; delete a.vend; }   // rientrata dopo essere uscita
    a.a = day; a.km = c.km; a.st = c.st; a.bk = c.booked ? 1 : 0;
    if (c.cambio !== 'n.d.') a.ca = c.cambio;
    if (c.prezzo > 0 && (!a.p.length || a.p[a.p.length - 1][1] !== c.prezzo)) a.p.push([day, c.prezzo]);
    if (c.booked && c.dataPren) { a.pren = c.dataPren; if (c.vend) a.vend = c.vend; if (!a.pp && c.prezzo) a.pp = c.prezzo; }
    else if (!c.booked) { delete a.pren; delete a.vend; delete a.pp; }                // prenotazione saltata: torna libera
    if (c.free) { g.lib++; if (c.giorni > 90) g.vecchie++; if (c.giorni != null) g.sommaGg += c.giorni; if (c.prezzo > 0) { g.sommaP += c.prezzo; g.conP++; } }
    if (c.booked) g.pren++;
    g.fuel[c.fuel] = (g.fuel[c.fuel] || 0) + 1;
  }
  S.giorni = S.giorni.filter(x => x.d !== day);      // due stampe nello stesso giorno: vale l'ultima
  S.giorni.push(g);
}
const giorni = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);

async function raccogli(daCapo) {
  let S = !daCapo && fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { file: [], scartate: [], giorni: [], auto: {} };
  if (!fs.existsSync(ARCHIVIO)) { console.log('Archivio su Drive non raggiungibile: uso lo storico gia\' letto.'); return S; }
  const tutti = fs.readdirSync(ARCHIVIO).filter(f => /^stock_auto_usato.*\.pdf$/i.test(f)).sort((a, b) => (quando(a) < quando(b) ? -1 : 1));
  const fatti = new Set(S.file.concat(S.scartate)), ultimo = S.file.length ? quando(S.file[S.file.length - 1]) : '';
  const nuovi = tutti.filter(f => !fatti.has(f));
  // la storia si costruisce in ordine di data: se spunta una stampa piu' vecchia dell'ultima letta si riparte da capo
  if (nuovi.some(f => quando(f) < ultimo)) { console.log('Trovate stampe piu\' vecchie di quelle gia\' lette: rileggo tutto.'); return raccogli(true); }
  let n = 0;
  for (const f of nuovi) {
    try {
      const d = await leggi(path.join(ARCHIVIO, f)), m = d.meta;
      if (m.count !== m.expected || m.badSec.length || !d.cars.length) { S.scartate.push(f); console.log(`  scartata (conti che non tornano): ${f}, ${m.count} lette su ${m.expected}`); }
      else { aggiungi(S, quando(f).slice(0, 10), d.cars); S.file.push(f); }
    } catch (e) { S.scartate.push(f); console.log(`  scartata (illeggibile): ${f}: ${e.message}`); }
    if (++n % 100 === 0) { fs.writeFileSync(CACHE, JSON.stringify(S)); console.log(`${n} di ${nuovi.length}...`); }
  }
  if (n) fs.writeFileSync(CACHE, JSON.stringify(S));
  console.log(`Stampe in archivio: ${tutti.length}. Lette ora: ${n}. Buone in tutto: ${S.file.length}, scartate ${S.scartate.length}. Auto diverse: ${Object.keys(S.auto).length}.`);
  return S;
}

// vendite da non contare (es. auto cedute in blocco a un commerciante): regole in agente/vendite-escluse.json, che resta sul PC.
// Ogni regola: venditori (minuscolo), alimentazione e data di inizio; vale per le prenotazioni da quella data in poi.
const REGOLE = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'vendite-escluse.json'), 'utf8')); } catch (e) { return []; } })();
const pulito = s => String(s || '').replace(/[^a-zA-Z ]/g, ' ').replace(/ +/g, ' ').trim().toLowerCase();
function esclusa(a) {
  const v = pulito(a.vend);
  return REGOLE.some(r => (!r.venditori || r.venditori.includes(v)) && (!r.alimentazione || r.alimentazione === a.fu) && (!r.dal || (a.pren || '') >= r.dal) && (!r.al || (a.pren || '') <= r.al));
}

module.exports = { aggiungi, raccogli, giorni, esclusa };
if (require.main === module) (async () => {
  const S = await raccogli(process.argv.includes('--da-capo'));
  const out = require('./storico-lungo-conti.js').conti(S);
  fs.writeFileSync(path.join(root, 'data', 'storico-lungo.json'), JSON.stringify(out));
  console.log(`Storico lungo: dal ${out.dal} al ${out.al}, ${out.vendute} vendite ricostruite.`);
})().catch(e => { console.error('Storico lungo non aggiornato: ' + e.message); process.exit(1); });
