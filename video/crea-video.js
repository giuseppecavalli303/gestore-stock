// Crea il video tutorial dell'app. Registra ogni fotogramma (30 al secondo) in un Chrome automatico, con l'app vera
// dentro un telefono; aggiunge la voce italiana, i sottotitoli e una musica di sottofondo generata qui.
// Uso: node crea-video.js   ->   video/out/stock-usato-guida.mp4 (e copia in "Stock Usato - guida per i venditori.mp4")
// Serve video/materiale/riepilogo.html: una mail di riepilogo di esempio (non pubblicata, contiene nomi interni).
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync, spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const FFMPEG = require('ffmpeg-static');
const QR = require('qrcode');

const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'), AU = path.join(OUT, 'audio'), SUB = path.join(OUT, 'sottotitoli');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VOCE = 'it-IT-IsabellaNeural', PORTA = 8790, Z = 1.1333, FPS = 30, ANTICIPO = 0.35;
const LINK = 'https://giuseppecavalli303.github.io/gestore-stock/';
const FINALE = path.join(ROOT, 'Stock Usato - guida per i venditori.mp4');
for (const d of [OUT, AU, SUB]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
if (!fs.existsSync(path.join(__dirname, 'materiale', 'riepilogo.html'))) throw new Error('Manca video/materiale/riepilogo.html');

/* ---------- copione ---------- */
const SCENE = [
  { k: 'apertura', tipo: 'apertura',
    voce: 'Ciao! Questa è Stock Usato: tutto lo stock dell’usato di Valentino, aggiornato ogni mattina, sul telefono e sul computer. Ti mostro come si usa.' },
  { k: 'agg', titolo: 'Si aggiorna da sola', desc: 'Ogni mattina arriva la stampa del gestionale e l’app si aggiorna. In alto: <b>data della stampa</b> e <b>numero di veicoli</b>.',
    voce: 'Non devi caricare niente. Ogni mattina arriva la stampa del gestionale e l’app si aggiorna da sola. In alto vedi la data della stampa e quanti veicoli ci sono.' },
  { k: 'installa', titolo: 'Mettila sulla schermata Home', desc: '<b>Android</b>: tocca “Installa app”.<br><b>iPhone</b>: apri il sito con Safari → Condividi → Aggiungi a Home.',
    voce: 'Mettila sulla schermata Home. Su Android tocca installa app. Su iPhone apri il sito con Safari, tocca condividi e poi aggiungi a Home. Si apre a tutto schermo, come un’app.' },
  { k: 'kpi', titolo: 'Le scorciatoie in alto', desc: 'Tocca un riquadro: <b>Libere</b>, <b>Prenotate</b>, <b>In arrivo</b>, <b>Ferme da oltre 90 giorni</b>. Sotto, le novità rispetto a ieri.',
    voce: 'I riquadri in alto sono scorciatoie: libere, prenotate, in arrivo, ferme da più di novanta giorni. Subito sotto trovi le novità rispetto a ieri: nuovi ingressi, uscite e prezzi cambiati.' },
  { k: 'ricerca', titolo: 'Cerca come parli', desc: 'Scrivi una frase normale: <b>“golf diesel automatica sotto 35000”</b>. Sotto la barra vedi cosa ha capito.',
    voce: 'Cerca come parli. Scrivi, per esempio: golf diesel automatica sotto trentacinquemila. Sotto la barra vedi cosa ha capito, e i risultati cambiano mentre scrivi. Funziona anche con targa, colore e ubicazione.' },
  { k: 'filtri', titolo: 'Tutti i filtri', desc: 'Il pulsante <b>Filtri</b> in basso: stato, marca, modello, prezzo, km, anno, potenza, ubicazione, giorni in stock.',
    voce: 'Con il pulsante filtri, in basso, scegli quello che ti serve: stato, marca, modello, prezzo, chilometri, anno, potenza, ubicazione e giorni in stock. Poi tocca mostra veicoli.' },
  { k: 'scheda', titolo: 'La scheda dell’auto', desc: 'Foto anche degli interni, tutti i dati, dove si trova, la <b>storia dei prezzi</b> e il link all’<b>annuncio sul sito</b>.',
    voce: 'Tocca un’auto per aprire la scheda. Scorri di lato per le foto, anche degli interni. Sotto trovi tutti i dati, dove si trova, la storia dei prezzi e il link all’annuncio sul sito.' },
  { k: 'telecamera', titolo: 'La telecamera, verificata', desc: 'Se le dotazioni del sito la elencano, il sistema cerca nelle foto quella dello <b>schermo con la retrocamera</b>. Scrivi <b>telecamera</b> per vedere solo quelle confermate.',
    voce: 'La telecamera posteriore. A volte il sito la segna ma l’auto non ce l’ha. Quando le dotazioni la elencano, il sistema cerca tra le foto quella dello schermo con la retrocamera. Scrivi telecamera nella ricerca e vedi solo le auto confermate, con la foto come prova.' },
  { k: 'cliente', titolo: 'Invia al cliente', desc: 'Un tocco e prepari il messaggio per <b>WhatsApp</b>: dati, prezzo e link alle foto. Niente informazioni interne.',
    voce: 'Con invia al cliente prepari in un attimo il messaggio per WhatsApp o per la mail: dati dell’auto, prezzo e link alle foto. Le informazioni interne non ci sono.' },
  { k: 'ai', titolo: 'Chiedi all’assistente', desc: 'Descrivi il cliente con parole tue e tocca <b>Chiedi all’assistente</b>: ti propone le auto più adatte e ti dice perché.',
    voce: 'Hai un cliente e non sai cosa proporgli? Descrivilo con parole tue, per esempio: cliente con diciottomila euro, due figli, vuole l’automatica. Tocca chiedi all’assistente: ti propone le auto più adatte e ti spiega perché. Controlla sempre i dati nella scheda.' },
  { k: 'stat', pc: true, titolo: 'Statistiche', desc: 'Entrate e uscite giorno per giorno, quanto ci mette ogni modello a prenotarsi, prezzi ritoccati, auto ferme.',
    voce: 'Nelle statistiche trovi entrate e uscite giorno per giorno, in quanti giorni si prenota ogni modello e le auto ferme da più tempo. Dal computer hai anche la tabella e il pulsante per scaricare l’Excel.' },
  { k: 'mail', titolo: 'Il riepilogo nella mail', desc: 'Ogni mattina, con la stampa: <b>auto nuove pronte da vendere</b>, prezzi abbassati, auto ferme da più tempo, prenotazioni e nuovi arrivi.',
    voce: 'Ogni mattina ti arriva anche un riepilogo per mail: le auto nuove pronte da vendere, i prezzi abbassati, quelle ferme da più tempo, le prenotazioni e i nuovi arrivi.' },
  { k: 'avvisi', titolo: 'Avvisami quando entra', desc: 'Cerchi un’auto che oggi non c’è? Scrivi la ricerca e tocca <b>Avvisami quando entra</b>.<br>Per fermarlo: mail con oggetto <b>STOP AVVISO</b>.',
    voce: 'Cerchi un’auto che oggi non c’è? Scrivi la ricerca e tocca avvisami quando entra: si apre una mail già pronta. Mandala, e appena entra un’auto adatta ti arriva un avviso. Per fermarlo, scrivi con oggetto stop avviso.' },
  { k: 'chiusura', tipo: 'chiusura',
    voce: 'Questo è tutto. Inquadra il codice per aprirla sul telefono. Per dubbi o idee, chiedi a Giuseppe. Buone vendite!' }
];
const PASSI = SCENE.filter(s => !s.tipo).length;

/* ---------- server locale del sito ---------- */
const TIPI = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPI[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

/* ---------- voce ---------- */
function durata(file) {
  let out = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: 'pipe' }); } catch (e) { out = String(e.stderr || ''); }
  const m = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}
function voce(s, i) {
  const mp3 = path.join(AU, `s${i}.mp3`), srt = path.join(AU, `s${i}.srt`);
  execFileSync('python', ['-m', 'edge_tts', '--voice', VOCE, '--rate=+3%', '--text', s.voce, '--write-media', mp3, '--write-subtitles', srt], { stdio: 'pipe' });
  return { mp3, srt, dur: durata(mp3) };
}

/* ---------- musica di sottofondo: accordi morbidi e qualche nota d'arpeggio, generati qui (nessun diritto d'autore) ---------- */
function musica(file, secondi) {
  const SR = 44100, n = Math.ceil(secondi * SR), L = new Float32Array(n), R = new Float32Array(n);
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  const ACCORDI = [[48, 55, 64, 67, 71], [45, 52, 60, 64, 67], [41, 48, 57, 60, 64], [43, 50, 59, 62, 67]];   // Do7+, La-7, Fa7+, Sol6
  const T = 6;
  for (let c = 0; c * T < secondi + T; c++) {
    const acc = ACCORDI[c % 4], t0 = c * T - 1.5, t1 = t0 + T + 3;
    const i0 = Math.max(0, Math.floor(t0 * SR)), i1 = Math.min(n, Math.floor(t1 * SR));
    for (const m of acc) {
      const f = hz(m), fr = f * 1.003, a = m < 50 ? .06 : .045;
      for (let i = i0; i < i1; i++) {
        const t = i / SR, env = Math.pow(Math.sin(Math.PI * (t - t0) / (t1 - t0)), 2), ph = 2 * Math.PI * f * t, pr = 2 * Math.PI * fr * t;
        L[i] += a * env * (Math.sin(ph) + .18 * Math.sin(2 * ph) + .04 * Math.sin(3 * ph));
        R[i] += a * env * (Math.sin(pr) + .18 * Math.sin(2 * pr) + .04 * Math.sin(3 * pr));
      }
    }
    const arp = [acc[2] + 12, acc[3] + 12, acc[4] + 12, acc[3] + 12];
    for (let k = 0; k < 4; k++) {
      const s0 = Math.floor((c * T + k * 1.5 + .2) * SR), f = hz(arp[k]);
      for (let j = 0; j < 2.5 * SR; j++) {
        const i = s0 + j; if (i < 0 || i >= n) continue;
        const t = j / SR, env = Math.exp(-t / .55) * Math.min(1, t / .006);
        const v = .03 * env * (Math.sin(2 * Math.PI * f * t) + .25 * Math.sin(4 * Math.PI * f * t) * Math.exp(-t / .15));
        L[i] += v * (k % 2 ? .65 : 1); R[i] += v * (k % 2 ? 1 : .65);
      }
    }
  }
  let picco = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR, g = (1 + .06 * Math.sin(2 * Math.PI * .17 * t)) * Math.min(1, t / 2.5) * Math.min(1, (secondi - t) / 3.5);
    L[i] *= g; R[i] *= g; picco = Math.max(picco, Math.abs(L[i]), Math.abs(R[i]));
  }
  const buf = Buffer.alloc(44 + n * 4), k = .85 / (picco || 1);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { buf.writeInt16LE(Math.round(L[i] * k * 32767), 44 + i * 4); buf.writeInt16LE(Math.round(R[i] * k * 32767), 46 + i * 4); }
  fs.writeFileSync(file, buf);
}

/* ---------- sottotitoli: frasi brevi, al massimo due righe ---------- */
function battute(srtFile, inizio) {
  const out = [];
  for (const b of fs.readFileSync(srtFile, 'utf8').trim().split(/\r?\n\r?\n/)) {
    const r = b.split(/\r?\n/), m = (r[1] || '').match(/(\d+):(\d+):(\d+)[,.](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const a0 = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, a1 = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    const testo = r.slice(2).join(' ').replace(/\s+/g, ' ').trim(), parole = testo.split(' '), pezzi = [];
    // pezzi di lunghezza simile (al massimo ~92 caratteri, due righe), cosi' nessuna parola resta da sola
    const quanti = Math.ceil(testo.length / 92), obiettivo = testo.length / quanti;
    let cur = '';
    for (const p of parole) {
      if (cur && pezzi.length < quanti - 1 && (cur + ' ' + p).length > obiettivo + 6) { pezzi.push(cur); cur = p; } else cur = (cur + ' ' + p).trim();
    }
    if (cur) pezzi.push(cur);
    const tot = pezzi.reduce((s, x) => s + x.length, 0);
    let t = a0;
    for (const p of pezzi) { const d = (a1 - a0) * p.length / tot; out.push({ testo: p, da: inizio + t, a: inizio + t + d }); t += d; }
  }
  return out;
}

/* ---------- registrazione ---------- */
(async () => {
  console.log('Preparo le voci...');
  const tracce = SCENE.map(voce);
  await new Promise(r => server.listen(PORTA, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  // l'orologio dell'app segna il giorno della stampa, cosi' non compare "Non di oggi" se si registra un altro giorno
  const giorno = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'stock.json'), 'utf8')).meta.day;
  await page.evaluateOnNewDocument(iso => {
    const Vero = Date, fisso = new Vero(iso).getTime(), base = Vero.now();
    class Finto extends Vero { constructor(...a) { if (a.length) super(...a); else super(fisso + (Vero.now() - base)); } static now() { return fisso + (Vero.now() - base); } }
    window.Date = Finto;
  }, giorno + 'T10:30:00');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`http://localhost:${PORTA}/video/palco.html`, { waitUntil: 'networkidle0' });
  const qr = await QR.toString(LINK, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#0b1b33', light: '#ffffff' } });
  await page.evaluate(s => { document.getElementById('qr').innerHTML = s; }, qr);
  let app = await (await page.$('#app')).contentFrame();
  const appPronta = () => app.waitForFunction(() => { const m = document.getElementById('metaLine'); return m && !/esempio/i.test(m.textContent); }, { timeout: 30000 });
  await appPronta();
  await page.evaluate(() => document.fonts.ready);
  const pausa = ms => new Promise(r => setTimeout(r, ms));

  // i fotogrammi vanno direttamente al codificatore, senza file intermedi
  const muto = path.join(OUT, 'immagini.mp4');
  const enc = spawn(FFMPEG, ['-y', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', muto], { stdio: ['pipe', 'ignore', 'pipe'] });
  let errEnc = ''; enc.stderr.on('data', d => { errEnc = (errEnc + d).slice(-2000); });
  const fineEnc = new Promise((ok, ko) => enc.on('close', c => (c === 0 ? ok() : ko(new Error('ffmpeg: ' + errEnc)))));
  let nFr = 0;
  async function fotogramma() {
    await page.evaluate(t => tempo(t), nFr / FPS);
    const buf = await page.screenshot({ type: 'jpeg', quality: 92, optimizeForSpeed: true });
    nFr++;
    if (!enc.stdin.write(buf)) await new Promise(r => enc.stdin.once('drain', r));
  }
  const per = async (sec, fn) => { const n = Math.max(1, Math.round(sec * FPS)); for (let i = 1; i <= n; i++) { if (fn) await fn(i / n); await fotogramma(); } };
  const easeIO = p => (p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  // dito che tocca un elemento dell'app nel telefono (clic a meta' animazione, se richiesto)
  async function tocca(sel, clic = true) {
    const el = await app.waitForSelector(sel, { visible: true, timeout: 20000 });
    const r = await el.evaluate(e => { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    let fatto = !clic;
    await per(.8, async p => {
      await page.evaluate((x, y, p) => tocco(x, y, p), r.x * Z, r.y * Z, p);
      if (!fatto && p >= .5) { fatto = true; await el.evaluate(e => e.click()); await pausa(150); }
    });
    await page.evaluate(() => viaTocco());
  }
  async function scrivi(testo) {
    await app.evaluate(() => { const q = document.getElementById('q'); q.value = ''; q.dispatchEvent(new Event('input')); scrollTo(0, 0); });
    for (let i = 1; i <= testo.length; i++) {
      await app.evaluate(t => { const q = document.getElementById('q'); q.value = t; q.dispatchEvent(new Event('input')); }, testo.slice(0, i));
      await fotogramma(); if (i % 2) await fotogramma();
    }
    await per(.5);
  }
  // scorrimento morbido: della pagina, di un riquadro (sel) o in orizzontale (lato)
  async function scorri(y, sec = .8, sel = null, lato = false, frame = app) {
    const y0 = await frame.evaluate((s, l) => { const e = s ? document.querySelector(s) : document.scrollingElement; return l ? e.scrollLeft : e.scrollTop; }, sel, lato);
    await per(sec, p => frame.evaluate((s, l, v) => { const e = s ? document.querySelector(s) : document.scrollingElement; if (l) e.scrollLeft = v; else e.scrollTop = v; }, sel, lato, y0 + (y - y0) * easeIO(p)));
  }
  const svuota = () => app.evaluate(() => { const b = document.querySelector('[data-rm="all"]'); if (b) b.click(); const q = document.getElementById('q'); q.value = ''; q.dispatchEvent(new Event('input')); scrollTo(0, 0); });
  const chiudiScheda = async () => { await app.evaluate(() => { const d = document.getElementById('dClose'); if (d && d.offsetParent) d.click(); }); await pausa(300); };

  const regia = {
    async apertura() { await per(1.8, p => page.evaluate(p => apertura(p), p)); },
    async agg() { await per(.6); await tocca('#metaLine', false); await per(.6); },
    async installa() { await scorri(160, 1.2); await per(.8); await scorri(0, 1); },
    async kpi() { await tocca('[data-preset="free"]'); await per(.4); await scorri(330, 1.2); await per(1.2); await scorri(0, .9); await tocca('[data-preset="free"]'); },
    async ricerca() { await scrivi('golf diesel automatica sotto 35000'); await scorri(300, 1.2); await per(1.4); await scorri(0, .8); },
    async filtri() {
      await tocca('#btnFilters'); await pausa(400); await per(.5);
      await tocca('#filters [data-seg="disp"] [data-v="free"]'); await per(.3);
      const ubic = await app.$('#filters [data-f="ubic"]');
      if (ubic) { const sel = await ubic.evaluate(e => `#filters [data-f="ubic"][data-v="${e.dataset.v}"]`); await tocca(sel); }
      await per(.6); await tocca('#fClose2'); await pausa(400); await per(.8);
    },
    async scheda() {
      await svuota(); await app.evaluate(() => document.querySelector('[data-preset="free"]').click()); await pausa(500); await per(.3);
      await tocca('#grid .card'); await pausa(1500); await per(.6);
      const w = await app.evaluate(() => { const g = document.querySelector('#drawer .gal'); return g ? g.clientWidth * .86 : 0; });
      for (let i = 1; i <= 4 && w; i++) { await scorri(w * i, .55, '#drawer .gal', true); await pausa(400); await per(.5); }
      for (const y of [380, 760, 1140]) { await scorri(y, .9, '#drawer .scroll'); await per(.6); }
    },
    async telecamera() {
      await chiudiScheda(); await svuota(); await pausa(300);
      await scrivi('telecamera'); await per(.4);
      await tocca('#grid .card'); await pausa(1500); await per(.5);
      const y = await app.evaluate(() => {
        const sc = document.querySelector('#drawer .scroll'), dt = [...sc.querySelectorAll('dt')].find(e => /Telecamera posteriore/.test(e.textContent));
        return dt ? Math.max(0, dt.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - 260) : 0;
      });
      await scorri(y, 1.4, '#drawer .scroll'); await per(.8);
      const url = await app.evaluate(() => { const a = [...document.querySelectorAll('#drawer a')].find(x => /retrocamera/i.test(x.textContent)); return a ? a.href : ''; });
      if (url) {
        await scorri(y - 140, .5, '#drawer .scroll');
        const sel = await app.evaluate(() => { const a = [...document.querySelectorAll('#drawer a')].find(x => /retrocamera/i.test(x.textContent)); a.id = 'vediCam'; return '#vediCam'; });
        await tocca(sel, false);
        await app.evaluate(u => { const d = document.createElement('div'); d.id = 'fotoCam'; d.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:grid;place-items:center;opacity:0'; d.innerHTML = `<img src="${u}" style="width:100%;display:block">`; document.body.appendChild(d); }, url);
        await app.waitForFunction(() => { const i = document.querySelector('#fotoCam img'); return i && i.complete && i.naturalWidth; }, { timeout: 20000 }).catch(() => {});
        await per(.4, p => app.evaluate(p => { document.getElementById('fotoCam').style.opacity = p; }, p));
        await per(2.4);
        await per(.4, p => app.evaluate(p => { document.getElementById('fotoCam').style.opacity = 1 - p; }, p));
        await app.evaluate(() => document.getElementById('fotoCam').remove());
      }
      await per(.4);
    },
    async cliente() {
      await app.evaluate(() => { try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {} });
      await scorri(0, .6, '#drawer .scroll');
      await tocca('#dShare'); await pausa(300); await per(1.6);
      await tocca('#dClose'); await pausa(400);
    },
    async ai() {
      await svuota(); await pausa(300);
      await scrivi('cliente con 18 mila, due figli, vuole automatica');
      await tocca('#askAI'); await per(.4);
      await app.waitForSelector('#drawer .ai-list li, #drawer .ai-err', { timeout: 90000 }); await pausa(1200); await per(1.2);
      for (const y of [280, 560]) { await scorri(y, 1, '#drawer .scroll'); await per(1.2); }
      await chiudiScheda();
    },
    async stat() {
      await page.$eval('#app2', e => { e.src = '/index.html#statistiche'; });
      await pausa(800);
      const pc = await (await page.$('#app2')).contentFrame();
      await pc.waitForSelector('#stats .panel svg', { timeout: 30000 }); await pausa(1500);
      await per(.7, p => page.evaluate(p => { telefono(1, p); portatile(p); testo(p); }, p));
      await per(1);
      await scorri(560, 1.6, null, false, pc); await per(1.4); await scorri(1180, 1.6, null, false, pc); await per(1.4);
    },
    async mail() {
      await page.$eval('#app', e => { e.src = '/video/materiale/riepilogo.html'; });
      await pausa(500);
      app = await (await page.$('#app')).contentFrame();
      await app.waitForFunction(() => document.readyState === 'complete', { timeout: 20000 });
      await app.evaluate(() => Promise.all([...document.images].map(i => (i.complete ? 1 : new Promise(r => { i.onload = i.onerror = r; })))));
      await per(.7, p => page.evaluate(p => { telefono(1, 1 - p); portatile(1 - p); testo(p); }, p));
      await per(.8);
      await scorri(700, 2.4); await per(1); await scorri(1500, 2.4); await per(1);
    },
    async avvisi() {
      await page.$eval('#app', e => { e.src = '/index.html'; });
      await pausa(500);
      app = await (await page.$('#app')).contentFrame();
      await appPronta(); await pausa(500);
      await scrivi('t-roc automatica sotto 25000');
      await tocca('a.linkbtn[href^="mailto"]', false); await per(.8);
    },
    async chiusura() { await per(.9, p => page.evaluate(p => { palco(1 - p); chiusura(p); }, p)); }
  };

  // entrata di ogni scena: dall'apertura al palco, dal telefono al portatile e ritorno, o solo il testo nuovo
  async function entrata(s, prev) {
    if (s.tipo) return;
    if (prev && prev.tipo === 'apertura') return per(.9, p => page.evaluate(p => { apertura(1, p); palco(p); telefono(p); testo(p); }, p));
    if (s.pc || (prev && prev.pc)) return;                         // ci pensa la regia della scena
    await per(.55, p => page.evaluate(p => testo(p), p));
  }

  await page.evaluate(() => { palco(0); telefono(0); testo(0); apertura(0); });
  const inizi = [];
  for (let i = 0; i < SCENE.length; i++) {
    const s = SCENE[i], prev = SCENE[i - 1], next = SCENE[i + 1];
    inizi.push(nFr);
    if (!s.tipo) await page.evaluate((s, i, n) => { scena(s, i, n); testo(0); }, s, SCENE.slice(0, i + 1).filter(x => !x.tipo).length, PASSI);
    await entrata(s, prev);
    await regia[s.k]();
    // la scena dura almeno quanto la sua voce, piu' un respiro
    const minimo = Math.ceil((tracce[i].dur + ANTICIPO + .6) * FPS);
    while (nFr - inizi[i] < minimo) await fotogramma();
    if (!s.tipo && next && !next.tipo) await per(.3, p => page.evaluate(p => testoVia(p), p));
    if (s.tipo === 'chiusura') await per(1.2);
    console.log(`scena ${i + 1}/${SCENE.length} (${s.k}): ${((nFr - inizi[i]) / FPS).toFixed(1)} s`);
  }
  enc.stdin.end(); await fineEnc;
  inizi.push(nFr);

  /* ---------- sottotitoli come immagini con angoli arrotondati ---------- */
  const cue = [];
  SCENE.forEach((s, i) => battute(tracce[i].srt, inizi[i] / FPS + ANTICIPO).forEach(b => cue.push({ ...b, centro: !!(s.tipo || s.pc) })));
  const sp = await browser.newPage();
  await sp.setViewport({ width: 1920, height: 400, deviceScaleFactor: 1 });
  await sp.setContent(`<html><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Onest:wght@500&display=swap"><style>
    html,body{margin:0;background:transparent}
    #c{display:inline-block;padding:14px 26px;border-radius:20px;background:rgba(8,13,24,.78);border:1px solid rgba(255,255,255,.13);color:#f3f6fb;font:500 31px/1.38 Onest,"Segoe UI",sans-serif;box-shadow:0 12px 40px -12px rgba(0,0,0,.7)}
    #c.sx{max-width:820px}#c.centro{max-width:1300px;text-align:center}</style></head><body><div id="c"></div></body></html>`, { waitUntil: 'networkidle0' });
  await sp.evaluate(async () => { await document.fonts.load('500 31px Onest'); await document.fonts.ready; });
  for (let i = 0; i < cue.length; i++) {
    await sp.evaluate(async (t, cl) => { const c = document.getElementById('c'); c.textContent = t; c.className = cl; await document.fonts.ready; }, cue[i].testo, cue[i].centro ? 'centro' : 'sx');
    const el = await sp.$('#c'), b = await el.boundingBox();
    cue[i].file = path.join(SUB, `c${String(i).padStart(3, '0')}.png`);
    await el.screenshot({ path: cue[i].file, omitBackground: true });
    cue[i].x = cue[i].centro ? Math.round((1920 - b.width) / 2) : 120;
    cue[i].y = Math.round(1080 - 56 - b.height);
  }
  await browser.close(); server.close();

  /* ---------- audio: voce scena per scena, poi musica che si abbassa quando parla ---------- */
  const totale = nFr / FPS, lista = [];
  for (let i = 0; i < SCENE.length; i++) {
    const d = (inizi[i + 1] - inizi[i]) / FPS, wav = path.join(AU, `s${i}.wav`);
    execFileSync(FFMPEG, ['-y', '-i', tracce[i].mp3, '-af', `adelay=${ANTICIPO * 1000}|${ANTICIPO * 1000},apad=whole_dur=${d.toFixed(3)},atrim=0:${d.toFixed(3)}`, '-ar', '48000', '-ac', '2', wav], { stdio: 'pipe' });
    lista.push(`file '${wav.replace(/\\/g, '/')}'`);
  }
  fs.writeFileSync(path.join(AU, 'voce.txt'), lista.join('\n') + '\n');
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(AU, 'voce.txt'), '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11', '-ar', '48000', path.join(AU, 'voce.wav')], { stdio: 'pipe' });
  musica(path.join(AU, 'musica.wav'), totale + 1);

  /* ---------- montaggio finale ---------- */
  const ingressi = ['-i', muto, '-i', path.join(AU, 'voce.wav'), '-i', path.join(AU, 'musica.wav')];
  const filtro = [];
  let v = '0:v';
  cue.forEach((c, i) => {
    const d = Math.max(.3, c.a - c.da);
    ingressi.push('-loop', '1', '-framerate', String(FPS), '-t', d.toFixed(3), '-i', c.file);
    filtro.push(`[${i + 3}:v]format=rgba,fade=in:st=0:d=0.15:alpha=1,fade=out:st=${(d - .15).toFixed(3)}:d=0.15:alpha=1,setpts=PTS-STARTPTS+${c.da.toFixed(3)}/TB[s${i}]`);
    filtro.push(`[${v}][s${i}]overlay=${c.x}:${c.y}:eof_action=pass[v${i}]`);
    v = `v${i}`;
  });
  filtro.push(`[1:a]asplit=2[vo][sc]`);
  filtro.push(`[2:a]aecho=0.8:0.6:70|140:0.22|0.12,lowpass=f=5500,volume=0.22[mu]`);
  filtro.push(`[mu][sc]sidechaincompress=threshold=0.015:ratio=9:attack=25:release=450[duck]`);
  filtro.push(`[vo][duck]amix=inputs=2:duration=first:normalize=0,alimiter=limit=0.95[a]`);
  fs.writeFileSync(path.join(OUT, 'filtro.txt'), filtro.join(';\n'));
  const finale = path.join(OUT, 'stock-usato-guida.mp4');
  execFileSync(FFMPEG, ['-y', ...ingressi, '-filter_complex_script', path.join(OUT, 'filtro.txt'), '-map', `[${v}]`, '-map', '[a]',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', totale.toFixed(3), finale], { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  fs.copyFileSync(finale, FINALE);
  console.log(`Fatto: ${FINALE} (${Math.round(totale)} secondi, ${nFr} fotogrammi, ${cue.length} sottotitoli)`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
