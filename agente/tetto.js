// Tetto apribile. Stessa regola della telecamera, decisa con Giuseppe:
//   se l'elenco dotazioni del sito nomina il tetto (apribile, panorama, in vetro o cristallo), il sistema cerca la conferma nelle foto.
//   Le auto con tetto apribile vengono fotografate con il tetto APERTO: conta solo una foto con il tetto aperto.
//   Il vetro chiuso non basta ("deve essere aperto, ignora il resto").
// Ogni auto viene controllata una volta sola (memoria in agente/tetto-cache.json); il risultato finisce in data/stock.json.
// Uso: node agente/tetto.js [--max N]
const path = require('path');
const { controlla } = require('./controllo-foto.js');
const iMax = process.argv.indexOf('--max');

const ISTRUZIONI = [
  "Ricevi alcune foto numerate dell'annuncio di un'auto usata (esterni e interni). Devi dire se TRA QUESTE FOTO ce n'e' una che mostra il TETTO APERTO:",
  "il pannello di vetro del tetto spostato indietro o sollevato, con l'apertura da cui si vede direttamente il cielo o il soffitto del capannone, da dentro o da fuori.",
  "Rispondi nel campo 'telecamera' (qui indica il TETTO APERTO, non una telecamera):",
  "Attenzione: le foto sono fatte in uno studio bianco, quindi attraverso un vetro CHIUSO si vede lo stesso soffitto bianco. Il vetro chiaro da solo NON vuol dire aperto.",
  "Conta come aperto solo se si vede il PANNELLO SPOSTATO: il bordo posteriore del vetro sollevato e inclinato verso l'alto, oppure il vetro fatto scorrere sopra il tetto con un'apertura netta senza vetro davanti.",
  "- 'si': almeno una foto mostra chiaramente il pannello sollevato o spostato. In 'foto' metti il numero di quella foto.",
  "- 'no': nessuna foto mostra il pannello sollevato o spostato, oppure non ne sei sicuro. NON contano: tetto in vetro chiuso, tendina parasole chiusa, tetto in lamiera o verniciato, barre portatutto, capote in tela di una cabrio, finestrini laterali.",
  "Non usare 'non visibile'. In 'indizio' descrivi in massimo 12 parole cosa si vede nella foto decisiva, oppure 'nessuna foto con il tetto aperto'."
].join('\n');

controlla({ nome: 'Tetto apribile', lista: 'tettoLista', esito: 'tetto', cache: path.join(__dirname, 'tetto-cache.json'), istruzioni: ISTRUZIONI, dalFondo: false, ultimeUnaAUna: 0, riconferma: true, max: iMax > 0 ? +process.argv[iMax + 1] : 400 })
  .catch(e => { console.error('Controllo tetto non riuscito: ' + e.message); process.exit(1); });
