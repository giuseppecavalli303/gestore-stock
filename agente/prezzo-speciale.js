// Prezzo speciale: l'auto e' pubblicata a prezzo speciale se nella prima foto dell'annuncio c'e' il bollino arancione
// "PREZZO SPECIALE". Serve al cartello salone (modelli PS-). Una volta per auto (agente/prezzo-speciale-cache.json).
// Uso: node agente/prezzo-speciale.js [--max N]
const path = require('path');
const { controlla } = require('./controllo-foto.js');
const iMax = process.argv.indexOf('--max');

const ISTRUZIONI = [
  "Ricevi la prima foto dell'annuncio di un'auto usata. Devi dire se sulla foto c'e' il bollino o l'etichetta grafica con la scritta PREZZO SPECIALE (di solito arancione, in alto a sinistra).",
  "Rispondi nel campo 'telecamera' (qui indica il bollino PREZZO SPECIALE, non una telecamera):",
  "- 'si': il bollino PREZZO SPECIALE c'e'. In 'foto' metti 1.",
  "- 'no': non c'e' (non contano altri bollini come IVA ESPOSTA o le scritte in basso sulla garanzia).",
  "Non usare 'non visibile'. In 'indizio' scrivi in massimo 8 parole cosa vedi."
].join('\n');

controlla({ nome: 'Prezzo speciale', lista: 'foto', esito: 'ps', cache: path.join(__dirname, 'prezzo-speciale-cache.json'), istruzioni: ISTRUZIONI, dalFondo: false, prime: 1, ultimeUnaAUna: 0, max: iMax > 0 ? +process.argv[iMax + 1] : 400 })
  .catch(e => { console.error('Controllo prezzo speciale non riuscito: ' + e.message); process.exit(1); });
