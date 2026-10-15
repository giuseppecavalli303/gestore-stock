// Ricompone l'app dai sorgenti: node sorgenti/build.js
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const core = ['parser.js', 'norm.js', 'query.js'].map(src).join('\n');
const page = src('page.html').replace('/*__CORE__*/', () => core).replace('/*__UI__*/', () => src('ui.js'));
const root = path.join(__dirname, '..');
// versione per l'Artifact di claude.ai (senza scheletro HTML)
fs.writeFileSync(path.join(root, 'stock-usato.html'), page);
// versione completa per GitHub Pages e per l'apertura con doppio clic
// con quanto serve per installarla sul telefono come app (icona, schermo intero, funziona senza rete)
const testa = [
  '<meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
  '<meta name="theme-color" content="#0a5cf5">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">',
  '<meta name="apple-mobile-web-app-title" content="Stock Usato">',
  '<link rel="manifest" href="manifest.webmanifest">',
  '<link rel="icon" type="image/png" href="icone/icona-192.png">',
  '<link rel="apple-touch-icon" href="icone/apple-touch-icon.png">'
].join('');
const registra = `<script>if ('serviceWorker' in navigator && location.protocol === 'https:') addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));</script>`;
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="it"><head>' + testa + '</head><body>' + page + registra + '</body></html>');
console.log('ok', page.length);
