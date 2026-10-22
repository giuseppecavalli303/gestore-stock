// Telecamera posteriore. Regola decisa con Giuseppe:
//   se l'elenco dotazioni del sito nomina la telecamera, il sistema cerca la conferma nelle foto dell'annuncio.
//   La conferma e' la foto dello schermo con l'immagine della retrocamera (vista dietro con le linee guida).
// Ogni auto viene controllata una volta sola (memoria in agente/telecamera-cache.json); il risultato finisce in data/stock.json.
// Uso: node agente/telecamera.js [--max N]   (N = quante auto nuove controllare al massimo in questo giro)
const path = require('path');
const { controlla } = require('./controllo-foto.js');
const iMax = process.argv.indexOf('--max');

const ISTRUZIONI = [
  "Ricevi alcune foto numerate dell'annuncio di un'auto usata (esterni e interni). Devi dire se TRA QUESTE FOTO ce n'e' una che mostra lo SCHERMO dell'auto con l'immagine della RETROCAMERA:",
  "la vista di cio' che c'e' dietro l'auto, di solito con le linee guida colorate (arancioni, gialle, rosse o verdi) che indicano la traiettoria in retromarcia, spesso con accanto la sagoma dell'auto vista dall'alto e i sensori di parcheggio.",
  "- 'si': almeno una foto mostra chiaramente quello schermo con l'immagine della retrocamera. In 'foto' metti il numero di quella foto.",
  "- 'no': nessuna foto mostra lo schermo con l'immagine della retrocamera (schermi con navigatore, radio, menu o sola sagoma dei sensori NON contano).",
  "Non usare 'non visibile'. In 'indizio' descrivi in massimo 12 parole cosa si vede nella foto decisiva, oppure 'nessuna foto della retrocamera'."
].join('\n');

// la foto dello schermo e' quasi sempre tra le ultime: parto dal fondo e ricontrollo le ultime 8 una per una
controlla({ nome: 'Telecamera', lista: 'camLista', esito: 'cam', cache: path.join(__dirname, 'telecamera-cache.json'), istruzioni: ISTRUZIONI, dalFondo: true, ultimeUnaAUna: 8, max: iMax > 0 ? +process.argv[iMax + 1] : 400 })
  .catch(e => { console.error('Controllo telecamera non riuscito: ' + e.message); process.exit(1); });
