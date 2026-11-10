// Stock del giorno prima in versione leggera (data/ieri.json), per il confronto che l'app fa all'apertura.
// Delle auto ancora in stock all'app servono solo prezzo e stato di ieri; quelle uscite restano intere, perche' l'app le mostra.
// Il file completo (data/prev.json) resta: lo usano riepilogo e rapporto.
// Uso: node agente/ieri.js   (lo chiama da sola la conversione della stampa)
const fs = require('fs'), path = require('path');

function leggero(prev, cars) {
  const oggi = new Set(cars.map(c => c.targa));
  return { meta: prev.meta, cars: prev.cars.map(c => (oggi.has(c.targa) ? { targa: c.targa, prezzo: c.prezzo, st: c.st, booked: c.booked, stato: c.stato } : c)) };
}

function scrivi(root) {
  const dir = path.join(root, 'data'), f = n => path.join(dir, n);
  if (!fs.existsSync(f('prev.json')) || !fs.existsSync(f('stock.json'))) return null;
  const prev = JSON.parse(fs.readFileSync(f('prev.json'), 'utf8')), cur = JSON.parse(fs.readFileSync(f('stock.json'), 'utf8'));
  const out = leggero(prev, cur.cars);
  fs.writeFileSync(f('ieri.json'), JSON.stringify(out));
  return out;
}

module.exports = { leggero, scrivi };
if (require.main === module) { const o = scrivi(path.join(__dirname, '..')); console.log(o ? `Confronto con il ${o.meta.day}: ${o.cars.length} auto.` : 'Nessuno stock precedente.'); }
