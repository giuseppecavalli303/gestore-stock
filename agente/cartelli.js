// Cartello salone: per ogni auto con annuncio, Gemini (attraverso il servizio Google, azione 'cartello') sceglie le dotazioni
// piu' importanti dall'elenco completo dell'annuncio e scrive titolo e righe come nei cartelli di Valentino.
// Ogni auto si prepara una volta sola (memoria in agente/cartelli-cache.json) e di nuovo solo se cambiano dotazioni
// o conferme dalle foto (telecamera, tetto). Il risultato va in data/stock.json (web.cartello); il PDF lo compila l'app.
// Uso: node agente/cartelli.js [--max N]
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'data', 'stock.json'), CACHE = path.join(__dirname, 'cartelli-cache.json'), FOTO = path.join(__dirname, 'foto-cache.json');
const idDi = w => (String(w.url).match(/\/(\d+)\/?$/) || [])[1] || w.url;

// auto da preparare: annuncio con dotazioni, non ancora fatte o con dati cambiati
function daPreparare(cars, fotoCache, fatti) {
  const out = [];
  for (const c of cars) {
    const w = c.web, id = w && idDi(w), dot = id && fotoCache[id] && fotoCache[id].dot;
    if (!dot || !dot.length) continue;
    const richiesta = { auto: `${c.brand} ${c.modello}`, dotazioni: dot, telecamera: !!(w.cam && w.cam.esito === 'si'), tetto: !!(w.tetto && w.tetto.esito === 'si') };
    const firma = crypto.createHash('sha1').update(JSON.stringify(richiesta)).digest('hex').slice(0, 12);
    if (!fatti[id] || fatti[id].firma !== firma) out.push({ car: c, id, firma, richiesta });
  }
  return out;
}

module.exports = { daPreparare };

if (require.main === module) (async () => {
  const ui = fs.readFileSync(path.join(root, 'sorgenti', 'ui.js'), 'utf8');
  const AI_URL = (ui.match(/const AI_URL = '([^']*)'/) || [])[1], TOKEN = (ui.match(/const AI_TOKEN = '([^']*)'/) || [])[1];
  const iMax = process.argv.indexOf('--max'), MAX = iMax > 0 ? +process.argv[iMax + 1] : 400;
  const leggi = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
  const data = leggi(FILE, null), cache = leggi(CACHE, {}), foto = leggi(FOTO, {});
  if (!data) throw new Error('stock.json mancante');
  let fatte = 0, errori = 0;
  for (const x of daPreparare(data.cars, foto, cache)) {
    if (fatte >= MAX || !AI_URL) break;
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: TOKEN, azione: 'cartello' }, x.richiesta)) });
      const s = await r.text(), j = JSON.parse(s);
      if (j.errore) throw new Error(j.errore);
      if (!Array.isArray(j.righe)) throw new Error('risposta senza righe (servizio Google da aggiornare?)');
      cache[x.id] = { firma: x.firma, nome: j.nome, righe: j.righe, t: new Date().toISOString().slice(0, 10) };
      fatte++;
      if (fatte % 10 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
    } catch (e) { errori++; if (errori <= 3) console.error(`Cartello ${x.car.targa}: ${e.message}`); if (errori >= 5) break; }
  }
  // tutte le auto con un cartello pronto lo portano nei dati dell'app
  let pronti = 0;
  for (const c of data.cars) { const id = c.web && idDi(c.web); if (id && cache[id]) { c.web.cartello = { nome: cache[id].nome, righe: cache[id].righe }; pronti++; } }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  fs.writeFileSync(FILE, JSON.stringify(data));
  console.log(`Cartelli salone: ${fatte} preparati ora${errori ? `, ${errori} errori` : ''}, ${pronti} auto con le righe pronte.`);
})().catch(e => { console.error('Cartelli non preparati: ' + e.message); process.exit(1); });
