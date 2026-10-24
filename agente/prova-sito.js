// Prova della vista "Prezzo diverso dal sito": ogni scheda dice in cosa differisce, e l'Excel ha le colonne della differenza.
// Uso: node agente/prova-sito.js
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
let errori = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  NO   ') + m); if (!c) errori++; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  // Excel finto: raccolgo le righe che l'app scriverebbe nel file
  await p.evaluateOnNewDocument(() => { window.XLSX = { utils: { json_to_sheet: r => { window.__righe = r; return {}; }, book_new: () => ({}), book_append_sheet() {} }, writeFile() {} }; });
  await p.goto('http://localhost:' + server.address().port + '/index.html?vista=venditore', { waitUntil: 'networkidle0' });
  await pausa(1000);
  await p.evaluate(() => document.querySelector('[data-preset="priceDiff"]').click());
  await pausa(600);
  const schede = await p.evaluate(() => [...document.querySelectorAll('#grid .card')].map(c => (c.querySelector('.sito-diff') || {}).textContent || ''));
  ok(schede.length > 0 && schede.every(t => /sito/i.test(t) && /€/.test(t)), `ogni scheda dice in cosa differisce dal sito (${schede.length} schede, es. "${schede[0]}")`);
  await p.evaluate(() => document.getElementById('btnExcel').click());
  await pausa(600);
  const righe = await p.evaluate(() => window.__righe || []);
  const r0 = righe[0] || {};
  ok(righe.length === schede.length && 'Prezzo sul sito' in r0 && 'Differenza sito - gestionale' in r0 && 'Differenza con il sito' in r0 && r0['Differenza con il sito'], `Excel con le colonne della differenza (${righe.length} righe: ${JSON.stringify({ sito: r0['Prezzo sul sito'], diff: r0['Differenza sito - gestionale'], nota: r0['Differenza con il sito'] })})`);
  // in modalita' cliente la differenza interna non si vede
  await p.evaluate(() => document.getElementById('btnCliente').click());
  await pausa(400);
  ok(await p.evaluate(() => !document.querySelector('#grid .sito-diff')), 'in modalità cliente la differenza con il sito non si vede');
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
