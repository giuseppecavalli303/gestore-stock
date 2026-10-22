// Prova della schermata del valutatore permute nell'app, con il servizio Google simulato.
// Uso: node agente/prova-valutatore.js [cartella-per-le-foto]
const fs = require('fs'), path = require('path'), http = require('http');
const puppeteer = require('puppeteer-core');
const root = path.join(__dirname, '..');
const OUT = process.argv[2] || path.join(root, 'agente');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const pausa = ms => new Promise(r => setTimeout(r, ms));

const A = (p, km, anno, extra) => Object.assign({ portale: 'autoscout', id: 'as:' + p + km, url: 'https://www.autoscout24.it/a', titolo: 'Renault Clio 0.9 TCe GPL Energy', marca: 'Renault', modello: 'Clio', versione: '0.9 TCe 90 CV GPL Energy', alimentazione: 'GPL', anno, km, prezzo: p, venditore: 'concessionario', citta: 'Roma', giorni: null }, extra);
const FINTO = {
  valuta: { auto: { marca: 'Renault', modello: 'Clio', alimentazione: 'GPL', anno: 2013, km: 120000, versione: '0.9 TCe Energy', allestimento: 'Energy', motore: '0.9 TCe', slug: { marca: 'renault', modello: 'clio' } }, mancano: [],
    annunci: [A(6300, 120000, 2013), A(6200, 118000, 2013), A(6400, 125000, 2014), A(6100, 130000, 2012), A(6900, 110000, 2013),
      A(6000, 121000, 2013, { venditore: 'privato', portale: 'subito', id: 'su:1', giorni: 40 }), A(5900, 122000, 2013, { venditore: 'privato', portale: 'subito', id: 'su:2', giorni: 12 }),
      A(6050, 119000, 2013, { id: 'as:x', venditore: '<img id=xss src=x>', url: 'javascript:alert(1)', giorni: '<b>1</b>' })],
    venduti: [A(6250, 119000, 2013, { id: 'as:v', ultimaVista: '2026-10-01T10:00:00Z' })], portali: { autoscout: 5, subito: 2, automobile: 'errore' },
    cfg: { passaggio: 777, ripristino: 333, nostro: [{ fino: 8000, euro: 1111 }, { fino: 15000, euro: 1717 }, { fino: 25000, euro: 2323 }, { fino: null, perc: 7 }], commerciante: [{ fino: 8000, euro: 1333 }, { fino: 15000, euro: 1919 }, { fino: 25000, euro: 2727 }, { fino: null, perc: 11 }] } },
  salvaValutazione: { id: 'id-1' },
  margini: { cfg: { passaggio: 777, ripristino: 333, nostro: [{ fino: 8000, euro: 1111 }, { fino: null, perc: 7 }], commerciante: [{ fino: 8000, euro: 1333 }, { fino: null, perc: 11 }] } },
  ultime: { valutazioni: [{ id: 'id-1', data: '2026-10-22T10:00:00Z', frase: 'Clio GPL Energy 120000 km del 2013', targa: 'AB123CD', mercato: 6300, offertaTeniamo: 5200, offertaCommerciante: 4400 }] }
};

const tipi = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const server = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': tipi[path.extname(f)] || 'application/octet-stream' }); r.end(d); });
});

let errori = 0;
const ok = (c, m) => { console.log((c ? '  ok   ' : '  NO   ') + m); if (!c) errori++; };

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = 'http://localhost:' + server.address().port;
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  for (const [nome, vp] of [['telefono', { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ['pc', { width: 1440, height: 900 }]]) {
    const p = await b.newPage();
    const err = []; p.on('pageerror', e => err.push(e.message));
    await p.setViewport(vp);
    await p.evaluateOnNewDocument(finto => {
      const vero = window.fetch;
      window.fetch = (u, o) => {
        if (/script\.google\.com/.test(String(u)) && o && o.body) {
          const q = JSON.parse(o.body);
          if (finto[q.azione]) return new Promise(r => setTimeout(() => r(new Response(JSON.stringify(finto[q.azione]))), 150));
        }
        return vero(u, o);
      };
    }, FINTO);
    await p.goto(base + '/index.html?vista=venditore', { waitUntil: 'networkidle0' });
    await pausa(1200);
    // scheda Permute
    await p.evaluate(() => document.querySelector('[data-tab="perm"]').click());
    await pausa(300);
    const box = '#permute';
    await p.type(box + ' .val-in input', 'Clio GPL Energy 120000 km del 2013');
    await p.click(box + ' .val-in button');
    await p.waitForSelector(box + ' .val-valore', { timeout: 5000 }).catch(() => {});
    const leggi = () => p.evaluate(b => { const q = s => document.querySelector(b + ' ' + s); return { valore: q('.val-valore') && q('.val-valore').textContent, note: [...document.querySelectorAll(b + ' .val-note p')].map(x => x.textContent), offerta: q('[data-off="teniamo"]') && q('[data-off="teniamo"]').textContent, grafico: !!q('.val-graf svg'), chips: [...document.querySelectorAll(b + ' .val-chip')].map(x => x.textContent), portali: q('.val-fonti') && q('.val-fonti').textContent }; }, box);
    const r1 = await leggi();
    ok(r1.valore && /€/.test(r1.valore), `${nome}: valore di mercato mostrato (${r1.valore})`);
    ok(r1.note.length >= 3 && r1.note.some(n => /teniamo/i.test(n)) && r1.note.some(n => /commerciante/i.test(n)), `${nome}: note con le due strade`);
    ok(!r1.note.join(' ').includes('777') && r1.note.join(' ').includes('passaggio'), `${nome}: passaggio senza cifra (costo di prova 777 €)`);
    ok(r1.grafico && r1.chips.some(c => /GPL/.test(c)) && /Automobile\.it/.test(r1.portali || ''), `${nome}: grafico, "Ho capito così" e portale mancante segnalato (${r1.portali})`);
    const prima = Number((r1.offerta || '').replace(/\D/g, ''));
    await p.$eval(box + ' .val-rip', el => { el.value = '833'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    await pausa(200);
    const dopo = Number(((await leggi()).offerta || '').replace(/\D/g, ''));
    ok(prima - dopo === 500, `${nome}: ripristino 833 (+500) → offerta da ${prima} a ${dopo}`);
    await (await p.$(box)).screenshot({ path: path.join(OUT, `valutatore-${nome}.png`) });
    // annuncio con codice malevolo: niente immagine iniettata, niente link javascript
    await p.evaluate(b => document.querySelector(b + ' [data-v="lista"]').click(), box);
    await pausa(200);
    const xss = await p.evaluate(b => ({ img: !!document.getElementById('xss'), js: [...document.querySelectorAll(b + ' .val-lista a')].some(a => /^javascript:/i.test(a.getAttribute('href') || '')) }), box);
    ok(!xss.img && !xss.js, `${nome}: annunci con codice malevolo resi innocui`);
    // margini: con la chiave salvata sul telefono si possono cambiare
    await p.evaluate(() => localStorage.setItem('su.chiaveCodici', 'AbCdEf123456XYZ'));
    await p.evaluate(b => document.querySelector(b + ' [data-v="margini"]').click(), box);
    await p.waitForSelector(box + ' [data-m="salva"]', { timeout: 3000 }).catch(() => {});
    ok(await p.evaluate(b => !!document.querySelector(b + ' [data-m="salva"]'), box), `${nome}: con la chiave il tasto "Salva i margini" c'è`);
    // modalita' cliente dalla scheda Permute: il valutatore sparisce
    await p.evaluate(() => document.getElementById('btnCliente').click());
    await pausa(300);
    const dopoCliente = await p.evaluate(() => { const s = document.getElementById('permute'); return { visibile: !s.hidden && getComputedStyle(s).display !== 'none', lista: !document.getElementById('layout').hidden }; });
    ok(!dopoCliente.visibile && dopoCliente.lista, `${nome}: toccando Cliente dalla scheda Permute il valutatore sparisce`);
    await p.evaluate(() => document.getElementById('btnCliente').click());
    await pausa(300);
    // nella scheda di un'auto, accanto a Finanziamento
    await p.evaluate(() => { location.hash = ''; document.querySelector('[data-tab="auto"]').click(); });
    await p.evaluate(() => document.querySelector('.card') && document.querySelector('.card').click());
    await pausa(800);
    const inScheda = await p.evaluate(() => { const s = document.getElementById('dPerm'), f = document.getElementById('dFin'); return !!s && !!f && s.previousElementSibling === f && !!s.querySelector('.val-in input'); });
    ok(inScheda, `${nome}: "Valuta la permuta" nella scheda, subito dopo Finanziamento`);
    // modalita' cliente: niente valutatore
    await p.evaluate(() => document.getElementById('btnCliente').click());
    await pausa(300);
    await p.evaluate(() => document.querySelector('.drawer .close') && document.querySelector('.drawer .close').click());
    await pausa(300);
    await p.evaluate(() => document.querySelector('.card') && document.querySelector('.card').click());
    await pausa(800);
    const cliente = await p.evaluate(() => ({ sez: !!document.getElementById('dPerm'), tab: getComputedStyle(document.querySelector('[data-tab="perm"]')).display }));
    ok(!cliente.sez && cliente.tab === 'none', `${nome}: in modalità cliente il valutatore non c'è`);
    ok(!err.length, `${nome}: nessun errore nella pagina ${err.join(' | ')}`);
    await p.close();
  }
  // pagina a se'
  const p = await b.newPage();
  const err = []; p.on('pageerror', e => err.push(e.message));
  await p.goto(base + '/valutatore.html', { waitUntil: 'networkidle0' });
  ok(await p.evaluate(() => !!document.querySelector('.val-in input')), 'pagina a sé valutatore.html');
  ok(!err.length, 'pagina a sé senza errori ' + err.join(' | '));
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
