// Ricompone l'app dai sorgenti: node sorgenti/build.js
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const core = ['parser.js', 'norm.js', 'query.js', 'finanza.js', 'valuta.js', 'valutatore-ui.js', 'cartello.js'].map(src).join('\n');
const page = src('page.html').replace('/*__CORE__*/', () => core).replace('/*__UI__*/', () => src('ui.js'));
const root = path.join(__dirname, '..');
// versione per l'Artifact di claude.ai (senza scheletro HTML)
fs.writeFileSync(path.join(root, 'stock-usato.html'), page);
// versione completa per GitHub Pages e per l'apertura con doppio clic
// con quanto serve per installarla sul telefono come app (icona, schermo intero, funziona senza rete)
const testa = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  '<meta name="theme-color" content="#182236">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Stock Usato">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/png" href="icone/icona-192.png">',
  '<link rel="apple-touch-icon" href="icone/apple-touch-icon.png">'
].join('');
const registra = `<script>if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>`;
// sul telefono il nome sotto l'icona viene dal titolo: corto, cosi' non si taglia
const pagina = page.replace('<title>Stock Usato Valentino</title>', '<title>Stock Usato</title>');
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="it"><head>' + testa + '</head><body>' + pagina + registra + '</body></html>');
// il simulatore di Giuseppe, senza provvigioni, per il tasto "Mio simulatore" della scheda
console.log(require('./simulatore.js').prepara(path.join(root, 'simulatore.html')));
// pagina per il cliente (preventivo e lista di auto): statica, la copio accanto all'app
fs.copyFileSync(path.join(__dirname, 'cliente.html'), path.join(root, 'cliente.html'));
// valutatore permute anche come pagina a se' (da aggiungere alla schermata Home): stessi stili e stesso codice dell'app
const ui = src('ui.js'), stile = src('page.html').match(/<style>[\s\S]*?<\/style>/)[0];
const servizio = k => (ui.match(new RegExp('const ' + k + " = '([^']+)'")) || [])[1];
fs.writeFileSync(path.join(root, 'valutatore.html'), src('valutatore.html').replace('<!--__STILE__-->', () => stile)
  .replace('/*__VAL__*/', () => ['valuta.js', 'valutatore-ui.js'].map(src).join('\n'))
  .replace('/*__AI_URL__*/', () => servizio('AI_URL')).replace('/*__AI_TOKEN__*/', () => servizio('AI_TOKEN')));
console.log('ok', page.length);
