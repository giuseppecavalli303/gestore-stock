// Prova del tasto "Cartello salone": nella scheda dell'auto (vista venditore) apre il PDF compilato; in modalita' cliente non c'e'.
// Uso: node agente/prova-cartello.js
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.pdf': 'application/pdf', '.png': 'image/png' };
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream' }); r.end(d); }); });
let errori = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  NO   ') + m); if (!c) errori++; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  const err = []; p.on('pageerror', e => err.push(e.message));
  await p.setViewport({ width: 1440, height: 900 });
  // il servizio Google finto: registra la richiesta e risponde con due righe di dotazioni
  let richiesta = null;
  await p.setRequestInterception(true);
  p.on('request', q => {
    if (/script\.google\.com/.test(q.url())) { try { const j = JSON.parse(q.postData() || '{}'); if (j.azione === 'cartello') richiesta = j; } catch (e) {}
      return q.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({ nome: 'Volkswagen Prova', righe: ['NAVIGATORE - CERCHI 17"', 'PARK PILOT'] }) }); }
    q.continue();
  });
  // la finestra del PDF: registro l'indirizzo che l'app ci mette dentro
  await p.evaluateOnNewDocument(() => { window.open = () => { const f = { location: {}, close() { f.chiusa = true; } }; window.__finestra = f; return f; }; });
  const stock = JSON.parse(fs.readFileSync(path.join(root, 'data', 'stock.json'), 'utf8'));
  const auto = stock.cars.find(c => c.web && c.brand === 'Volkswagen' && c.prezzo);
  await p.goto('http://localhost:' + server.address().port + '/index.html?vista=venditore#' + auto.targa, { waitUntil: 'networkidle0' });
  await pausa(1500);
  ok(await p.evaluate(() => !!document.getElementById('dCartello')), `tasto "Cartello salone" nella scheda di ${auto.targa}`);
  await p.evaluate(() => document.getElementById('dCartello').click());
  await p.waitForFunction(() => window.__finestra && /^blob:/.test(window.__finestra.location.href || ''), { timeout: 20000 }).catch(() => {});
  const pdf = await p.evaluate(async () => { const u = window.__finestra && window.__finestra.location.href; if (!u) return null; const bb = await (await fetch(u)).arrayBuffer();
    const f = (await PDFLib.PDFDocument.load(bb)).getForm();
    return { n: bb.byteLength, inizio: String.fromCharCode(...new Uint8Array(bb.slice(0, 5))), nome: f.getTextField('NOME 2').getText(), riga: f.getTextField('TESTO10').getText() }; });
  ok(pdf && pdf.inizio === '%PDF-' && pdf.n > 100000, `si apre il PDF compilato (${pdf ? pdf.n + ' byte' : 'niente'})`);
  ok(richiesta && richiesta.url === auto.web.url && !richiesta.dotazioni, `il tasto manda l'automazione per quell'auto sola (${richiesta && richiesta.url})`);
  ok(pdf && pdf.nome === 'Volkswagen Prova' && pdf.riga === 'NAVIGATORE - CERCHI 17"', `le dotazioni scelte finiscono sul cartello (${pdf && pdf.riga})`);
  const t = await p.evaluate(() => document.getElementById('toast').textContent);
  ok(/Cartello Usato Certificato/.test(t) && !/a mano/.test(t), `messaggio: ${t}`);
  await p.evaluate(() => document.getElementById('btnCliente').click()); await pausa(300);
  await p.evaluate(t => { location.hash = ''; location.hash = t; }, auto.targa); await pausa(800);
  ok(await p.evaluate(() => !document.getElementById('dCartello')), 'in modalità cliente il tasto non c\u2019è');
  ok(!err.length, 'nessun errore nella pagina ' + err.join(' | '));
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
