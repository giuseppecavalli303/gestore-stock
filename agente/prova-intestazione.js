// Prova sul telefono: scorrendo in giu' resta in vista solo la ricerca, scorrendo in su torna tutta l'intestazione.
// Uso: node agente/prova-intestazione.js [cartella-per-le-foto]
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
  await new Promise(r => server.listen(0, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.goto('http://localhost:' + server.address().port + '/index.html', { waitUntil: 'networkidle0' });
  await pausa(1200);
  // app installata: niente "Installa app" (come sul telefono di Giuseppe); il caricamento sta sulla riga del marchio, accanto a Cliente
  await p.evaluate(() => { document.getElementById('btnInstall').hidden = true; });
  const riga = await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { cliente: r('#btnCliente').top, load: r('#btnLoad').top, alto: r('.top').height }; });
  ok(Math.abs(riga.cliente - riga.load) < 4 && riga.alto < 150, `intestazione su due righe: Cliente e carica PDF sulla stessa riga (altezza ${Math.round(riga.alto)} px)`);
  const pos = () => p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { brand: r('.top .brand').bottom, search: r('.top .search').top, load: r('#btnLoad').bottom }; });
  const scorri = async y => { await p.evaluate(y => window.scrollTo(0, y), y); await pausa(450); };
  for (const y of [200, 600, 1200]) await scorri(y);
  const giu = await pos();
  await p.screenshot({ path: path.join(OUT, 'intestazione-giu.png') });
  ok(giu.brand <= 0 && giu.load <= 0 && giu.search >= 0 && giu.search <= 20, `scorrendo in giu' resta solo la ricerca in alto (marchio ${Math.round(giu.brand)}, tasti ${Math.round(giu.load)}, ricerca ${Math.round(giu.search)})`);
  await scorri(1100); await scorri(1050);
  const su = await pos();
  await p.screenshot({ path: path.join(OUT, 'intestazione-su.png') });
  ok(su.brand > 0 && su.search > su.brand, `scorrendo un po' in su torna tutta l'intestazione (marchio ${Math.round(su.brand)}, ricerca ${Math.round(su.search)})`);
  await pausa(1500);
  const ferma = await pos();
  ok(ferma.brand > 0, `e resta li', non torna su da sola (marchio ${Math.round(ferma.brand)})`);
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
