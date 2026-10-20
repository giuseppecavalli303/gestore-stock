// Prepara simulatore.html per il sito partendo dal simulatore di Giuseppe (Documents\simulatore vw\simulatore-vw.html).
// L'originale resta sul PC: contiene le provvigioni e non va pubblicato. Qui si tolgono provvigioni, manifest e
// service worker dell'app separata, e si aggiunge la compilazione automatica dalla scheda di Stock Usato
// (?modello=...&prezzo=...&nuovo=...&tipo=pvv|multimake|classico). Con "nuovo" il VFG si calcola sul prezzo da nuovo.
// Se l'originale cambia in un punto toccato qui, la build si ferma e lo dice: meglio che pubblicare una provvigione.
const fs = require('fs'), path = require('path');

const ORIGINALE = path.join(process.env.USERPROFILE || 'C:/Users/Venditore32', 'Documents', 'simulatore vw', 'simulatore-vw.html');

function prepara(destinazione) {
  if (!fs.existsSync(ORIGINALE)) return `simulatore non aggiornato: manca ${ORIGINALE}`;
  let h = fs.readFileSync(ORIGINALE, 'utf8').replace(/\r\n/g, '\n');
  const togli = (re, cosa, sost = '') => { if (!re.test(h)) throw new Error(`Simulatore: non trovo ${cosa}. Controlla sorgenti/simulatore.js prima di pubblicare.`); h = h.replace(re, sost); };
  // provvigioni: mai sul sito
  togli(/\s*<!-- Provvigione:[^\n]*-->\s*<div[^>]*>\s*<span id="res-provvigione"[^>]*><\/span>\s*<\/div>/, 'il riquadro della provvigione', '\n');
  togli(/\s*\/\/ Provvigione concessionario[^\n]*\n\s*provvigioni: \{[\s\S]*?\n\s*\},/, 'la tabella delle provvigioni');
  togli(/\n\s*const P = CONFIG\.provvigioni\[tipoFinanziamento\];\n\s*const provvigione = [^\n]*/, 'il calcolo della provvigione');
  togli(/, provvigione\n/, 'la provvigione nel risultato', '\n');
  togli(/\n\s*document\.getElementById\('res-provvigione'\)[^\n]*/, 'la provvigione a video');
  if (/provvigion/i.test(h)) throw new Error('Simulatore: dopo la pulizia compare ancora la parola provvigione. Non pubblico.');
  // l'app separata del simulatore (manifest, icone, service worker) non serve dentro Stock Usato
  togli(/\s*<link rel="manifest" href="manifest\.webmanifest">/, 'il manifest');
  h = h.replace(/href="icon-192\.png"/g, 'href="icone/icona-192.png"');
  togli(/\n\s*\/\/ App installabile[^\n]*\n\s*if \('serviceWorker' in navigator[\s\S]*?\n\s*\}\n/, 'il service worker', '\n');
  // VFG: cursore dal 30 al 70%, sul prezzo da nuovo quando la scheda lo passa
  togli(/<label for="vfg" class="([^"]*)">Valore Futuro Garantito \(Su Prezzo Vendita\)<\/label>/, "l'etichetta del VFG", '<label for="vfg" id="vfg-label" class="$1">Valore Futuro Garantito (Su Prezzo Vendita)</label>');
  togli(/<input type="range" id="vfg" min="30" max="75"/, 'il cursore del VFG', '<input type="range" id="vfg" min="30" max="70"');
  togli(/let anticipoInEuro = false;([^\n]*)\n/, "l'inizio delle variabili", `let anticipoInEuro = false;$1\n        // compilato dalla scheda di Stock Usato\n        const QP = new URLSearchParams(location.search);\n        const BASE_VFG = +QP.get('nuovo') || 0;   // prezzo da nuovo del listino: se c'e', il VFG si calcola su questo\n`);
  togli(/vfgEuro = round2\(prezzoVeicolo \* \(vfgPercent \/ 100\)\);/, 'il calcolo del VFG', 'vfgEuro = round2((BASE_VFG || prezzoVeicolo) * (vfgPercent / 100));');
  togli(/`Pari al \$\{d\.vfgPercent\}% del valore vettura/, 'la descrizione del VFG', "`Pari al ${d.vfgPercent}% ${BASE_VFG ? 'del prezzo da nuovo' : 'del valore vettura'}");
  togli(/\n(\s*)\/\/ Avvio\n/, "l'avvio", `\n$1// Avvio\n$1if (QP.get('modello')) document.getElementById('modello_veicolo').value = QP.get('modello');\n$1if (+QP.get('prezzo') > 0) prezzoInput.value = (+QP.get('prezzo')).toFixed(2);\n$1if (BASE_VFG) document.getElementById('vfg-label').textContent = 'Valore Futuro Garantito (su prezzo da nuovo ' + formatCurrency(BASE_VFG) + ')';\n`);
  togli(/\n(\s*)switchMode\('pvv'\);\n(\s*)servizioManutenzioneCb\.dispatchEvent/, "la scelta iniziale del finanziamento", `\n$1switchMode(['pvv', 'multimake', 'classico'].includes(QP.get('tipo')) ? QP.get('tipo') : 'pvv');\n$1applicaPercentuale();\n$2servizioManutenzioneCb.dispatchEvent`);
  fs.writeFileSync(destinazione, h);
  return 'simulatore aggiornato';
}

module.exports = { prepara };
if (require.main === module) console.log(prepara(path.join(__dirname, '..', 'simulatore.html')));
