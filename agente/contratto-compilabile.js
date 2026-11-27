// PDF da compilare della lettera proposta d'acquisto con la grafica Valentino (contratto.html).
// Stampa il modulo vuoto con Chrome, poi mette un campo del PDF sopra ogni riga e casella, nella stessa posizione.
// Uso: node agente/contratto-compilabile.js [file.pdf]   (di base in Desktop/documenti utili, "Contratto nuovo.pdf")
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const { PDFDocument, StandardFonts, TextAlignment, rgb, drawCheckMark } = require('pdf-lib');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const NERO = rgb(0, 0, 0);   // testo compilato nero

async function main(out) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  let campi, iniziali, pdf;
  try {
    const p = await b.newPage();
    await p.setViewport({ width: 794, height: 1123 });   // A4 a 96 dpi, come in stampa
    await p.goto(pathToFileURL(path.join(__dirname, '..', 'contratto.html')).href + '?vuoto', { waitUntil: 'networkidle0' });
    await p.emulateMediaType('print');
    ({ campi, iniziali } = await p.evaluate(() => ({
      iniziali: window.INIZIALI,
      campi: [...document.querySelectorAll('[data-k]')].map(e => {
        const box = (e.classList.contains('pettine') ? e.parentElement : e).getBoundingClientRect();
        return { k: e.dataset.k, tipo: e.type === 'checkbox' ? 'c' : e.classList.contains('pettine') ? 'n' : 't', n: +e.dataset.n || 0, destra: e.classList.contains('e'), x: box.left, y: box.top, w: box.width, h: box.height };
      }),
    })));
    pdf = await p.pdf({ preferCSSPageSize: true, printBackground: true });
  } finally { await b.close(); }

  const doc = await PDFDocument.load(pdf);
  if (doc.getPageCount() !== 1) throw new Error('Il modulo esce su ' + doc.getPageCount() + ' pagine: deve stare in una');
  const page = doc.getPage(0), H = page.getHeight(), PT = 0.75;   // 1 px CSS = 0,75 punti
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  const spunta = (cb, w) => { const { width, height } = w.getRectangle(); return { normal: { on: drawCheckMark({ x: width / 2, y: height / 2, size: Math.min(width, height) * 0.85, thickness: 1.3, color: NERO }), off: [] } }; };
  for (const c of campi) {
    const box = { x: c.x * PT, y: H - (c.y + c.h) * PT, width: c.w * PT, height: c.h * PT, backgroundColor: undefined, borderColor: undefined, borderWidth: 0, textColor: NERO };
    if (c.tipo === 'c') {
      const cb = form.createCheckBox(c.k);
      cb.addToPage(page, box);
      cb.updateAppearances(spunta);
      continue;
    }
    const f = form.createTextField(c.k);
    if (c.tipo === 'n') { f.setMaxLength(c.n); f.enableCombing(); }
    f.disableSpellChecking();
    f.addToPage(page, { ...box, font });
    if (c.destra) f.setAlignment(TextAlignment.Right);
    f.setFontSize(c.tipo === 'n' ? 9.5 : 8.6);
    if (iniziali && iniziali[c.k]) f.setText(String(iniziali[c.k]));
  }
  form.updateFieldAppearances(font);
  doc.setTitle("Lettera proposta d'acquisto - Valentino Automobili Roma");
  fs.writeFileSync(out, await doc.save());
  return campi.length;
}

if (require.main === module) {
  const out = process.argv[2] || path.join(process.env.USERPROFILE || '', 'Desktop', 'documenti utili', 'Contratto nuovo.pdf');
  main(out).then(n => console.log(`${n} campi · ${out}`)).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { main };
