// Conferma dalle foto di una dotazione nominata nell'elenco del sito (telecamera, tetto in vetro...).
// Regola decisa con Giuseppe: la dotazione vale solo se l'elenco del sito la nomina E una foto dell'annuncio la mostra.
// Gemini guarda le foto attraverso il servizio Google (azione 'telecamera': risponde si/no nel campo 'telecamera').
// Ogni auto viene controllata una volta sola (memoria nel file cache); il risultato finisce in data/stock.json.
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const FILE = path.join(root, 'data', 'stock.json'), FOTO = path.join(__dirname, 'foto-cache.json');
const ui = fs.readFileSync(path.join(root, 'sorgenti', 'ui.js'), 'utf8');
const AI_URL = (ui.match(/const AI_URL = '([^']*)'/)[1] || ''), TOKEN = (ui.match(/const AI_TOKEN = '([^']*)'/) || [])[1];
const PER_RICHIESTA = 12;                         // il servizio accetta al massimo 12 foto per richiesta
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function chiedi(istruzioni, c, urls) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: TOKEN, azione: 'telecamera', istruzioni, auto: `${c.brand} ${c.modello}`, foto: urls }) });
    const s = await r.text();
    try { const j = JSON.parse(s); if (j.errore) throw new Error(j.errore); return j; }
    catch (e) { if (tentativo === 3) throw new Error(/^</.test(s) ? 'pagina di errore del servizio Google' : e.message); await pausa(3000 * tentativo); }
  }
}

// opz: { nome, lista: campo di web con la frase delle dotazioni, esito: campo di web dove va il risultato, cache: file,
//        istruzioni, dalFondo: le foto decisive stanno di solito in fondo alla galleria, ultimeUnaAUna: quante ricontrollare una per una, max,
//        riconferma: ogni 'si' viene ricontrollato sulla sola foto indicata }
async function controlla(opz) {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  let cache = {}, fotoTutte = {};
  try { cache = JSON.parse(fs.readFileSync(opz.cache, 'utf8')); } catch (e) {}
  try { fotoTutte = JSON.parse(fs.readFileSync(FOTO, 'utf8')); } catch (e) {}
  const base = data.meta.annunci && data.meta.annunci.fotoBase || 'https://cdn.dealerk.it/dealer/datafiles/vehicle/images/';
  const idDi = w => (w.url.match(/\/(\d+)\/?$/) || [])[1] || w.url;
  let fatte = 0, errori = 0, tin = 0, spesa = null;
  for (const c of data.cars) {
    const w = c.web;
    if (!w || !w[opz.lista] || !w.foto || !w.foto.length) continue;
    const id = idDi(w);
    if (!cache[id] && fatte < opz.max && AI_URL) {
      // tutte le foto della galleria a piena risoluzione
      const tutte = ((fotoTutte[id] && fotoTutte[id].foto) || w.foto.map(f => base + '800/' + f)).slice(0, opz.prime || 1000);   // prime: guarda solo le prime N foto
      const gruppi = [];
      if (opz.dalFondo) for (let fine = tutte.length; fine > 0; fine -= PER_RICHIESTA) gruppi.push(Math.max(0, fine - PER_RICHIESTA));
      else for (let k = 0; k < tutte.length; k += PER_RICHIESTA) gruppi.push(k);
      try {
        let esito = null;
        const prova = async (urls, offset) => {
          const j = await chiedi(opz.istruzioni, c, urls);
          if (j.uso) { tin += j.uso.ingresso; spesa = j.uso.mese; }
          await pausa(300);
          return { si: j.telecamera === 'si', foto: j.telecamera === 'si' && j.foto ? j.foto + offset : null, indizio: j.indizio || '' };
        };
        for (const k of gruppi) {
          esito = await prova(tutte.slice(k, k + PER_RICHIESTA), k);
          if (!esito.si) continue;
          if (!opz.riconferma) break;
          // riconferma: la foto indicata da sola; se non regge, le foto del gruppo una per una (cosi' anche il numero e' quello giusto)
          const sola = esito.foto ? await prova([tutte[esito.foto - 1]], esito.foto - 1) : { si: false };
          if (sola.si) { esito = sola; break; }
          esito = { si: false, foto: null, indizio: '' };
          for (let i = k; i < Math.min(tutte.length, k + PER_RICHIESTA); i++) { const e = await prova([tutte[i]], i); if (e.si) { esito = e; break; } }
          if (esito.si) break;
        }
        // seconda verifica prima di dire "non confermata": le ultime foto una per una
        if (!esito.si) {
          for (let i = tutte.length - 1; i >= Math.max(0, tutte.length - (opz.ultimeUnaAUna || 0)); i--) { const e = await prova([tutte[i]], i); if (e.si) { esito = e; break; } }
        }
        cache[id] = { esito: esito.si ? 'si' : 'no', foto: esito.foto, url: esito.foto ? tutte[esito.foto - 1] : '', indizio: esito.indizio, nFoto: tutte.length, t: new Date().toISOString().slice(0, 10) };
        fatte++;
        if (fatte % 10 === 0) fs.writeFileSync(opz.cache, JSON.stringify(cache));
      } catch (e) { if (/Limite di spesa|Credito Gemini/i.test(e.message)) { console.error(`Gemini non disponibile: ${e.message} Le auto restano da controllare, riprovo al giro dopo.`); break; } errori++; if (errori <= 3) console.error(`Errore su ${c.targa}: ${e.message}`); if (errori >= 6) { console.error('Troppi errori dal servizio, mi fermo.'); break; } }
    }
    if (cache[id]) w[opz.esito] = cache[id];
  }
  fs.writeFileSync(opz.cache, JSON.stringify(cache));
  fs.writeFileSync(FILE, JSON.stringify(data));
  const conta = es => data.cars.filter(c => c.web && c.web[opz.esito] && c.web[opz.esito].esito === es).length;
  const daFare = data.cars.filter(c => c.web && c.web[opz.lista] && !c.web[opz.esito]).length;
  console.log(`${opz.nome}: ${fatte} auto controllate ora${errori ? `, ${errori} errori` : ''}. Confermate dalle foto ${conta('si')}, non confermate ${conta('no')}, ancora da controllare ${daFare}.` +
    (fatte ? ` Media ${Math.round(tin / fatte)} token per auto.${spesa ? ` Spesa del mese: ${spesa.spesa} $.` : ''}` : ''));
}

module.exports = { controlla };
