// Prezzo "prima" delle vetture in promo, da mostrare barrato nell'app.
// Regola Omnibus (art. 17-bis Codice del consumo): il prezzo precedente e' il piu' basso praticato
// nei 30 giorni prima del ribasso. La data e' l'ultimo giorno in cui valeva quel prezzo.
// Legge data/storico.json e aggiunge a data/promo.json la voce "prima": { targa: [prezzo, "AAAA-MM-GG"] }.
// Uso: node agente/promo-prezzi.js
const fs = require('fs'), path = require('path');
const dati = f => path.join(__dirname, '..', 'data', f);
const giorno = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

function calcola(promo, storico) {
  const inizio = promo.aggiornato, da = giorno(inizio, -30), prima = {};
  const auto = (storico && storico.auto) || {};
  for (const t of promo.targhe) {
    const p = (auto[t] && auto[t].p) || [];
    const inVigore = d => { let v = null; for (const [g, x] of p) if (g <= d) v = x; return v; };
    const promoP = inVigore(inizio);
    // prezzi in vigore nei 30 giorni prima della partenza: quello del primo giorno e ogni cambio successivo
    const finestra = [inVigore(da), ...p.filter(([g]) => g > da && g < inizio).map(x => x[1])].filter(x => x > 0);
    if (!promoP || !finestra.length) continue;
    const vecchio = Math.min(...finestra);
    if (vecchio <= promoP) continue;
    // il prezzo promo e' partito con l'ultimo cambio fino alla partenza: quello vecchio valeva fino al giorno prima
    const partenza = p.filter(([g]) => g <= inizio).pop()[0];
    prima[t] = [vecchio, giorno(partenza, -1)];
  }
  return prima;
}

module.exports = { calcola };

if (require.main === module) {
  const f = dati('promo.json');
  if (!fs.existsSync(f)) { console.log('Nessuna promo.'); process.exit(0); }
  const promo = JSON.parse(fs.readFileSync(f, 'utf8'));
  const storico = JSON.parse(fs.readFileSync(dati('storico.json'), 'utf8'));
  promo.prima = calcola(promo, storico);
  fs.writeFileSync(f, JSON.stringify(promo));
  console.log(`Prezzi barrati promo: ${Object.keys(promo.prima).length} su ${promo.targhe.length}.`);
}
