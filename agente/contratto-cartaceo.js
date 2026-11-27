// Contratto cartaceo (lettera proposta d'acquisto scansionata) con i campi da compilare sopra la scansione.
// Il foglio resta identico: i campi sono invisibili finche' non si scrive. Lo usa anche il tasto "Contratto cartaceo"
// della scheda, che lo riempie con i dati dell'auto (cartelli/contratto-cartaceo.pdf).
// Uso: node agente/contratto-cartaceo.js [scansione.pdf]   (di base Desktop/documenti utili/Contratto cartaceo.pdf)
const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, TextAlignment, rgb, drawCheckMark } = require('pdf-lib');

// Posizioni in pixel della scansione resa a scala 2 (x1, y1 alto, x2, y2 basso); t testo, c casella, n caselle a pettine.
const E = [805, 1135]; // colonna Euro
const euro = (nome, base) => ({ t: 't', nome, r: [E[0], base - 21, E[1], base], al: 2 });
const riga = (nome, x1, x2, base) => ({ t: 't', nome, r: [x1, base - 21, x2, base] });
const pettine = (nome, x1, y1, x2, y2, n) => ({ t: 'n', nome, r: [x1, y1, x2, y2], n });
const casella = (nome, x, y) => ({ t: 'c', nome, r: [x, y, x + 15, y + 15] });

const CAMPI = [
  // intestazione
  { t: 't', nome: 'Lettera di proposta n.', r: [802, 62, 1038, 98], fs: 11 },
  { t: 't', nome: 'Pratica interna n.', r: [802, 104, 1038, 140], fs: 11 },
  // acquirente
  riga('Sottoscritto', 330, 1135, 226),
  riga('Nato a', 165, 805, 271),
  riga('Provincia di nascita', 820, 925, 266),
  pettine('Data di nascita', 962, 222, 1135, 258, 6),
  riga('Residente in', 190, 870, 298),
  pettine('CAP', 900, 263, 1048, 288, 5),
  pettine('Provincia', 1078, 263, 1135, 288, 2),
  riga('Via', 115, 780, 329),
  riga('Numero civico', 820, 895, 327),
  riga('Telefono', 940, 1135, 322),
  pettine('Codice fiscale o Partita IVA', 260, 330, 722, 366, 16),
  riga('Email', 145, 720, 394),
  // venditrice
  riga('Telefono venditrice', 915, 1135, 443),
  pettine('Codice VGI', 760, 455, 905, 490, 5),
  pettine('Codice venditore', 760, 490, 905, 523, 5),
  // auto
  riga('Modello', 280, 728, 585),
  riga('Colore', 800, 1135, 580),
  pettine('Sigla modello 1', 190, 600, 398, 638, 7),
  pettine('Sigla modello 2', 412, 600, 620, 638, 7),
  pettine('Sigla colore', 818, 598, 1030, 635, 6),
  casella('IVA compresa', 446, 642),
  riga('Aliquota IVA %', 588, 640, 657),
  casella('IVA esclusa', 679, 640),
  euro('Prezzo di listino', 678),
  euro('Supplemento colore - Immatricolazione', 700),
  ...[1, 2, 3, 4, 5, 6, 7].map(i => pettine(`M${i} codice`, 195, 712 + 24 * (i - 1), 270, 736 + 24 * (i - 1), 3)),
  riga('M1 descrizione', 300, 748, 724 + 4),
  riga('M2 descrizione', 300, 748, 748 + 4),
  riga('M3 KM', 620, 748, 772 + 4),
  riga('M4 descrizione', 300, 748, 796 + 4),
  riga('M5 descrizione', 300, 748, 820 + 4),
  riga('M6 Passaggio di proprieta', 632, 748, 844 + 4),
  riga('M7 descrizione', 300, 748, 868 + 4),
  ...[1, 2, 3, 4, 5, 6, 7].map(i => euro(`M${i} euro`, 724 + 24 * (i - 1))),
  riga('Accessorio 1', 145, 748, 926),
  euro('Accessorio 1 euro', 926),
  riga('Accessorio 2', 145, 748, 950),
  euro('Accessorio 2 euro', 950),
  euro("Prezzo dell'autovettura", 974),
  euro('Spese messa su strada con IVA', 998),
  riga('Spese messa su strada con IVA - altro', 130, 748, 1022),
  euro('Spese messa su strada con IVA - altro euro', 1022),
  euro('Imponibile', 1046),
  euro('IVA', 1070),
  riga('Spese messa su strada senza IVA', 330, 748, 1113),
  euro('Spese messa su strada senza IVA euro', 1113),
  riga('Spese messa su strada senza IVA - altro', 130, 748, 1143),
  euro('Spese messa su strada senza IVA - altro euro', 1137),
  euro('Prezzo chiavi in mano', 1161),
  // consegna e pagamento
  pettine('Data prevista di consegna', 385, 1182, 612, 1218, 8),
  riga('a) Euro', 175, 820, 1237),
  casella('Leasing', 1037, 1213),
  riga('a) Euro spese istruttoria', 165, 565, 1261),
  riga('b) Euro finanziamento', 165, 680, 1285),
  riga('Mesi', 258, 330, 1309),
  riga('Rata mensile euro', 495, 770, 1309),
  riga('Rif. tabella', 885, 985, 1307),
  riga('c) Euro valore usato', 165, 495, 1332),
  riga('Usato marca', 1010, 1135, 1328),
  riga('Usato modello', 190, 370, 1356),
  riga('Usato anno immatricolazione', 495, 590, 1356),
  riga('Usato targa', 640, 775, 1356),
  riga('Usato intestato a', 875, 1135, 1354),
  riga('Usato note', 130, 1135, 1380),
  casella('Usato da cedere', 1026, 1382),
  casella('Usato da consegnare per la vendita', 512, 1410),
  casella('Usato di esclusiva proprieta', 247, 1477),
  casella('Usato nella disponibilita', 481, 1477),
  riga('Deposito cauzionale euro', 680, 1135, 1562),
  pettine('Data', 500, 1598, 730, 1636, 8),
  // riga libera sopra "Roma": la dicitura del prezzo speciale
  { t: 't', nome: 'Note', r: [92, 1565, 1135, 1590], multi: true },
];

const NERO = rgb(0, 0, 0);   // testo compilato nero
const spunta = (cb, w) => { const { width, height } = w.getRectangle(); return { normal: { on: drawCheckMark({ x: width / 2, y: height / 2, size: Math.min(width, height) * 0.8, thickness: 1.4, color: NERO }), off: [] } }; };
const nome = c => c.nome.split('.').join('');   // i punti nei nomi dei campi non sono ammessi

async function crea(scansione) {
  const doc = await PDFDocument.load(fs.readFileSync(scansione));
  const page = doc.getPage(0), H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const form = doc.getForm();
  for (const c of CAMPI) {
    const [x1, y1, x2, y2] = c.r;
    const box = { x: x1 / 2, y: H - y2 / 2, width: (x2 - x1) / 2, height: (y2 - y1) / 2, backgroundColor: undefined, borderColor: undefined, borderWidth: 0, textColor: NERO };
    if (c.t === 'c') { const cb = form.createCheckBox(nome(c)); cb.addToPage(page, box); cb.updateAppearances(spunta); continue; }
    const f = form.createTextField(nome(c));
    if (c.t === 'n') { f.setMaxLength(c.n); f.enableCombing(); }
    if (c.multi) f.enableMultiline();
    f.disableSpellChecking();
    f.addToPage(page, { ...box, font });
    if (c.al === 2) f.setAlignment(TextAlignment.Right);
    if (c.multi) f.setFontSize(6.4); else f.setFontSize(c.fs || (c.t === 'n' ? 11 : 9));
  }
  form.updateFieldAppearances(font);
  doc.setTitle("Lettera proposta d'acquisto - compilabile");
  return doc.save();
}

if (require.main === module) {
  const utili = path.join(process.env.USERPROFILE || '', 'Desktop', 'documenti utili');
  const scansione = process.argv[2] || path.join(utili, 'Contratto cartaceo.pdf');
  crea(scansione).then(pdf => {
    for (const out of [path.join(utili, 'Contratto cartaceo - compilabile.pdf'), path.join(__dirname, '..', 'cartelli', 'contratto-cartaceo.pdf')]) { fs.writeFileSync(out, pdf); console.log(out); }
    console.log(CAMPI.length + ' campi');
  }).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { crea, CAMPI };
