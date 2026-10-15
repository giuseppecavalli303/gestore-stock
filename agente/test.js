// Controlli automatici da lanciare dopo ogni modifica al lettore:  npm test
// Rilegge tutte le stampe vere scaricate dall'agente (restano solo su questo PC) e verifica i conteggi del report.
const fs = require('fs'), path = require('path');
const _w = console.warn, _l = console.log; console.warn = console.log = () => {};
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.warn = _w; console.log = _l;

const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8');
const { extract, normalize, buildVocab, parseQuery, matchQuery, deacc } = new Function(['parser.js', 'norm.js', 'query.js'].map(src).join('\n') + '\nreturn { extract, normalize, buildVocab, parseQuery, matchQuery, deacc };')();

let errori = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  NO   ') + msg); if (!cond) errori++; };

async function leggi(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), h = page.view[3], tc = await page.getTextContent();
    pages.push({ items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: h - i.transform[5], w: i.width, fs: i.transform[0] })) });
  }
  return normalize(extract(pages));
}

(async () => {
  const dir = path.join(__dirname, 'arrivi');
  const pdf = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort() : [];
  console.log(`Stampe da verificare: ${pdf.length}`);
  let ultima = null;
  for (const f of pdf) {
    const d = await leggi(path.join(dir, f)), m = d.meta;
    ok(m.count === m.expected && !m.badSec.length && !m.warnings.length, `${f}: ${m.count} letti, ${m.expected} dichiarati${m.badSec.length ? ', sezioni che non tornano: ' + m.badSec.join(', ') : ''}`);
    ok(new Set(d.cars.map(c => c.targa)).size === d.cars.length, `${f}: targhe tutte diverse`);
    ok(d.cars.filter(c => c.brand === 'Altre marche').length <= 5, `${f}: marche riconosciute (${d.cars.filter(c => c.brand === 'Altre marche').length} non riconosciute)`);
    ok(d.cars.every(c => c.ingr && c.giorni != null), `${f}: data di ingresso presente su tutte`);
    ultima = d;
  }
  if (ultima) {
    const cars = ultima.cars;
    cars.forEach(c => { c._h = deacc([c.targa, c.brand, c.family, c.modello, c.colore, c.ubic, c.vend, c.acq, c.note, c.section, c.stato, c.antic].join(' ').toLowerCase()); });
    const V = buildVocab(cars);
    const prova = (q, attese) => { const Q = parseQuery(q, V); ok(attese.every(a => Q.chips.includes(a)), `ricerca "${q}" capita come: ${Q.chips.join(' · ')}`); return cars.filter(c => matchQuery(c, Q)); };
    const r1 = prova('golf diesel automatica sotto 40000 libera', ['Golf', 'Diesel', 'Automatico', 'Libere']);
    ok(r1.every(c => c.family === 'Golf' && c.fuel === 'Diesel' && c.free && c.prezzo <= 40000), 'i risultati rispettano i filtri');
    prova('t-roc tiburtina 2 dal 2023 meno di 40.000 km', ['T-Roc', 'da 2023']);
    prova('elettriche in arrivo', ['Elettrica', 'In arrivo']);
  }
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
