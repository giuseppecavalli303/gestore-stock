// Telecamera posteriore. Regola decisa con Giuseppe:
//   se l'elenco dotazioni del sito nomina la telecamera, il sistema cerca la conferma nelle foto dell'annuncio.
//   La conferma e' la foto dello schermo con l'immagine della retrocamera (vista dietro con le linee guida).
// Ogni auto viene controllata una volta sola (memoria in agente/telecamera-cache.json); il risultato finisce in data/stock.json.
// Uso: node agente/telecamera.js [--max N]   (N = quante auto nuove controllare al massimo in questo giro)
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'data', 'stock.json'), CACHE = path.join(__dirname, 'telecamera-cache.json'), FOTO = path.join(__dirname, 'foto-cache.json');
const ui = fs.readFileSync(path.join(root, 'sorgenti', 'ui.js'), 'utf8');
const AI_URL = (ui.match(/const AI_URL = '([^']*)'/)[1] || ''), TOKEN = (ui.match(/const AI_TOKEN = '([^']*)'/) || [])[1];
const iMax = process.argv.indexOf('--max'), MAX = iMax > 0 ? +process.argv[iMax + 1] : 400;
const PER_RICHIESTA = 12;                         // il servizio accetta al massimo 12 foto per richiesta
const pausa = ms => new Promise(r => setTimeout(r, ms));

const ISTRUZIONI = [
  "Ricevi alcune foto numerate dell'annuncio di un'auto usata (esterni e interni). Devi dire se TRA QUESTE FOTO ce n'e' una che mostra lo SCHERMO dell'auto con l'immagine della RETROCAMERA:",
  "la vista di cio' che c'e' dietro l'auto, di solito con le linee guida colorate (arancioni, gialle, rosse o verdi) che indicano la traiettoria in retromarcia, spesso con accanto la sagoma dell'auto vista dall'alto e i sensori di parcheggio.",
  "- 'si': almeno una foto mostra chiaramente quello schermo con l'immagine della retrocamera. In 'foto' metti il numero di quella foto.",
  "- 'no': nessuna foto mostra lo schermo con l'immagine della retrocamera (schermi con navigatore, radio, menu o sola sagoma dei sensori NON contano).",
  "Non usare 'non visibile'. In 'indizio' descrivi in massimo 12 parole cosa si vede nella foto decisiva, oppure 'nessuna foto della retrocamera'."
].join('\n');

async function chiedi(c, urls) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: TOKEN, azione: 'telecamera', istruzioni: ISTRUZIONI, auto: `${c.brand} ${c.modello}`, foto: urls }) });
    const s = await r.text();
    try { const j = JSON.parse(s); if (j.errore) throw new Error(j.errore); return j; }
    catch (e) { if (tentativo === 3) throw new Error(/^</.test(s) ? 'pagina di errore del servizio Google' : e.message); await pausa(3000 * tentativo); }
  }
}

(async () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let cache = {}, fotoTutte = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  try { fotoTutte = JSON.parse(fs.readFileSync(FOTO, 'utf8')); } catch (e) {}
  const base = data.meta.annunci && data.meta.annunci.fotoBase || 'https://cdn.dealerk.it/dealer/datafiles/vehicle/images/';
  const idDi = w => (w.url.match(/\/(\d+)\/?$/) || [])[1] || w.url;
  let fatte = 0, errori = 0, tin = 0, spesa = null;
  for (const c of data.cars) {
    const w = c.web;
    if (!w || !w.camLista || !w.foto || !w.foto.length) continue;
    const id = idDi(w);
    if (!cache[id] && fatte < MAX && AI_URL) {
      // tutte le foto della galleria a piena risoluzione; la foto dello schermo e' quasi sempre tra le ultime, quindi parto dal fondo
      const tutte = (fotoTutte[id] && fotoTutte[id].foto) || w.foto.map(f => base + '800/' + f);
      const gruppi = [];
      for (let fine = tutte.length; fine > 0; fine -= PER_RICHIESTA) gruppi.push(Math.max(0, fine - PER_RICHIESTA));
      try {
        let esito = null;
        const prova = async (urls, offset) => {
          const j = await chiedi(c, urls);
          if (j.uso) { tin += j.uso.ingresso; spesa = j.uso.mese; }
          await pausa(300);
          return { telecamera: j.telecamera === 'si' ? 'si' : 'no', foto: j.telecamera === 'si' && j.foto ? j.foto + offset : null, indizio: j.indizio || '' };
        };
        for (const k of gruppi) { esito = await prova(tutte.slice(k, k + PER_RICHIESTA), k); if (esito.telecamera === 'si') break; }
        // seconda verifica prima di dire "non confermata": le ultime foto (dove stanno interni e schermo) una per una
        if (esito.telecamera !== 'si') {
          for (let i = tutte.length - 1; i >= Math.max(0, tutte.length - 8); i--) { const e = await prova([tutte[i]], i); if (e.telecamera === 'si') { esito = e; break; } }
        }
        cache[id] = { esito: esito.telecamera, foto: esito.foto, url: esito.foto ? tutte[esito.foto - 1] : '', indizio: esito.indizio, nFoto: tutte.length, t: new Date().toISOString().slice(0, 10) };
        fatte++;
        if (fatte % 10 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
      } catch (e) { errori++; if (errori <= 3) console.error(`Errore su ${c.targa}: ${e.message}`); if (errori >= 6) { console.error('Troppi errori dal servizio, mi fermo.'); break; } }
    }
    if (cache[id]) w.cam = cache[id];
  }
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  fs.writeFileSync(FILE, JSON.stringify(data));
  const conf = data.cars.filter(c => c.web && c.web.cam && c.web.cam.esito === 'si').length, nonConf = data.cars.filter(c => c.web && c.web.cam && c.web.cam.esito === 'no').length;
  const daFare = data.cars.filter(c => c.web && c.web.camLista && !c.web.cam).length;
  console.log(`Telecamera: ${fatte} auto controllate ora${errori ? `, ${errori} errori` : ''}. Confermate dalla foto dello schermo ${conf}, non confermate ${nonConf}, ancora da controllare ${daFare}.` +
    (fatte ? ` Media ${Math.round(tin / fatte)} token per auto.${spesa ? ` Spesa del mese: ${spesa.spesa} $.` : ''}` : ''));
})().catch(e => { console.error('Controllo telecamera non riuscito: ' + e.message); process.exit(1); });
