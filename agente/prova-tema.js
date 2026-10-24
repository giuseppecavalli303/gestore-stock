// Prova del tema "Linear" (versione 3 scelta da Giuseppe): fondo pieno, carattere Inter, Ctrl+K per la ricerca sul PC.
// Uso: node agente/prova-tema.js [cartella-per-le-foto]
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
  const base = 'http://localhost:' + server.address().port;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  for (const [nome, vp, schema] of [['pc-scuro', { width: 1440, height: 900 }, 'dark'], ['pc-chiaro', { width: 1440, height: 900 }, 'light'], ['telefono-scuro', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'dark'], ['telefono-chiaro', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, 'light']]) {
    const p = await b.newPage();
    const err = []; p.on('pageerror', e => err.push(e.message));
    await p.setViewport(vp);
    await p.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: schema }]);
    await p.goto(base + '/index.html?vista=venditore', { waitUntil: 'networkidle0' });
    await p.evaluate(() => document.fonts.ready);
    await pausa(800);
    const t = await p.evaluate(() => ({ sky: !!document.querySelector('.sky'), font: getComputedStyle(document.body).fontFamily, bg: getComputedStyle(document.body).backgroundColor, kbd: (() => { const k = document.querySelector('.kbd-k'); return k ? getComputedStyle(k).display : 'manca'; })() }));
    ok(!t.sky && /Inter/.test(t.font), `${nome}: niente fondo animato, carattere Inter`);
    ok(schema === 'dark' ? t.bg === 'rgb(8, 9, 10)' : t.bg === 'rgb(247, 248, 248)', `${nome}: fondo ${t.bg}`);
    if (nome.startsWith('pc')) {
      ok(t.kbd !== 'none' && t.kbd !== 'manca', `${nome}: segnale "Ctrl K" nella ricerca`);
      await p.keyboard.down('Control'); await p.keyboard.press('KeyK'); await p.keyboard.up('Control');
      ok(await p.evaluate(() => document.activeElement && document.activeElement.id === 'q'), `${nome}: Ctrl+K porta nella ricerca`);
      await p.evaluate(() => document.activeElement.blur());
    } else ok(t.kbd === 'none' || t.kbd === 'manca', `${nome}: niente "Ctrl K" sul telefono`);
    await p.screenshot({ path: path.join(OUT, `tema-${nome}.png`) });
    ok(!err.length, `${nome}: nessun errore nella pagina ${err.join(' | ')}`);
    await p.close();
  }
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
