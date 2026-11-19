// Cartelli da cambiare: le auto libere a cui e' cambiato il prezzo (o che l'hanno appena avuto) rispetto alla stampa di ieri,
// divise per sede. Un solo PDF: prima l'elenco per sede (prezzo vecchio -> nuovo), poi i cartelli gia' compilati, nello stesso ordine.
// Nome e righe delle dotazioni li sceglie il servizio Google (Gemini legge l'annuncio sul sito), come il tasto "Cartello salone"
// dell'app; le scelte restano in agente/cartelli-dotazioni.json per non richiederle a ogni cambio di prezzo.
// Le auto senza annuncio sul sito (o se il servizio non risponde) hanno le righe vuote, da scrivere a mano.
// Uso: node agente/cartelli-da-cambiare.js [--giorni N] [--mail]
//   --giorni N  invece di ieri, tutte le auto col prezzo cambiato negli ultimi N giorni (per recuperare i cartelli arretrati)
//   --mail      mette in coda la mail per Giuseppe con il PDF allegato (per ora solo a lui: alle sedi solo se lo chiede)
const fs = require('fs'), path = require('path');
const PDFLib = require('pdf-lib');
const { stampaPdf } = require('./stampa-pdf');
const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8');
const { datiCartello, compilaCartello } = new Function(src('cartello.js') + '\nreturn { datiCartello, compilaCartello };')();
const leggi = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return def; } };
const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const N = n => Math.round(n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
const dIt = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const IO = 'giuseppe.cavalli@valentinoautomobili.it';
// solo Prenestina e Tuscolana: li' il cartello va anche sulle auto fuori dal salone (piazzale esterno a Prenestina,
// esposizione al secondo piano a Tuscolana). A Tiburtina il cartello c'e' solo sulle poche auto del salone e lo curano i venditori.
const ORDINE = ['Prenestina', 'Tuscolana'];

// stesso servizio e stessa chiave dell'app (sorgenti/ui.js): cosi' se cambiano li' cambiano anche qui
const UI = src('ui.js'), AI_URL = (/const AI_URL = '([^']+)'/.exec(UI) || [])[1], AI_TOKEN = (/const AI_TOKEN = '([^']+)'/.exec(UI) || [])[1];
const fileDot = path.join(__dirname, 'cartelli-dotazioni.json'), dotazioni = leggi(fileDot, {});
async function chiediDotazioni(c) {
  const w = c.web || {};
  if (dotazioni[c.targa] && dotazioni[c.targa].url === w.url) return dotazioni[c.targa];
  if (!w.url || !AI_URL || !AI_TOKEN) return null;
  for (let prova = 0; prova < 2; prova++) {
    try {
      const r = await fetch(AI_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: AbortSignal.timeout(60000),
        body: JSON.stringify({ token: AI_TOKEN, azione: 'cartello', url: w.url, auto: `${c.brand} ${c.modello}`, telecamera: !!(w.cam && w.cam.esito === 'si'), tetto: !!(w.tetto && w.tetto.esito === 'si') }) });
      const j = await r.json();
      if (!j.errore && Array.isArray(j.righe) && j.righe.length) return (dotazioni[c.targa] = { url: w.url, nome: j.nome, righe: j.righe, cc: j.cc, euro: j.euro, offerta: j.offerta, quando: new Date().toISOString().slice(0, 10) });
    } catch (e) { /* riprova una volta */ }
    await new Promise(ok => setTimeout(ok, 5000));
  }
  return null;
}

const arg = process.argv.slice(2), iG = arg.indexOf('--giorni'), giorni = iG >= 0 ? +arg[iG + 1] || 30 : 0;
const stock = leggi(path.join(root, 'data', 'stock.json')), OGGI = stock.meta.day;

// prezzo di prima per ogni targa
function prezziPrima() {
  if (!giorni) {
    const ieri = leggi(path.join(root, 'data', 'ieri.json'), { cars: [] });
    if (ieri.meta && ieri.meta.day === OGGI) return null;              // ieri.json non e' ancora del giorno prima
    return { quando: ieri.meta ? dIt(ieri.meta.day) : 'ieri', mappa: new Map(ieri.cars.map(c => [c.targa, c.prezzo || 0])) };
  }
  // ultimi N giorni: dallo storico lungo (cambi di prezzo per targa)
  const lungo = (leggi(path.join(__dirname, 'storico-lungo-cache.json'), {}) || {}).auto || {};
  const limite = new Date(Date.parse(OGGI) - giorni * 864e5).toISOString().slice(0, 10), mappa = new Map();
  for (const c of stock.cars) {
    const p = (lungo[c.targa] || {}).p || [];
    const prima = p.filter(([d]) => d < limite).pop();                 // ultimo prezzo prima del periodo
    // solo i veri cambi di prezzo: le auto prezzate per la prima volta nel periodo hanno gia' avuto il cartello all'arrivo
    if (prima && p.some(([d]) => d >= limite)) mappa.set(c.targa, prima[1]);
  }
  return { quando: `negli ultimi ${giorni} giorni`, mappa, solo: true };
}

(async () => {
  const prima = prezziPrima();
  if (!prima) { console.log('Cartelli: la stampa di ieri non e\' ancora disponibile.'); return; }
  const lista = stock.cars.filter(c => c.free && c.prezzo > 0 && ORDINE.includes(c.ubic) && prima.mappa.has(c.targa) && prima.mappa.get(c.targa) !== c.prezzo)
    .map(c => ({ c, prima: prima.mappa.get(c.targa) }))
    .sort((a, b) => ORDINE.indexOf(a.c.ubic) - ORDINE.indexOf(b.c.ubic) || a.c.targa.localeCompare(b.c.targa));
  if (!lista.length) { console.log('Cartelli: nessun prezzo cambiato.'); return; }

  // dotazioni: una richiesta alla volta (piu' richieste insieme il servizio Google le rifiuta)
  const scelte = new Map();
  for (const x of lista) scelte.set(x.c.targa, await chiediDotazioni(x.c));
  const vuoti = lista.filter(x => !scelte.get(x.c.targa));
  fs.writeFileSync(fileDot, JSON.stringify(dotazioni, null, 1));
  const perSede = ORDINE.map(s => [s, lista.filter(x => x.c.ubic === s)]).filter(([, l]) => l.length);
  const riga = ({ c, prima: p }) => `<tr><td><b>${esc(c.targa)}</b></td><td>${esc(c.brand)} ${esc(c.family)}<br><small>${esc(c.modello)}</small></td>
    <td class="r">${p ? N(p) + ' €' : '<small>senza prezzo</small>'}</td><td class="r"><b>${N(c.prezzo)} €</b></td>
    <td class="r ${p && c.prezzo < p ? 'giu' : ''}">${p ? (c.prezzo < p ? '−' : '+') + N(Math.abs(c.prezzo - p)) + ' €' : 'nuovo'}</td><td>${c.spec ? 'prezzo speciale' : ''}</td><td class="spunta"></td></tr>`;
  // un PDF per sede: l'elenco della sede e poi i suoi cartelli, cosi' ogni sede ha il suo file
  const dir = path.join(__dirname, 'rapporti', 'cartelli'); fs.mkdirSync(dir, { recursive: true });
  const dataF = dIt(OGGI).replace(/\//g, '-') + (giorni ? ` (ultimi ${giorni} giorni)` : '');
  async function fileSede(sede, l) {
  const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Cartelli da cambiare ${esc(sede)}</title><style>
  @page { size: A4; } body { font-family: Segoe UI, Helvetica, Arial, sans-serif; color: #0c1a2b; font-size: 11px; margin: 0; }
  h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #5b6b80; margin-bottom: 10px; } h2 { font-size: 14px; margin: 16px 0 4px; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 9.5px; color: #5b6b80; border-bottom: 2px solid #0c1a2b; padding: 4px 5px; }
  td { border-bottom: 1px solid #dde3ea; padding: 5px; vertical-align: top; } tr { break-inside: avoid; } .r { text-align: right; } small { color: #5b6b80; }
  .giu { color: #0a7a3d; font-weight: 700; } .spunta { width: 22px; border: 1px solid #8a97a8; } .nota { color: #5b6b80; font-size: 10px; margin-top: 12px; }
  </style></head><body><h1>${esc(sede)} · cartelli da cambiare: ${l.length}</h1>
  <div class="sub">Stampa del ${dIt(OGGI)} · prezzi cambiati ${esc(prima.quando)} · dopo questo elenco ci sono i cartelli già compilati, nello stesso ordine</div>
  <table><thead><tr><th>Targa</th><th>Auto</th><th class="r">Prima</th><th class="r">Ora</th><th class="r">Differenza</th><th></th><th>Fatto</th></tr></thead><tbody>${l.map(riga).join('')}</tbody></table>
  <p class="nota">Le dotazioni sul cartello sono scelte dall'annuncio sul sito, come con il tasto "Cartello salone".${l.some(x => !scelte.get(x.c.targa)) ? ` Senza dotazioni (auto non ancora sul sito): ${l.filter(x => !scelte.get(x.c.targa)).map(x => esc(x.c.targa)).join(', ')}; si scrivono a mano o si rifà il cartello dal tasto quando l'annuncio è online.` : ''} Togliere il cartello vecchio dall'auto.</p></body></html>`;

  const fileHtml = path.join(dir, 'elenco.html'), fileElenco = path.join(dir, 'elenco.pdf');
  fs.writeFileSync(fileHtml, html);
  await stampaPdf(fileHtml, fileElenco);

  // un solo PDF: elenco + cartelli. La grafica di ogni modello entra una volta sola (pagina incorporata) e su ogni cartello
  // si scrivono solo i testi, nelle caselle dei campi del modulo e con le stesse dimensioni del tasto dell'app:
  // cosi' 100 cartelli pesano pochi MB invece di 50.
  const out = await PDFLib.PDFDocument.create();
  const elenco = await PDFLib.PDFDocument.load(fs.readFileSync(fileElenco));
  (await out.copyPages(elenco, elenco.getPageIndices())).forEach(p => out.addPage(p));
  const font = await out.embedFont(PDFLib.StandardFonts.HelveticaBold), modelli = {};
  async function modello(file) {
    if (modelli[file]) return modelli[file];
    const bytes = fs.readFileSync(path.join(root, 'cartelli', file)), doc = await PDFLib.PDFDocument.load(bytes);
    const campi = {};
    for (const f of doc.getForm().getFields()) {
      const w = f.acroField.getWidgets()[0]; if (!w) continue;
      let q = 0; try { q = f.acroField.getQuadding() || 0; } catch (e) {}
      campi[f.getName()] = { r: w.getRectangle(), q };
    }
    const [pagina] = await out.embedPdf(bytes, [0]), { width, height } = doc.getPage(0).getSize();
    return (modelli[file] = { pagina, campi, width, height });
  }
  for (const { c } of l) {
    const d = datiCartello(c, scelte.get(c.targa)), m = await modello(d.file);
    const pg = out.addPage([m.width, m.height]);
    pg.drawPage(m.pagina, { x: 0, y: 0, width: m.width, height: m.height });
    for (const [nome, testo] of Object.entries(d.campi)) {
      const k = m.campi[nome]; if (!k || !testo) continue;
      const spazio = k.r.width - 4, base = /prezzo/.test(nome) ? 85 : /NOME/.test(nome) ? 50 : /^TESTO/.test(nome) ? 17 : 19;
      let dim = Math.min(base, k.r.height * 0.85);
      while (dim > 8 && font.widthOfTextAtSize(testo, dim) > spazio) dim -= 1;
      const larg = font.widthOfTextAtSize(testo, dim);
      const x = k.q === 1 ? k.r.x + (k.r.width - larg) / 2 : k.q === 2 ? k.r.x + k.r.width - 2 - larg : k.r.x + 2;
      const y = k.r.y + (k.r.height - font.heightAtSize(dim, { descender: false })) / 2;
      pg.drawText(testo, { x, y, size: dim, font, color: PDFLib.rgb(0, 0, 0) });
    }
  }
  const filePdf = path.join(dir, `Cartelli da cambiare - ${sede} ${dataF}.pdf`);
  fs.writeFileSync(filePdf, await out.save());
  return filePdf;
  }
  const files = [];
  for (const [s, l] of perSede) files.push(await fileSede(s, l));
  fs.rmSync(path.join(dir, 'elenco.pdf'), { force: true }); fs.rmSync(path.join(dir, 'elenco.html'), { force: true });
  const riassunto = perSede.map(([s, l]) => `${s} ${l.length}`).join(', ');
  console.log(`Cartelli: ${lista.length} da cambiare (${riassunto}), un PDF per sede in ${dir}; dotazioni compilate per ${lista.length - vuoti.length}${vuoti.length ? `, vuote per ${vuoti.length} (${vuoti.map(x => x.c.targa).join(' ')})` : ''}`);

  if (arg.includes('--mail')) {
    const codaF = path.join(__dirname, 'posta-da-inviare.json'), coda = leggi(codaF, []);
    const corpo = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0c1a2b"><p>Prezzi cambiati ${esc(prima.quando)}: <b>${lista.length}</b> cartelli da rifare (${esc(riassunto)}).</p>
      <p>In allegato un PDF per sede: l'elenco con prezzo vecchio e nuovo e, dopo, i cartelli già compilati da stampare.</p></div>`;
    coda.push({ to: IO, subject: `Cartelli da cambiare ${dIt(OGGI)}: ${lista.length} auto (${riassunto})`, html: corpo, allegati: files });
    fs.writeFileSync(codaF, JSON.stringify(coda, null, 1));
    console.log('Cartelli: mail in coda per Giuseppe.');
  }
})().catch(e => { console.error('Cartelli non preparati: ' + e.message); process.exit(1); });
