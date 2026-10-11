/* Normalizzazione: dalle celle grezze a schede veicolo con campi derivati */
const STATI = { 0: 'In vendita', 1: 'Prenotata', 4: 'Non in vendita', 6: 'In riparazione', 7: 'In arrivo', 9: 'Targata' };
const VW_FAM = [
  [/\bID\.? ?BUZZ/, 'ID. Buzz'], [/\bID\.? ?3\b/, 'ID.3'], [/\bID\.? ?4\b/, 'ID.4'], [/\bID\.? ?5\b/, 'ID.5'], [/\bID\.? ?7\b/, 'ID.7'], [/\bID\.? POLO/, 'ID. Polo'],
  [/T[- ]?CROSS/, 'T-Cross'], [/T[- ]?ROC/, 'T-Roc'], [/\bTAIGO/, 'Taigo'], [/\bTIGUAN/, 'Tiguan'], [/\bTAYRON/, 'Tayron'], [/\bTOUAREG/, 'Touareg'], [/\bTOURAN/, 'Touran'],
  [/\bPASSAT/, 'Passat'], [/\bARTEON/, 'Arteon'], [/\bGOLF/, 'Golf'], [/\bPOLO\b/, 'Polo'], [/\bBEETLE|MAGGIOLINO/, 'Beetle'], [/\bCADDY/, 'Caddy'], [/\bUP\b|UP!/, 'up!']
];
const OTHER_FAM = [
  [/\b500X\b/, 'Fiat', '500X'], [/\b500L\b/, 'Fiat', '500L'], [/\b500\b/, 'Fiat', '500'], [/\bPAND(A|INA)\b/, 'Fiat', 'Panda'], [/\b600\b/, 'Fiat', '600'], [/\bTIPO\b/, 'Fiat', 'Tipo'],
  [/YPSILON/, 'Lancia', 'Ypsilon'], [/AVENGER/, 'Jeep', 'Avenger'], [/RENEGADE/, 'Jeep', 'Renegade'], [/\bCOMPASS\b/, 'Jeep', 'Compass'],
  [/FORMENTOR/, 'Cupra', 'Formentor'], [/\bBORN\b/, 'Cupra', 'Born'], [/\bLEON\b/, 'Cupra', 'Leon'], [/\bATECA\b/, 'Seat', 'Ateca'], [/\bIBIZA\b/, 'Seat', 'Ibiza'], [/\bARONA\b/, 'Seat', 'Arona'],
  [/\bA1\b/, 'Audi', 'A1'], [/\bA3\b/, 'Audi', 'A3'], [/\bA4\b/, 'Audi', 'A4'], [/\bQ2\b/, 'Audi', 'Q2'], [/\bQ3\b/, 'Audi', 'Q3'], [/\bQ5\b/, 'Audi', 'Q5'],
  [/CLASSE A\b/, 'Mercedes', 'Classe A'], [/CLASSE B\b/, 'Mercedes', 'Classe B'], [/CLASSE C\b/, 'Mercedes', 'Classe C'], [/\bGLA\b/, 'Mercedes', 'GLA'],
  [/\bFIESTA\b/, 'Ford', 'Fiesta'], [/\bPUMA\b/, 'Ford', 'Puma'], [/\bFOCUS\b/, 'Ford', 'Focus'], [/\bKUGA\b/, 'Ford', 'Kuga'],
  [/\bI10\b/, 'Hyundai', 'i10'], [/\bI20\b/, 'Hyundai', 'i20'], [/\bTUCSON\b/, 'Hyundai', 'Tucson'], [/\bKONA\b/, 'Hyundai', 'Kona'],
  [/\bCORSA\b/, 'Opel', 'Corsa'], [/\bMOKKA\b/, 'Opel', 'Mokka'], [/CAPTURE?\b/, 'Renault', 'Captur'], [/\bCLIO\b/, 'Renault', 'Clio'],
  [/\bC3\b/, 'Citroën', 'C3'], [/DISCOVERY/, 'Land Rover', 'Discovery Sport'], [/EVOQUE/, 'Land Rover', 'Evoque'],
  [/X[- ]?TRAIL/, 'Nissan', 'X-Trail'], [/QASHQAI/, 'Nissan', 'Qashqai'], [/\bJUKE\b/, 'Nissan', 'Juke'], [/\bMICRA\b/, 'Nissan', 'Micra'],
  [/FORFOUR/, 'Smart', 'Forfour'], [/FORTWO/, 'Smart', 'Fortwo'],
  [/\bFABIA\b/, 'Skoda', 'Fabia'], [/\bOCTAVIA\b/, 'Skoda', 'Octavia'], [/\bKAMIQ\b/, 'Skoda', 'Kamiq'], [/\bKAROQ\b/, 'Skoda', 'Karoq'],
  [/\bYARIS\b/, 'Toyota', 'Yaris'], [/\bAYGO\b/, 'Toyota', 'Aygo'], [/C-HR/, 'Toyota', 'C-HR'], [/\b208\b/, 'Peugeot', '208'], [/\b2008\b/, 'Peugeot', '2008'], [/\b3008\b/, 'Peugeot', '3008'],
  [/SANDERO/, 'Dacia', 'Sandero'], [/DUSTER/, 'Dacia', 'Duster'], [/PICANTO/, 'Kia', 'Picanto'], [/SPORTAGE/, 'Kia', 'Sportage'],
  [/\bMINI\b/, 'Mini', 'Mini'], [/\bBMW\b|SERIE [1-5]\b/, 'BMW', 'Serie'], [/GIULIETTA|STELVIO|TONALE/, 'Alfa Romeo', 'Alfa'], [/\bCX-?\d+\b|MAZDA/, 'Mazda', 'Mazda'], [/\bXC\d0\b|VOLVO/, 'Volvo', 'Volvo']
];
const COLORI = [
  ['Bianco', /WHITE|BIANC|BLANC|GELATO/, '#f4f5f7'], ['Nero', /BLACK|NER[OA]\b|NOIR|VESUVIO/, '#17181c'], ['Argento', /SILVER|ARGENT|AEGENTO|\bARG\b/, '#b9bec7'], ['Grigio', /GREY|GRAY|GRIGI|GRG|GRIS|GRAU|SMOK|\bGR\.? ?MET|GRAPHITE|TITAN|PLATIN/, '#7b808a'],
  ['Blu', /BLUE?\b|\bBLU|BLEU|BLAU|AZUL|AZZURR|CELESTE|TURQUOIS/, '#2456c9'], ['Rosso', /\bRED\b|ROSS[OA]|BORDEAUX/, '#c8262c'], ['Verde', /GREEN|VERDE/, '#3d7d55'], ['Giallo', /YELLOW|GIALL/, '#e7c21f'],
  ['Arancione', /ORANGE|ARANC/, '#e8791c'], ['Beige', /BEIGE|SABBIA|BRONZ|BROWN|MARRON|GOLD|ORO\b/, '#b99a6b']
];
const COLOR_HEX = Object.fromEntries(COLORI.map(c => [c[0], c[2]]));
COLOR_HEX.Altro = '#9aa3b2';
COLOR_HEX['n.d.'] = '#9aa3b2';

function isoDate(s) { const m = (s || '').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; }
function money(s) { const m = (s || '').match(/-?\d{1,3}(?:\.\d{3})*,\d{2}/); return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : 0; }
function titleCase(s) { return s.toLowerCase().replace(/(^|[\s'-])([a-zà-ù])/g, (m, a, b) => a + b.toUpperCase()); }
function dayDiff(a, b) { return Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5); }

function describe(modello, marcaRaw, section) {
  const M = modello.toUpperCase();
  let brand = '', family = '';
  const tryVW = () => { for (const [re, f] of VW_FAM) if (re.test(M)) { brand = 'Volkswagen'; family = f; return true; } return false; };
  const tryOther = () => { for (const [re, b, f] of OTHER_FAM) if (re.test(M)) { brand = b; family = f; return true; } return false; };
  if (marcaRaw === 'VW') { tryVW() || tryOther(); } else { tryOther() || tryVW(); }
  if (!brand) { brand = marcaRaw === 'VW' ? 'Volkswagen' : 'Altre marche'; family = titleCase(M.split(/\s+/)[0] || 'n.d.'); }

  let cv = 0, kw = 0, m;
  if ((m = M.match(/(\d{2,3})\s*(?:CV|PS\b|CH\b|HP\b)/))) cv = +m[1];
  else if ((m = M.match(/KW\s*\/\s*(\d{2,3})\b/))) cv = +m[1];
  if ((m = M.match(/(\d{2,3})\s*KW(?!H)/))) kw = +m[1];
  else if ((m = M.match(/KW\s?(\d{2,3})/))) kw = +m[1];
  if (cv > 650) cv = 0;                                       // refuso nel gestionale
  if (!cv && kw) cv = Math.round(kw * 1.35962);
  if (!kw && cv) kw = Math.round(cv / 1.35962);
  if (cv && kw && cv < kw) cv = Math.round(kw * 1.35962);   // testo troncato tipo "110 KW/ 15"

  let fuel;
  if (/E-?HYBRID|\bGTE\b|PLUG|PHEV/.test(M)) fuel = 'Plug-in';
  else if (/\bID\.|\bE-UP|ELECTRIC|ELETTRIC|\bBORN\b|KWH|\bBEV\b|E-BOOST/.test(M)) fuel = 'Elettrica';
  else if (/\bTDI\b|\bGTD\b|DIESEL|HDI\b|MJT|MULTIJET|\bCDI\b|\bDCI\b|CRDI|\b\d{3}D\b/.test(M) || /DIESEL/.test(section)) fuel = 'Diesel';
  else if (/\bTGI\b|METANO|\bCNG\b/.test(M) || /METANO/.test(section)) fuel = 'Metano';
  else if (/GPL|\bLPG\b|BIFUEL/.test(M)) fuel = 'GPL';
  else if (/HYBRID|IBRID|ETSI|MHEV|\bHEV\b/.test(M)) fuel = 'Ibrida';
  else fuel = 'Benzina';

  let cambio = 'n.d.';
  if (/DSG|AUTOMATIC|AUTOM|\bAUT\b|S[- ]?TRONIC|TIPTRONIC|\bEDC\b|\bDCT\b|\bCVT\b|\bEAT\d|[178]-SPEED/.test(M) || fuel === 'Elettrica') cambio = 'Automatico';
  else if (/MANUAL|\bBVM|\bMT\d?\b|[56]-SPEED/.test(M)) cambio = 'Manuale';
  return { brand, family, cv, kw, fuel, cambio };
}

function colorGroup(c) {
  if (!c || c === '0') return 'n.d.';
  const C = c.toUpperCase();
  let best = 'Altro', pos = 1e9;
  for (const [name, re] of COLORI) { const m = C.match(re); if (m && m.index < pos) { pos = m.index; best = name; } }
  return best;
}

function normalize(ext) {
  const day = (ext.printDate || new Date().toISOString()).slice(0, 10);
  const cars = ext.rows.map(r => {
    const g = k => r.cells[COLS.indexOf(k)].map(o => o.s).join(' ').replace(/\s+/g, ' ').trim();
    const stato = g('stato'), st = +stato[0];
    const modello = g('modello'), marcaRaw = g('marca');
    const d = describe(modello, marcaRaw, r.section);
    const ingr = isoDate(g('dataIngr')), imm = g('dImm').replace('/', '-');
    const chk = g('checkList'), as = g('autoscout');
    const note = g('note').replace(/-\s+(?=[A-Z]+-)/g, '-').replace(/\.\s*-/g, '. -');
    const colore = g('colore'), acq = g('acquirente');
    const c = {
      targa: g('targa'), st, stato: STATI[st] || stato.replace(/^\d - /, ''), marcaRaw, brand: d.brand, family: d.family, modello,
      ingr, giorni: ingr ? Math.max(0, dayDiff(day, ingr)) : null, imm, anno: +imm.slice(0, 4) || null,
      km: parseInt(g('km').replace(/\./g, ''), 10) || 0, colore: titleCase(colore), colorG: colorGroup(colore),
      spec: /^SI/.test(g('prezzoSpec')), check: /^SI/.test(chk), checkDate: isoDate(chk), as: /^SI/.test(as), asDate: isoDate(as),
      note, iva: /IVA ESP/.test(note), prezzoV: money(g('prezzoVeicolo')), pp: money(g('pp')), prezzo: money(g('prezzoTot')),
      ingresso: titleCase(g('ingresso')), ubic: titleCase(g('ubicazione')), antic: g('anticipata'),
      mini: /^SI/.test(g('miniPP')), acq: titleCase(acq), dataPren: isoDate(g('dataPren')), caparra: money(g('caparra')), modVen: g('modVen'),
      fv: /^SI/.test(g('fv')), vend: titleCase(g('venditore')), section: r.section.replace(/^\d{2}( [A-Z])? - /, ''),
      cv: d.cv, kw: d.kw, fuel: d.fuel, cambio: d.cambio
    };
    c.free = st === 0 && !c.acq;
    c.booked = st === 1 || !!c.acq;
    return c;
  });
  const bySec = {};
  ext.rows.forEach(r => { bySec[r.section] = (bySec[r.section] || 0) + 1; });
  const badSec = Object.keys(ext.totals).filter(k => (bySec[k] || 0) !== ext.totals[k]);
  return { cars, meta: { printDate: ext.printDate, day, expected: ext.grand, count: cars.length, badSec, warnings: ext.warnings.slice(0, 20) } };
}
