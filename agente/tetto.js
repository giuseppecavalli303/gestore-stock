// Tetto apribile o in vetro. Stessa regola della telecamera, decisa con Giuseppe:
//   se l'elenco dotazioni del sito nomina il tetto (apribile, panorama, in vetro o cristallo), il sistema cerca la conferma nelle foto.
//   La conferma e' una foto in cui si vede il vetro sul tetto (da fuori) o il pannello di vetro / la tendina nel cielo (da dentro).
// Ogni auto viene controllata una volta sola (memoria in agente/tetto-cache.json); il risultato finisce in data/stock.json.
// Uso: node agente/tetto.js [--max N]
const path = require('path');
const { controlla } = require('./controllo-foto.js');
const iMax = process.argv.indexOf('--max');

const ISTRUZIONI = [
  "Ricevi alcune foto numerate dell'annuncio di un'auto usata (esterni e interni). Devi dire se TRA QUESTE FOTO ce n'e' una che mostra il TETTO IN VETRO (tetto apribile, panoramico o in cristallo):",
  "- da fuori: un pannello di vetro scuro e lucido sul tetto, distinto dalla lamiera, di solito con una cornice o una guarnizione;",
  "- da dentro: un pannello di vetro o una tendina parasole nel cielo dell'abitacolo, oppure il cielo che lascia vedere il cielo esterno.",
  "Rispondi nel campo 'telecamera' (qui indica il TETTO IN VETRO, non una telecamera):",
  "- 'si': almeno una foto lo mostra chiaramente. In 'foto' metti il numero di quella foto.",
  "- 'no': nessuna foto lo mostra. NON contano: tetto in lamiera, tetto verniciato nero o di colore diverso dalla carrozzeria, barre portatutto, antenna, spoiler, finestrini laterali.",
  "Non usare 'non visibile'. In 'indizio' descrivi in massimo 12 parole cosa si vede nella foto decisiva, oppure 'nessuna foto del tetto in vetro'."
].join('\n');

// il tetto si vede nelle foto dall'alto/di tre quarti (all'inizio) e negli interni: le guardo tutte dall'inizio
controlla({ nome: 'Tetto in vetro', lista: 'tettoLista', esito: 'tetto', cache: path.join(__dirname, 'tetto-cache.json'), istruzioni: ISTRUZIONI, dalFondo: false, ultimeUnaAUna: 0, max: iMax > 0 ? +process.argv[iMax + 1] : 400 })
  .catch(e => { console.error('Controllo tetto non riuscito: ' + e.message); process.exit(1); });
