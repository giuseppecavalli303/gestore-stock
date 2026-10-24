// Prova della pagina del preventivo per il cliente (cliente.html) con un link modificato apposta:
// nessun pezzo di pagina iniettato, nessun link "javascript:", foto solo dal sito delle foto degli annunci.
// Uso: node agente/prova-cliente.js
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const server = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0])); fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html' : 'application/octet-stream' }); r.end(d); }); });
let errori = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  NO   ') + m); if (!c) errori++; };
const b64 = o => Buffer.from(JSON.stringify(o), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const X = '<img id=xss src=x>';

(async () => {
  await new Promise(r => server.listen(0, r));
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const p = await b.newPage();
  const base = 'http://localhost:' + server.address().port + '/cliente.html#p=';
  // preventivo normale: deve funzionare come prima
  await p.goto(base + b64({ n: 'Volkswagen T-Roc', m: 'Life 1.0 TSI', d: '2026-10-24', imm: '03/2023', km: 30000, pr: 21950, fu: 'Benzina', ca: 'Manuale', cv: 110, kw: 81, co: 'Nero', ga: 12, url: 'https://www.valentinoautomobili.it/auto/1', foto: ['https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800/1/a.jpg'], f: { t: 'PVV', rata: 248.5, nr: 35, dur: 36, ant: 3000, vfg: 9000, km: 15000, fin: 19330, tan: 8.99, taeg: 0.11, prima: 252.3, ist: 380, inc: 3.4, bol: 48.3, serv: ['Manutenzione'] } }), { waitUntil: 'load' });
  const norm = await p.evaluate(() => ({ testo: document.body.innerText, link: document.querySelector('.azioni a.pri') && document.querySelector('.azioni a.pri').href }));
  ok(/248,50/.test(norm.testo) && /12 mesi/.test(norm.testo) && /21\.950 €/.test(norm.testo) && /valentinoautomobili\.it/.test(norm.link || ''), 'preventivo normale: rata, prezzo e link al sito come prima');
  // preventivo manomesso: codice nei campi numerici, link javascript, foto da un altro sito
  await p.goto('about:blank');
  await p.goto(base + b64({ n: 'Auto', m: 'x', d: '2026-10-24', km: X, pr: X, cv: X, kw: X, url: 'javascript:alert(1)', foto: ['javascript:alert(2)', 'https://altrosito.example/x.jpg'], f: { t: 'PVV', rata: X, nr: X, dur: X, ant: X, vfg: X, km: X, fin: X, tan: 8.99, taeg: 0.11, prima: X, ist: X, inc: X, bol: X } }), { waitUntil: 'load' });
  const brutto = await p.evaluate(() => ({ xss: !!document.getElementById('xss'), js: [...document.querySelectorAll('a[href],img[src]')].some(e => /^javascript:/i.test(e.getAttribute('href') || e.getAttribute('src') || '')), altro: [...document.querySelectorAll('img[src]')].some(e => /altrosito/.test(e.src)) }));
  ok(!brutto.xss && !brutto.js && !brutto.altro, `preventivo manomesso reso innocuo (${JSON.stringify(brutto)})`);
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
