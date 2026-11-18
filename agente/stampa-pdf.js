// Stampa una pagina HTML in PDF con Chrome (A4; la pagina puo' chiedere l'orizzontale con @page { size: A4 landscape }).
// Uso da riga di comando: node agente/stampa-pdf.js <file.html> <file.pdf>   ·   da codice: await stampaPdf(html, pdf)
// Elenchi, controlli e rapporti per Giuseppe si consegnano sempre in PDF.
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function stampaPdf(html, pdf) {
  const b = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const p = await b.newPage();
    await p.goto(pathToFileURL(html).href, { waitUntil: 'networkidle0' });
    await p.pdf({ path: pdf, format: 'A4', preferCSSPageSize: true, printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '10mm', right: '10mm' } });
  } finally { await b.close(); }
}

module.exports = { stampaPdf };
if (require.main === module) stampaPdf(process.argv[2], process.argv[3]).then(() => console.log('ok')).catch(e => { console.error(e.message); process.exit(1); });
