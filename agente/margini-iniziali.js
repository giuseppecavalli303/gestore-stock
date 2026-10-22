// Imposta margini, passaggio e ripristino del valutatore permute nel servizio Google (proprieta' VAL_CONFIG).
// I valori NON stanno nel repo pubblico: si passano con un file JSON locale.
// Uso: node agente/margini-iniziali.js percorso/margini.json [percorso/chiave-codici.txt]
const fs = require('fs'), path = require('path');
const ui = fs.readFileSync(path.join(__dirname, '..', 'sorgenti', 'ui.js'), 'utf8');
const URL = ui.match(/const AI_URL = '([^']+)'/)[1], TOKEN = ui.match(/const AI_TOKEN = '([^']+)'/)[1];
const [fileCfg, fileChiave = path.join(__dirname, 'chiave-codici.txt')] = process.argv.slice(2);
if (!fileCfg) { console.log('Uso: node agente/margini-iniziali.js margini.json [chiave-codici.txt]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(fileCfg, 'utf8'));
// il file della chiave e' un promemoria: la chiave e' sulla riga "Valore:"
const testo = fs.readFileSync(fileChiave, 'utf8'), chiave = (testo.match(/Valore:\s*(\S+)/) || [])[1] || testo.trim().split(/\s+/)[0];
(async () => {
  const r = await fetch(URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ token: TOKEN, azione: 'margini', chiave, cfg }) });
  const j = await r.json();
  console.log(j.errore ? 'ERRORE: ' + j.errore : 'Margini salvati: ' + JSON.stringify(j.cfg));
  process.exit(j.errore ? 1 : 0);
})();
