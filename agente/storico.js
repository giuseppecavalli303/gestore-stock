// Ricostruisce lo storico dello stock dalle versioni giornaliere di data/stock.json salvate in git.
// Non tiene stato proprio: ogni volta rilegge tutte le fotografie, quindi non si corrompe e si puo' rilanciare.
// Uso: node agente/storico.js   -> scrive data/storico.json
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const etichetta = c => (c.free ? 'Libera' : c.booked && c.st < 2 ? 'Prenotata' : c.stato);

function fotografie() {
  const perGiorno = new Map();
  const commit = git('log', '--reverse', '--format=%H', '--', 'data/stock.json').split('\n').filter(Boolean);
  for (const h of commit) {
    try {
      const d = JSON.parse(git('show', `${h}:data/stock.json`));
      if (d && d.meta && d.meta.day && Array.isArray(d.cars)) perGiorno.set(d.meta.day, d);   // per ogni giorno vale l'ultima stampa
    } catch (e) { /* versione illeggibile: la salto */ }
  }
  const attuale = path.join(root, 'data', 'stock.json');
  if (fs.existsSync(attuale)) { const d = JSON.parse(fs.readFileSync(attuale, 'utf8')); perGiorno.set(d.meta.day, d); }
  return [...perGiorno.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(e => e[1]);
}

function costruisci(snap) {
  const auto = {}, giorni = [];
  let prima = null;
  for (const d of snap) {
    const day = d.meta.day, presenti = new Set();
    for (const c of d.cars) {
      presenti.add(c.targa);
      const r = auto[c.targa] || (auto[c.targa] = { da: day, p: [], s: [] });
      Object.assign(r, { n: `${c.brand} ${c.family}`, mod: c.modello, km: c.km, imm: c.imm, fuel: c.fuel, ingr: c.ingr, a: day, out: null });
      const lp = r.p[r.p.length - 1], ls = r.s[r.s.length - 1], lab = etichetta(c);
      if (!lp || lp[1] !== c.prezzo) r.p.push([day, c.prezzo]);
      if (!ls || ls[1] !== lab) r.s.push([day, lab]);
      if (c.dataPren) r.pren = c.dataPren;
    }
    let uscite = 0, entrate = 0;
    if (prima) {
      for (const t of prima) if (!presenti.has(t)) { auto[t].out = day; uscite++; }
      for (const t of presenti) if (!prima.has(t)) entrate++;
    }
    const cs = d.cars;
    giorni.push({
      d: day, tot: cs.length, libere: cs.filter(c => c.free).length, prenotate: cs.filter(c => c.booked).length,
      arrivo: cs.filter(c => c.st === 7).length, rip: cs.filter(c => c.st === 6).length,
      valore: Math.round(cs.filter(c => c.free).reduce((s, c) => s + (c.prezzo || 0), 0)),
      entrate: prima ? entrate : null, uscite: prima ? uscite : null
    });
    prima = presenti;
  }
  return { aggiornato: new Date().toISOString(), dal: snap.length ? snap[0].meta.day : null, giorni, auto };
}

module.exports = { costruisci, fotografie };

if (require.main === module) {
  const snap = fotografie();
  if (!snap.length) { console.error('Nessuna fotografia dello stock trovata.'); process.exit(2); }
  const s = costruisci(snap);
  fs.writeFileSync(path.join(root, 'data', 'storico.json'), JSON.stringify(s));
  const usciti = Object.values(s.auto).filter(a => a.out).length;
  console.log(`Storico: ${s.giorni.length} giorni dal ${s.dal}, ${Object.keys(s.auto).length} auto, ${usciti} uscite.`);
}
