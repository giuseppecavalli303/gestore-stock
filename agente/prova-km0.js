// Prova delle Km 0 nell'app: vista rapida "Km 0", bollino sulle schede e nel dettaglio, bollino nella pagina per il cliente.
// Uso: node agente/prova-km0.js [cartella-per-le-foto]
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..'), OUT = process.argv[2] || __dirname;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
let errori = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  NO   ') + m); if (!c) errori++; };

(async () => {
  const stock = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stock.json'), 'utf8'));
  const { km0 } = new Function(['parser.js', 'norm.js', 'query.js'].map(f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8')).join('\n') + '\nreturn { km0 };')();
  const attese = stock.cars.filter(km0).length, una = stock.cars.find(c => km0(c) && c.web), altra = stock.cars.find(c => !km0(c) && c.web);
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto(base + '/index.html?vista=venditore', { waitUntil: 'networkidle0' });
  await pausa(1200);
  const chip = await p.evaluate(() => { const c = document.querySelector('[data-preset="km0"]'); return c ? c.textContent : ''; });
  ok(new RegExp('Km 0\\D*' + attese).test(chip), `vista rapida "Km 0" con ${attese} auto (${chip.trim()})`);
  await p.evaluate(() => document.querySelector('[data-preset="km0"]').click());
  await pausa(600);
  const schede = await p.evaluate(() => [...document.querySelectorAll('#grid .card')].map(c => !!c.querySelector('.bollo-km0')));
  ok(schede.length > 0 && schede.every(Boolean), `nella vista Km 0 tutte le schede hanno il bollino (${schede.filter(Boolean).length}/${schede.length})`);
  await (await p.$('#grid .card')).screenshot({ path: path.join(OUT, 'km0-scheda.png') });
  await p.evaluate(t => { location.hash = t; }, una.targa); await pausa(900);
  ok(await p.evaluate(() => !!document.querySelector('#drawer .bollo-km0, #drawer .pill.km0')), `nel dettaglio di ${una.targa} c'e' il bollino Km 0`);
  await p.evaluate(t => { location.hash = t; }, altra.targa); await pausa(900);
  ok(await p.evaluate(() => !document.querySelector('#drawer .bollo-km0, #drawer .pill.km0')), `nel dettaglio di ${altra.targa} (non Km 0) niente bollino`);
  await p.goto(base + '/cliente.html#l=' + una.targa + ',' + altra.targa, { waitUntil: 'networkidle0' }); await pausa(500);
  ok(await p.evaluate(() => document.querySelectorAll('.bollo-km0').length === 1), 'pagina per il cliente: bollino solo sulla Km 0');
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
