// Nomi dei clienti nello stock pubblicato: viaggiano cifrati (AES-256-GCM), li legge solo chi ha la chiave.
// La chiave sta in agente/chiave-clienti.txt (mai pubblicata); chi apre una volta il link con #clienti=<chiave> la tiene sul suo dispositivo.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const FILE = path.join(__dirname, 'chiave-clienti.txt');

function leggiChiave() {
  try { const k = fs.readFileSync(FILE, 'utf8').trim(); return Buffer.from(k, 'base64url').length === 32 ? k : null; } catch (e) { return null; }
}
function nuovaChiave() { return crypto.randomBytes(32).toString('base64url'); }
// risultato in base64: iv (12 byte) + testo cifrato + tag (16 byte), come lo vuole WebCrypto
function cifra(testo, chiave) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', Buffer.from(chiave, 'base64url'), iv);
  return Buffer.concat([iv, c.update(String(testo), 'utf8'), c.final(), c.getAuthTag()]).toString('base64');
}

module.exports = { leggiChiave, nuovaChiave, cifra, FILE };

// Uso: node agente/nomi.js  -> crea la chiave se manca e stampa il link da dare ai colleghi
if (require.main === module) {
  let k = leggiChiave();
  if (!k) { k = nuovaChiave(); fs.writeFileSync(FILE, k); console.log('Chiave nuova creata in ' + FILE); }
  console.log('https://giuseppecavalli303.github.io/gestore-stock/#clienti=' + k);
}
