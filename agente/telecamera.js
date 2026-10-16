// Telecamera posteriore: quando l'elenco dotazioni del sito la nomina, chiede a Gemini di confermarla guardando le foto.
// Ogni auto viene controllata una volta sola (memoria in agente/telecamera-cache.json); il risultato finisce in data/stock.json.
// Uso: node agente/telecamera.js [--max N]   (N = quante auto nuove controllare al massimo in questo giro)
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'data', 'stock.json'), CACHE = path.join(__dirname, 'telecamera-cache.json');
const ui = fs.readFileSync(path.join(root, 'sorgenti', 'ui.js'), 'utf8');
const AI_URL = (ui.match(/const AI_URL = '([^']*)'/) || [])[1], TOKEN = (ui.match(/const AI_TOKEN = '([^']*)'/) || [])[1];
const iMax = process.argv.indexOf('--max'), MAX = iMax > 0 ? +process.argv[iMax + 1] : 400;
const pausa = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  const base = data.meta.annunci && data.meta.annunci.fotoBase || 'https://cdn.dealerk.it/dealer/datafiles/vehicle/images/';
  const idDi = w => (w.url.match(/\/(\d+)\/?$/) || [])[1] || w.url;
  let fatte = 0, errori = 0, tin = 0, tout = 0, spesa = null;
  for (const c of data.cars) {
    const w = c.web;
    if (!w || !w.camLista || !w.foto || !w.foto.length) continue;
    const id = idDi(w);
    if (!cache[id] && fatte < MAX && AI_URL) {
      try {
        const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: TOKEN, azione: 'telecamera', auto: `${c.brand} ${c.modello}`, foto: w.foto.map(f => base + '800/' + f) }) });
        const j = await r.json();
        if (j.errore) throw new Error(j.errore);
        cache[id] = { esito: j.telecamera, foto: j.foto || null, indizio: j.indizio || '', t: new Date().toISOString().slice(0, 10) };
        fatte++;
        if (j.uso) { tin += j.uso.ingresso; tout += j.uso.uscita; spesa = j.uso.mese; }
        if (fatte % 20 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
        await pausa(300);
      } catch (e) { errori++; if (errori >= 5) { console.error('Troppi errori dal servizio, mi fermo: ' + e.message); break; } }
    }
    if (cache[id]) w.cam = cache[id];
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  fs.writeFileSync(FILE, JSON.stringify(data));
  const st = { si: 0, no: 0, 'non visibile': 0 };
  data.cars.forEach(c => { if (c.web && c.web.cam) st[c.web.cam.esito] = (st[c.web.cam.esito] || 0) + 1; });
  const daFare = data.cars.filter(c => c.web && c.web.camLista && !c.web.cam).length;
  console.log(`Telecamera: ${fatte} auto controllate ora${errori ? `, ${errori} errori` : ''}. Confermate ${st.si}, non viste ${st.no}, non chiare ${st['non visibile']}, ancora da controllare ${daFare}.` +
    (fatte ? ` Media ${Math.round(tin / fatte)} token in ingresso per auto.${spesa ? ` Spesa del mese: ${spesa.spesa} $ (${spesa.domande} richieste).` : ''}` : ''));
})().catch(e => { console.error('Controllo telecamera non riuscito: ' + e.message); process.exit(1); });
