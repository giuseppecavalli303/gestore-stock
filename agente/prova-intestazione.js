// Prova sul telefono (390 px): scorrendo in giu' resta solo la ricerca, intera e sotto la barra di stato;
// logo e tasti spariscono del tutto; scorrendo in su torna tutta l'intestazione; il tasto Filtri in basso non cambia.
// La zona della barra di stato dell'iPhone (47 px) si simula con --safe-top.
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
const SAFE = 47;

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

  const scorri = async y => { await p.evaluate(y => window.scrollTo(0, y), y); await pausa(450); };
  // quanto si vede davvero dell'intestazione: il riquadro meno la parte ritagliata in alto
  const stato = () => p.evaluate(() => {
    const t = document.querySelector('.top'), r = t.getBoundingClientRect(), cp = getComputedStyle(t).clipPath;
    const taglio = (cp.match(/inset\(([\d.]+)px/) || [])[1];
    const vis = e => { const s = getComputedStyle(e); return s.opacity !== '0' && s.visibility !== 'hidden' && s.display !== 'none'; };
    const f = document.querySelector('.filters-btn').getBoundingClientRect();
    return { altoVisibile: r.top + (taglio ? +taglio : 0), basso: r.bottom, search: (q => ({ top: q.top, bottom: q.bottom }))(document.querySelector('.top .search').getBoundingClientRect()),
      marchioVisibile: vis(document.querySelector('.top .brand')), tastiVisibili: vis(document.getElementById('btnCliente')) || vis(document.getElementById('btnLoad')),
      numeri: document.querySelector('.kpis').getBoundingClientRect().top, filtri: [Math.round(f.top), Math.round(f.bottom), Math.round(f.left), Math.round(f.width)].join(',') };
  });

  for (const conSafe of [false, true]) {
    const sa = conSafe ? SAFE : 0, nome = conSafe ? 'iPhone (barra di stato 47 px)' : 'telefono';
    await p.evaluate(s => document.documentElement.style.setProperty('--safe-top', s + 'px'), sa);
    await scorri(0);
    const prima = await stato();
    ok(prima.marchioVisibile && prima.tastiVisibili && prima.altoVisibile >= sa - 1, `${nome}, in cima: intestazione completa e sotto la barra di stato`);
    // vicino all'inizio l'intestazione non copre la riga dei numeri
    for (const y of [15, 40, 70]) { await scorri(y); const s = await stato(); ok(s.numeri >= s.basso - 1, `${nome}, sceso di ${y} px: la riga dei numeri resta visibile (barra fino a ${Math.round(s.basso)}, numeri da ${Math.round(s.numeri)})`); }
    for (const y of [200, 600, 1200]) await scorri(y);
    const giu = await stato();
    if (conSafe) await p.screenshot({ path: path.join(OUT, 'intestazione-giu.png') });
    ok(!giu.marchioVisibile && !giu.tastiVisibili, `${nome}, scorrendo in giu': logo e tasti spariti del tutto`);
    ok(giu.search.top >= sa && giu.search.top <= sa + 24 && giu.search.bottom <= 844, `${nome}, scorrendo in giu': la ricerca e' intera e sotto la barra di stato (da ${Math.round(giu.search.top)} a ${Math.round(giu.search.bottom)})`);
    ok(giu.altoVisibile >= sa - 1, `${nome}, scorrendo in giu': niente dell'intestazione sotto la barra di stato (parte visibile da ${Math.round(giu.altoVisibile)})`);
    ok(giu.filtri === prima.filtri, `${nome}: il tasto Filtri in basso non cambia (${giu.filtri})`);
    await scorri(1100); await scorri(1050);
    const su = await stato();
    if (conSafe) await p.screenshot({ path: path.join(OUT, 'intestazione-su.png') });
    ok(su.marchioVisibile && su.tastiVisibili && su.altoVisibile >= sa - 1, `${nome}, scorrendo un po' in su torna tutta l'intestazione, sotto la barra di stato`);
    await pausa(1500);
    ok((await stato()).marchioVisibile, `${nome}: e resta li', non torna su da sola`);
    // risalendo verso l'inizio la riga dei numeri resta visibile
    await scorri(400);
    for (const y of [60, 30]) { await scorri(y); const s = await stato(); ok(s.numeri >= s.basso - 1, `${nome}, risalendo a ${y} px: la riga dei numeri resta visibile (barra fino a ${Math.round(s.basso)}, numeri da ${Math.round(s.numeri)})`); }
  }
  // fascia piena dietro la barra di stato: il contenuto non ci passa sotto sfocato
  ok(await p.evaluate(() => { const s = getComputedStyle(document.querySelector('.barra-stato')); return s.position === 'fixed' && parseFloat(s.height) >= 46 && +s.zIndex > +getComputedStyle(document.querySelector('.top')).zIndex; }), 'fascia piena dietro la barra di stato, sopra l’intestazione');
  // sul PC niente di tutto questo
  await p.setViewport({ width: 1440, height: 900 });
  await pausa(300); await scorri(600); await scorri(1200);
  ok(await p.evaluate(() => !document.querySelector('.top').classList.contains('compatta') && getComputedStyle(document.querySelector('.top')).transform === 'none'), 'sul PC l\u2019intestazione resta com\u2019era');
  await b.close(); server.close();
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
