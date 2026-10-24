/* ---------- cartello salone: modello giusto e campi compilati come i cartelli di Valentino ---------- */
// Modelli in cartelli/ (copie dei moduli della cartella condivisa \\10.55.58.131\cartelli_usato):
// Volkswagen -> Usato Certificato, altre marche -> Usato Selezionato; "PS-" se l'auto e' a prezzo speciale.
const CARTELLO_CAMPI = {
  vw: { nome: 'NOME 2', dati: ['9', '10', '11', '12', '13', '14', '15', '16'], righe: ['TESTO10', 'TESTO11', 'TESTO12', 'TESTO9', 'TESTO13', 'TESTO14', 'TESTO15'], offerta: 'TESTO16', prezzi: ['prezzo veicolo 4', 'prezzo veicolo 5', 'prezzo veicolo 6'], file: 'schedaVW-UsatoCertificato-2023.pdf' },
  sel: { nome: 'NOME', dati: ['1', '2', '3', '4', '5', '6', '7', '8'], righe: ['TESTO1', 'TESTO2', 'TESTO3', 'TESTO4', 'TESTO5', 'TESTO6', 'TESTO7'], offerta: 'TESTO8', prezzi: ['prezzo veicolo', 'prezzo veicolo 2', 'prezzo veicolo 3'], file: 'scheda-UsatoSelezionato-2023.pdf' }
};
const CARTELLO_ALIM = { Benzina: 'Benzina', Diesel: 'Diesel', GPL: 'Benzina/GPL', Metano: 'Benzina/Metano', Elettrica: 'Elettrica', Ibrida: 'Benzina/Ibrida', 'Plug-in': 'Benzina/Elettrica Plug-in' };
const cartelloNum = n => (n ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '');
const cartelloTitolo = s => String(s || '').toLowerCase().replace(/(^|[\s\-/])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase())
  .replace(/\b(tsi|tdi|tfsi|gti|gtd|gte|dsg|cv|kw|suv|gpl|led|s line|r line)\b/gi, m => m.toUpperCase());

function datiCartello(c) {
  const w = c.web || {}, vw = c.brand === 'Volkswagen', M = CARTELLO_CAMPI[vw ? 'vw' : 'sel'];
  const ps = w.ps ? w.ps.esito === 'si' : !!c.spec;
  const nome = (w.cartello && w.cartello.nome) || cartelloTitolo(`${c.brand} ${String(c.modello || '').replace(/\s+\d+KW.*$/i, '')}`);
  const imm = /^\d{4}-\d{2}/.test(c.imm || '') ? `${c.imm.slice(5, 7)}/${c.imm.slice(0, 4)}` : '';
  const dati = [cartelloNum(w.cc), c.kw && c.cv ? `${c.kw}/${c.cv}` : '', c.cambio && c.cambio !== 'n.d.' ? c.cambio : '', CARTELLO_ALIM[c.fuel] || c.fuel || '',
    w.euro || '', imm, c.km != null ? cartelloNum(c.km) || '0' : '', `${w.garanzia || 12} mesi`];
  const campi = { [M.nome]: nome };
  M.dati.forEach((k, i) => { campi[k] = dati[i]; });
  const righe = ((w.cartello && w.cartello.righe) || []).slice(0, M.righe.length);
  M.righe.forEach((k, i) => { campi[k] = righe[i] || ''; });
  campi[M.offerta] = w.offerta || '';
  [c.prezzoV, c.pp, c.prezzo].forEach((v, i) => { campi[M.prezzi[i]] = cartelloNum(v); });
  return { vw, ps, file: (ps ? 'PS-' : '') + M.file, campi, nomeFile: `${nome} ${c.targa}.pdf`.replace(/[\\/:*?"<>|]+/g, ' ') };
}

// riempie il modulo con pdf-lib (nell'app quello caricato dalla rete, nelle prove quello del PC);
// i campi restano modificabili; un testo troppo lungo si rimpicciolisce finche' entra nel suo spazio
async function compilaCartello(PDFLib, modello, dati) {
  const pdf = await PDFLib.PDFDocument.load(modello), form = pdf.getForm();
  const font = await pdf.embedFont(PDFLib.StandardFonts.HelveticaBold), misure = [];
  for (const [campo, testo] of Object.entries(dati.campi)) {
    let f;
    try { f = form.getTextField(campo); } catch (e) { continue; }
    const spazio = f.acroField.getWidgets()[0].getRectangle().width - 4;
    const base = /prezzo/.test(campo) ? 85 : /NOME/.test(campo) ? 50 : /^TESTO/.test(campo) ? 17 : 19;
    let dimensione = base;
    while (dimensione > 8 && font.widthOfTextAtSize(testo, dimensione) > spazio) dimensione -= 1;
    f.setText(testo);
    f.setFontSize(dimensione);
    misure.push({ campo, dimensione, ridotto: dimensione < base, larghezza: font.widthOfTextAtSize(testo, dimensione), spazio });
  }
  form.updateFieldAppearances(font);
  const out = await pdf.save();
  out.misure = misure;
  return out;
}
