// Crea il video tutorial dell'app: registra le scene in un Chrome automatico, aggiunge la voce italiana e i sottotitoli.
// Uso: node crea-video.js   ->   video/out/stock-usato-guida.mp4
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');
const FFMPEG = require('ffmpeg-static');

const ROOT = path.join(__dirname, '..'), OUT = path.join(__dirname, 'out'), FR = path.join(OUT, 'frames'), AU = path.join(OUT, 'audio');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const VOCE = 'it-IT-IsabellaNeural', PORTA = 8790, Z = 1.1333;
for (const d of [OUT, FR, AU]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

/* ---------- copione ---------- */
const SCENE = [
  { k: 'intro', titolo: 'Lo stock dell’usato, sempre in tasca', desc: 'Tutte le auto di Valentino, aggiornate ogni giorno. Sul telefono e sul computer.<br><span class="url">giuseppecavalli303.github.io/gestore-stock</span>',
    voce: 'Ciao! In questo video ti mostro Stock Usato, l’app con tutto lo stock dell’usato di Valentino, sempre aggiornato. Funziona sul telefono e sul computer, all’indirizzo che vedi sullo schermo.' },
  { k: 'agg', titolo: 'Si aggiorna da sola', desc: 'Ogni mattina la stampa del gestionale arriva per mail e l’app si aggiorna. In alto: <b>data della stampa</b> e <b>numero di veicoli</b>.',
    voce: 'Non devi caricare niente: ogni mattina, quando arriva la stampa del gestionale, l’app si aggiorna da sola. In alto vedi la data della stampa e quanti veicoli ci sono. Se compare la scritta non di oggi, la stampa del giorno non è ancora arrivata.' },
  { k: 'installa', titolo: 'Mettila sulla schermata Home', desc: '<b>Android</b>: tocca “Installa app”.<br><b>iPhone</b>: apri il sito con Safari → Condividi → Aggiungi a Home.',
    voce: 'Conviene installarla come un’app. Su Android tocca installa app. Su iPhone apri il sito con Safari, tocca condividi e poi aggiungi a Home. Si apre a tutto schermo e funziona anche senza rete, con l’ultimo stock scaricato.' },
  { k: 'kpi', titolo: 'Le scorciatoie in alto', desc: 'Tocca un riquadro: <b>Libere</b>, <b>Prenotate</b>, <b>In arrivo</b>, <b>Ferme da oltre 90 giorni</b>. Sotto trovi le viste rapide e le novità rispetto al giorno prima.',
    voce: 'I riquadri in alto sono scorciatoie. Tocca Libere e vedi solo le auto disponibili. Ci sono anche le prenotate, quelle in arrivo e le libere ferme da più di novanta giorni. Subito sotto trovi le novità rispetto al giorno prima: nuovi ingressi, uscite e prezzi cambiati.' },
  { k: 'ricerca', titolo: 'Cerca come parli', desc: 'Scrivi una frase normale: <b>“golf diesel automatica sotto 35000”</b>. Sotto la barra vedi cosa ha capito.',
    voce: 'La ricerca capisce le frasi come le diresti a un collega. Per esempio: golf diesel automatica sotto trentacinquemila. Sotto la barra vedi cosa ha capito, e i risultati si aggiornano mentre scrivi. Funziona anche con la targa, il colore, l’ubicazione o il nome del venditore.' },
  { k: 'filtri', titolo: 'Tutti i filtri', desc: 'Il pulsante <b>Filtri</b> in basso: stato, marca, modello, prezzo, km, anno, potenza, ubicazione, giorni in stock e altro.',
    voce: 'Con il pulsante filtri, in basso, scegli quello che ti serve: stato, marca, modello, prezzo, chilometri, anno, potenza, ubicazione, giorni in stock e molto altro. Quando hai finito, tocca mostra veicoli.' },
  { k: 'scheda', titolo: 'La scheda dell’auto', desc: 'Foto anche degli interni, tutti i dati, dove si trova, la <b>storia dei prezzi</b> e il link all’<b>annuncio sul sito</b>.',
    voce: 'Tocca un’auto per aprire la scheda. Trovi le foto, anche degli interni, scorrendo di lato. Poi tutti i dati, dove si trova, la storia dei prezzi e il link all’annuncio sul sito, con il giro a trecentosessanta gradi quando c’è.' },
  { k: 'cliente', titolo: 'Invia al cliente', desc: 'Un tocco e prepari il messaggio per <b>WhatsApp</b>: dati, prezzo e link alle foto. Niente informazioni interne.',
    voce: 'Con il pulsante invia al cliente prepari in un attimo un messaggio pulito da mandare su WhatsApp o per mail: dati dell’auto, prezzo e link alle foto. Le informazioni interne, come anticipata e note, non ci sono.' },
  { k: 'ai', titolo: 'Chiedi all’assistente', desc: 'Descrivi il cliente con parole tue e tocca <b>Chiedi all’assistente</b>: ti propone le auto più adatte e ti dice perché.',
    voce: 'Hai un cliente e non sai cosa proporgli? Descrivilo con parole tue, per esempio: cliente con diciottomila euro, due figli, vuole l’automatica. Poi tocca chiedi all’assistente. L’intelligenza artificiale guarda le auto disponibili e ti propone le più adatte, spiegando perché. Controlla sempre i dati nella scheda prima di proporle.' },
  { k: 'stat', pc: true, titolo: 'Statistiche', desc: 'Entrate e uscite giorno per giorno, quanto ci mette ogni modello a prenotarsi, prezzi ritoccati, auto ferme.',
    voce: 'Nella sezione statistiche trovi entrate e uscite giorno per giorno, in quanti giorni si prenota ogni modello, i prezzi ritoccati e le auto ferme da più tempo. Dal computer hai anche la tabella ordinabile e il pulsante per scaricare l’Excel.' },
  { k: 'avvisi', titolo: 'Avvisami quando entra', desc: 'Cerchi un’auto che oggi non c’è? Scrivi la ricerca e tocca <b>Avvisami quando entra</b>: ti arriva una mail appena entra.<br>Per fermarlo: mail con oggetto <b>STOP AVVISO</b>.',
    voce: 'Cerchi un’auto che oggi non c’è? Scrivi la ricerca e tocca avvisami quando entra. Si apre una mail già pronta: mandala e, appena entra un’auto adatta, ti arriva un avviso. Per fermarlo, manda una mail con oggetto stop avviso.' },
  { k: 'fine', titolo: 'Buone vendite!', desc: 'Dubbi o idee per migliorarla? Chiedi a <b>Giuseppe</b>.<br><span class="url">giuseppecavalli303.github.io/gestore-stock</span>',
    voce: 'Questo è tutto. Se hai dubbi o idee per migliorarla, chiedi a Giuseppe. Buone vendite!' }
];

/* ---------- server locale del sito ---------- */
const TIPI = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.js': 'text/javascript', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]); if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TIPI[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});

/* ---------- voce e sottotitoli ---------- */
function durata(file) {
  let out = '';
  try { execFileSync(FFMPEG, ['-i', file], { stdio: 'pipe' }); } catch (e) { out = String(e.stderr || ''); }
  const m = out.match(/Duration: (\d+):(\d+):([\d.]+)/);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
}
function voce(s, i) {
  const mp3 = path.join(AU, `s${i}.mp3`), srt = path.join(AU, `s${i}.srt`);
  execFileSync('python', ['-m', 'edge_tts', '--voice', VOCE, '--rate=+4%', '--text', s.voce, '--write-media', mp3, '--write-subtitles', srt], { stdio: 'pipe' });
  return { mp3, srt, dur: durata(mp3) };
}

/* ---------- registrazione ---------- */
(async () => {
  await new Promise(r => server.listen(PORTA, r));
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars', '--force-color-profile=srgb'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.goto(`http://localhost:${PORTA}/video/palco.html`, { waitUntil: 'networkidle0' });
  const app = await (await page.$('#app')).contentFrame();
  await app.waitForFunction(() => { const m = document.getElementById('metaLine'); return m && !/esempio/i.test(m.textContent); }, { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  const pausa = ms => new Promise(r => setTimeout(r, ms));

  const fotogrammi = [];                         // [{file, dur, scena}]
  let n = 0, scenaCorrente = 0;
  const scatta = async (dur = 0.1) => { const file = path.join(FR, `f${String(n++).padStart(5, '0')}.jpg`); await page.screenshot({ path: file, type: 'jpeg', quality: 88 }); fotogrammi.push({ file, dur, scena: scenaCorrente }); };
  const fra = (f, sel) => f.waitForSelector(sel, { visible: true, timeout: 20000 });
  // cerchio del tocco sopra l'elemento, poi clic
  async function tocca(f, sel, wrapSel = '#wrap', scala = Z) {
    const el = await fra(f, sel);
    const r = await el.evaluate(e => { e.scrollIntoView({ block: 'nearest', inline: 'nearest' }); const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    const w = await page.$eval(wrapSel, e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y }; });
    await page.evaluate((x, y) => tocco(x, y), w.x + r.x * scala, w.y + r.y * scala);
    await scatta(0.45);
    await el.evaluate(e => e.click());
    await pausa(450);
    await page.evaluate(() => viaTocco());
    await scatta(0.35);
  }
  async function scrivi(f, testo) {
    await f.evaluate(() => { const q = document.getElementById('q'); q.value = ''; q.dispatchEvent(new Event('input')); });
    for (let i = 1; i <= testo.length; i++) {
      await f.evaluate(t => { const q = document.getElementById('q'); q.value = t; q.dispatchEvent(new Event('input')); }, testo.slice(0, i));
      if (i % 2 === 0 || i === testo.length) { await pausa(30); await scatta(0.08); }
    }
    await pausa(500); await scatta(0.6);
  }
  const svuota = f => f.evaluate(() => { const b = document.querySelector('[data-rm="all"]'); if (b) b.click(); const q = document.getElementById('q'); q.value = ''; q.dispatchEvent(new Event('input')); window.scrollTo(0, 0); });
  const scorri = async (f, y, passi = 6) => { const y0 = await f.evaluate(() => scrollY); for (let i = 1; i <= passi; i++) { await f.evaluate(v => scrollTo(0, v), y0 + (y - y0) * i / passi); await scatta(0.07); } };

  const regia = {
    async intro() { await scatta(1); },
    async agg() { await tocca(app, '#metaLine'); await scatta(1); },
    async installa() { await scorri(app, 140); await scorri(app, 0); await scatta(1); },
    async kpi() { await tocca(app, '[data-preset="free"]'); await scorri(app, 330, 8); await scatta(1); await scorri(app, 0); await tocca(app, '[data-preset="free"]'); },
    async ricerca() { await scrivi(app, 'golf diesel automatica sotto 35000'); await scorri(app, 300, 8); await scatta(1.2); await scorri(app, 0); },
    async filtri() {
      await tocca(app, '#btnFilters'); await pausa(500); await scatta(0.6);
      await tocca(app, '#filters [data-seg="disp"] [data-v="free"]');
      const ubic = await app.$('#filters [data-f="ubic"]');
      if (ubic) { const sel = await ubic.evaluate(e => `#filters [data-f="ubic"][data-v="${e.dataset.v}"]`); await tocca(app, sel); }
      await scatta(0.8); await tocca(app, '#fClose2'); await pausa(500); await scatta(1);
    },
    async scheda() {
      await svuota(app); await app.evaluate(() => { document.querySelector('[data-preset="free"]').click(); }); await pausa(500); await scatta(0.3);
      await tocca(app, '#grid .card'); await pausa(1500); await scatta(0.8);
      for (let i = 1; i <= 4; i++) { await app.evaluate(k => { const g = document.querySelector('#drawer .gal'); if (g) g.scrollTo({ left: g.clientWidth * 0.86 * k, behavior: 'instant' }); }, i); await pausa(700); await scatta(0.7); }
      for (const y of [350, 700, 1050]) { await app.evaluate(v => { document.querySelector('#drawer .scroll').scrollTo(0, v); }, y); await pausa(250); await scatta(0.9); }
    },
    async cliente() {
      await app.evaluate(() => document.querySelector('#drawer .scroll').scrollTo(0, 0)); await scatta(0.4);
      await tocca(app, '#dShare'); await pausa(300); await scatta(1.4);
      await tocca(app, '#dClose'); await pausa(500);
    },
    async ai() {
      await svuota(app); await pausa(300);
      await scrivi(app, 'cliente con 18 mila, due figli, vuole automatica');
      await tocca(app, '#askAI'); await scatta(0.8);
      await app.waitForSelector('#drawer .ai-list li, #drawer .ai-err', { timeout: 60000 }); await pausa(1200); await scatta(1.2);
      for (const y of [260, 520]) { await app.evaluate(v => document.querySelector('#drawer .scroll').scrollTo(0, v), y); await pausa(300); await scatta(1.2); }
      await app.evaluate(() => document.getElementById('dClose').click()); await pausa(400);
    },
    async stat() {
      const pc = await (await page.$('#app2')).contentFrame();
      await page.$eval('#app2', e => { e.src = '/index.html#statistiche'; });
      await pausa(500);
      const pc2 = await (await page.$('#app2')).contentFrame();
      await pc2.waitForSelector('#stats .panel svg', { timeout: 30000 }); await pausa(1500); await scatta(1.2);
      await scorri(pc2, 520, 10); await scatta(1.4); await scorri(pc2, 1150, 10); await scatta(1.4);
    },
    async avvisi() { await svuota(app); await scrivi(app, 't-roc automatica sotto 25000'); const a = 'a.linkbtn[href^="mailto"]'; const el = await fra(app, a); const r = await el.evaluate(e => { const b = e.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }); const w = await page.$eval('#wrap', e => e.getBoundingClientRect()); await page.evaluate((x, y) => tocco(x, y), w.x + r.x * Z, w.y + r.y * Z); await scatta(2); await page.evaluate(() => viaTocco()); },
    async fine() { await svuota(app); await pausa(500); await scatta(1); }
  };

  const tracce = [];
  for (let i = 0; i < SCENE.length; i++) {
    const s = SCENE[i];
    scenaCorrente = i;
    await page.evaluate((s, i, n) => scena(s, i, n), s, i && i < SCENE.length - 1 ? i : 0, SCENE.length - 2);
    await pausa(300);
    tracce.push(voce(s, i));
    await regia[s.k]();
    console.log(`scena ${i + 1}/${SCENE.length} registrata (${s.k})`);
  }
  await browser.close(); server.close();

  /* ---------- montaggio: ogni scena dura almeno quanto la sua voce ---------- */
  const lista = [], audio = [], srt = [];
  let t = 0, nSub = 1;
  const tc = s => { const ms = Math.round(s * 1000); return new Date(ms).toISOString().slice(11, 23).replace('.', ','); };
  for (let i = 0; i < SCENE.length; i++) {
    const fs_ = fotogrammi.filter(f => f.scena === i), voceDur = tracce[i].dur + 0.7;
    const somma = fs_.reduce((a, f) => a + f.dur, 0);
    if (somma < voceDur) fs_[fs_.length - 1].dur += voceDur - somma;      // tengo fermo l'ultimo fotogramma
    const durScena = fs_.reduce((a, f) => a + f.dur, 0);
    fs_.forEach(f => lista.push(`file '${f.file.replace(/\\/g, '/')}'\nduration ${f.dur.toFixed(3)}`));
    const wav = path.join(AU, `s${i}.wav`);
    execFileSync(FFMPEG, ['-y', '-i', tracce[i].mp3, '-af', `apad=whole_dur=${durScena.toFixed(3)}`, '-ar', '48000', '-ac', '2', wav], { stdio: 'pipe' });
    audio.push(`file '${wav.replace(/\\/g, '/')}'`);
    // sottotitoli della voce, spostati all'inizio della scena
    const blocchi = fs.readFileSync(tracce[i].srt, 'utf8').trim().split(/\r?\n\r?\n/);
    for (const b of blocchi) {
      const r = b.split(/\r?\n/), m = (r[1] || '').match(/(\d+):(\d+):(\d+)[,.](\d+) --> (\d+):(\d+):(\d+)[,.](\d+)/);
      if (!m) continue;
      const a0 = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000, a1 = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
      srt.push(`${nSub++}\n${tc(t + a0)} --> ${tc(t + a1)}\n${r.slice(2).join(' ')}`);
    }
    t += durScena;
  }
  const ultimo = fotogrammi[fotogrammi.length - 1].file.replace(/\\/g, '/');
  fs.writeFileSync(path.join(OUT, 'video.txt'), lista.join('\n') + `\nfile '${ultimo}'\n`);
  fs.writeFileSync(path.join(OUT, 'audio.txt'), audio.join('\n') + '\n');
  fs.writeFileSync(path.join(OUT, 'sottotitoli.srt'), srt.join('\n\n') + '\n');
  const finale = path.join(OUT, 'stock-usato-guida.mp4');
  const stile = "FontName=Segoe UI,FontSize=11,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=3,Outline=6,Shadow=0,Alignment=1,MarginL=24,MarginR=200,MarginV=22";
  const base = ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'video.txt'), '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'audio.txt')];
  const enc = ['-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', finale];
  try {
    execFileSync(FFMPEG, [...base, '-vf', `subtitles=sottotitoli.srt:force_style='${stile}'`, ...enc], { cwd: OUT, stdio: 'pipe' });
    console.log('Video con sottotitoli creato.');
  } catch (e) {
    console.log('Sottotitoli non applicati (' + String(e.stderr || e.message).split('\n').slice(-3).join(' ') + '), creo il video senza.');
    execFileSync(FFMPEG, [...base, ...enc], { cwd: OUT, stdio: 'pipe' });
  }
  console.log(`Fatto: ${finale} (${Math.round(t)} secondi, ${fotogrammi.length} fotogrammi)`);
})().catch(e => { console.error(e); server.close(); process.exit(1); });
