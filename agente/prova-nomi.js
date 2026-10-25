// Prova dei nomi dei clienti: con la chiave del link si vedono (solo modalita' venditore), senza chiave no.
// Uso: node agente/prova-nomi.js   (serve agente/chiave-clienti.txt)
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
let errori = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  NO   ') + m); if (!c) errori++; };
const chiave = require('./nomi.js').leggiChiave();

(async () => {
  if (!chiave) throw new Error('manca agente/chiave-clienti.txt');
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port + '/index.html?vista=venditore';
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const stock = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stock.json'), 'utf8'));
  const auto = stock.cars.find(c => c.acqX);
  const conta = p => p.evaluate(() => document.querySelectorAll('.who').length);
  const nomeScheda = (p, t) => p.evaluate(async t => { location.hash = ''; location.hash = t; await new Promise(r => setTimeout(r, 700)); const s = [...document.querySelectorAll('section')].find(x => /Prenotazione/.test(x.textContent)); const dt = s && [...s.querySelectorAll('dt')].find(d => d.textContent === 'Acquirente'); return dt ? dt.nextElementSibling.textContent : ''; }, t);

  const p = await b.newPage(); const err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto(base + '#clienti=' + chiave, { waitUntil: 'networkidle0' }); await pausa(1500);
  ok(await p.evaluate(() => !location.hash && !!localStorage.getItem('su.chiaveClienti')), 'il link salva la chiave e la toglie dall\u2019indirizzo');
  const n = (await nomeScheda(p, auto.targa)).trim();
  ok(n.length > 2, `con la chiave, nella scheda di ${auto.targa} c'\u00e8 il nome dell'acquirente (${n.length} lettere)`);
  const sch = await p.evaluate(async t => { location.hash = ''; const q = document.getElementById('q'); q.value = t; q.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 800)); return document.querySelectorAll('.who').length; }, auto.targa);
  ok(sch > 0, 'cercando la targa, nella scheda della prenotata compare il nome');
  await p.evaluate(() => document.getElementById('btnCliente').click()); await pausa(400);
  ok(!(await nomeScheda(p, auto.targa)).trim(), 'in modalit\u00e0 cliente il nome non si vede');
  ok(!err.length, 'nessun errore nella pagina ' + err.join(' | '));

  const ctx = await b.createBrowserContext(), q = await ctx.newPage();
  await q.goto(base, { waitUntil: 'networkidle0' }); await pausa(1500);
  await q.evaluate(() => { if (document.documentElement.classList.contains('cliente')) document.getElementById('btnCliente').click(); });
  ok(!(await nomeScheda(q, auto.targa)).trim(), 'senza chiave nessun nome, anche in modalit\u00e0 venditore');
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
