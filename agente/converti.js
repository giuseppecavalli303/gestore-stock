// Converte la stampa PDF dello stock in data/stock.json, il file che l'app online legge da sola.
// Uso: node agente/converti.js "percorso\stock_auto_usato-....pdf" [--con-clienti]
const fs = require('fs'), path = require('path');
// fuori dal browser la libreria stampa avvisi sul disegno delle pagine, che qui non serve
const _warn = console.warn, _log = console.log;
console.warn = console.log = () => {};
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.warn = _warn; console.log = _log;

const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8');
// stesso lettore usato dall'app nel browser
const { arricchisci, caricaAnnunci, FOTO_BASE } = require('./abbina.js');
const { extract, normalize } = new Function(src('parser.js') + '\n' + src('norm.js') + '\nreturn { extract, normalize };')();

const pdfPath = process.argv[2];
const conClienti = process.argv.includes('--con-clienti');
if (!pdfPath || !fs.existsSync(pdfPath)) { console.error('PDF non trovato: ' + pdfPath); process.exit(1); }

(async () => {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), h = page.view[3], tc = await page.getTextContent();
    pages.push({ items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: h - i.transform[5], w: i.width, fs: i.transform[0] })) });
  }
  const data = normalize(extract(pages));
  const m = data.meta;
  if (!data.cars.length) { console.error('Nessun veicolo trovato: non sembra la stampa dello stock usato.'); process.exit(2); }
  if (m.expected !== m.count || m.badSec.length) {
    console.error(`Conteggi non verificati: letti ${m.count}, dichiarati ${m.expected}; sezioni che non tornano: ${m.badSec.join(', ') || 'nessuna'}. Non pubblico.`);
    process.exit(2);
  }
  // i nomi dei clienti non escono dal PC in chiaro: con la chiave (agente/nomi.js) viaggiano cifrati e li legge solo chi ha il link
  const chiaveNomi = require('./nomi.js').leggiChiave();
  if (!conClienti) data.cars.forEach(c => { if (c.acq && chiaveNomi) c.acqX = require('./nomi.js').cifra(c.acq, chiaveNomi); c.acq = ''; });
  m.shared = true;
  // foto, link e dati in piu' dal sito, se gli annunci sono freschi
  const ann = caricaAnnunci(root);
  if (ann) { const r = arricchisci(data.cars, ann.annunci); m.annunci = { aggiornato: ann.aggiornato, totali: ann.annunci.length, abbinati: r.perTarga + r.perKm, fotoBase: FOTO_BASE }; }
  m.source = path.basename(pdfPath);

  const dir = path.join(root, 'data');
  fs.mkdirSync(dir, { recursive: true });
  const curFile = path.join(dir, 'stock.json'), prevFile = path.join(dir, 'prev.json');
  if (fs.existsSync(curFile)) {
    try {
      const cur = JSON.parse(fs.readFileSync(curFile, 'utf8'));
      if (cur.meta.printDate === m.printDate) { console.log(`Gia' aggiornato: stampa del ${m.printDate}, ${m.count} veicoli.`); process.exit(3); }
      if (cur.meta.day !== m.day) fs.copyFileSync(curFile, prevFile);   // serve al confronto con il giorno prima
    } catch (e) { /* file precedente illeggibile: lo sovrascrivo */ }
  }
  fs.writeFileSync(curFile, JSON.stringify(data));
  console.log(`OK: stampa del ${m.printDate}, ${m.count} veicoli, totale verificato${conClienti ? '' : chiaveNomi ? ', nomi dei clienti cifrati' : ', nomi dei clienti rimossi'}${m.annunci ? `, ${m.annunci.abbinati} abbinati agli annunci del sito` : ''}.`);
})().catch(e => { console.error('Errore di lettura: ' + e.message); process.exit(1); });
