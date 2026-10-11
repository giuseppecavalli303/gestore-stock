// Ricompone l'app dai sorgenti: node sorgenti/build.js
const fs = require('fs'), path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, f), 'utf8');
const core = ['parser.js', 'norm.js', 'query.js'].map(src).join('\n');
const page = src('page.html').replace('/*__CORE__*/', () => core).replace('/*__UI__*/', () => src('ui.js'));
const root = path.join(__dirname, '..');
// versione per l'Artifact di claude.ai (senza scheletro HTML)
fs.writeFileSync(path.join(root, 'stock-usato.html'), page);
// versione completa per GitHub Pages e per l'apertura con doppio clic
fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>' + page + '</body></html>');
console.log('ok', page.length);
