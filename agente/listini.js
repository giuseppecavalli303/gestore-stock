// Codice modello VW dai listini ufficiali (PDF) e abbinamento alle auto dello stock.
// Legge i listini nelle cartelle sotto (solo i file nuovi o cambiati: gli altri li ricorda in agente/listini-cache.json),
// poi per ogni Volkswagen cerca nel listino in vigore all'immatricolazione le versioni con stesso modello, kW,
// alimentazione e cambio. Non indovina: se ci sono piu' versioni le elenca tutte, se non ce n'e' nessuna lo dice.
// Scrive data/codici.json, che l'app legge quando apri la scheda di un'auto.
// Uso: node agente/listini.js
const fs = require('fs'), path = require('path');
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');

const root = path.join(__dirname, '..');
const CASA = process.env.USERPROFILE || 'C:/Users/Venditore32';
const CARTELLE = [
  { dir: path.join(CASA, 'Desktop', 'LISTINI'), tutti: true },                 // qui i listini nuovi
  { dir: path.join(CASA, 'Downloads', 'Documents'), tutti: false }              // qui solo i file che si chiamano listino
];
const CACHE = path.join(__dirname, 'listini-cache.json');
const MAX_CANDIDATI = 12;

const leggi = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return def; } };
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
const chiave = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- lettura dei PDF ---------- */
function trovaPdf() {
  const out = [];
  const giro = (d, tutti, prof) => {
    let voci = [];
    try { voci = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
    for (const v of voci) {
      const p = path.join(d, v.name);
      if (v.isDirectory()) { if (tutti && prof < 4) giro(p, tutti, prof + 1); }
      else if (/\.pdf$/i.test(v.name) && (tutti || /listin|pricelist/i.test(v.name))) out.push(p);
    }
  };
  CARTELLE.forEach(c => giro(c.dir, c.tutti, 0));
  return out;
}

// righe di una pagina ricostruite dalla posizione del testo; le celle restano separate
async function righePagina(page) {
  const c = await page.getTextContent(), righe = [];
  for (const it of c.items) {
    if (!it.str.trim()) continue;
    const y = it.transform[5];
    let r = righe.find(x => Math.abs(x.y - y) <= 2);
    if (!r) righe.push(r = { y, celle: [] });
    r.celle.push({ x: it.transform[4], s: it.str.trim() });
  }
  return righe.sort((a, b) => b.y - a.y).map(r => r.celle.sort((a, b) => a.x - b.x).map(c => c.s));
}

const RE_CODICE = /^([A-Z0-9]{6})((?:\s+[A-Z0-9]{3})*)\*?$/;
const RE_KW = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;
const RE_PREZZO = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
const RE_VALIDITA = /Validit[àa]\s*(?:dal\s*)?(\d{1,2})[./](\d{1,2})[./](\d{2,4})/i;

function alimentazioneTitolo(t) {
  if (/mild/i.test(t)) return 'Ibrida';
  if (/plug/i.test(t)) return 'Plug-in';
  if (/elettric/i.test(t)) return 'Elettrica';
  if (/^diesel/i.test(t)) return 'Diesel';
  if (/metano/i.test(t)) return 'Metano';
  if (/gpl/i.test(t)) return 'GPL';
  if (/^benzina/i.test(t)) return 'Benzina';
  return null;
}

async function leggiPdf(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0, isEvalSupported: false }).promise;
  const sezioni = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const righe = await righePagina(await doc.getPage(p));
    const testo = righe.map(r => r.join(' '));
    // in fondo alla pagina: "Nuova Polo - Anno Modello 2024 - Validità 08.05.2024"
    const iv = testo.findIndex(t => RE_VALIDITA.test(t) && /anno modello|^[A-Z]/i.test(t));
    if (iv < 0) continue;
    const m = testo[iv].match(RE_VALIDITA);
    const anno = m[3].length === 2 ? '20' + m[3] : m[3];
    const validita = `${anno}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    const modello = testo[iv].slice(0, testo[iv].search(/-?\s*(anno modello|validit)/i)).replace(/[|]/g, ' ').replace(/\s+-\s*$/, '').replace(/\s+/g, ' ').trim();
    if (!modello) continue;
    let alim = 'Benzina';
    const voci = [];
    for (const r of righe) {
      const t = alimentazioneTitolo(r[0]);
      if (t && !RE_CODICE.test(r[0])) { alim = t; continue; }
      const mc = r[0].match(RE_CODICE);
      if (!mc || !/[A-Z]/.test(mc[1]) || !/\d/.test(mc[1]) || r.length < 5) continue;
      const ik = r.findIndex(x => RE_KW.test(x)), prezzi = r.filter(x => RE_PREZZO.test(x));
      if (ik < 2 || prezzi.length < 2) continue;
      // prima dei kW c'e' la cilindrata (o la batteria in kWh delle elettriche): non fa parte della versione
      const cc = /^\d[\d.]*(\s*\(net\))?$/.test(r[ik - 1]) ? 1 : 0;
      const versione = r.slice(1, ik - cc).join(' ').replace(/\s+/g, ' ').trim();
      const [, kw, cv] = r[ik].match(RE_KW);
      let fuel = alim;
      if (/\bTDI\b/i.test(versione)) fuel = 'Diesel';
      else if (/\bTGI\b/i.test(versione)) fuel = 'Metano';
      else if (/eHybrid|\bGTE\b/i.test(versione)) fuel = 'Plug-in';
      else if (/\beTSI\b/i.test(versione)) fuel = 'Ibrida';
      else if (/\bTSI\b|\bMPI\b|\bTFSI\b/i.test(versione) && fuel !== 'Ibrida' && fuel !== 'Plug-in') fuel = 'Benzina';
      const auto = /\bDSG\b|automatic|tiptronic/i.test(versione) || fuel === 'Elettrica';
      voci.push({
        codice: (mc[1] + mc[2]).replace(/\s+/g, ' ').trim(), versione, kw: +kw, cv: +cv, fuel, cambio: auto ? 'Automatico' : 'Manuale',
        netto: num(prezzi[prezzi.length - 2]), prezzo: num(prezzi[prezzi.length - 1])
      });
    }
    if (voci.length) sezioni.push({ modello, validita, pagina: p, voci });
  }
  return sezioni;
}

/* ---------- modelli: dal nome nel listino alla famiglia dello stock ---------- */
const CARROZZERIE = [['variant', 'Variant'], ['cabriolet', 'Cabrio'], ['cabrio', 'Cabrio'], ['allspace', 'Allspace'], ['sportsvan', 'Sportsvan'], ['alltrack', 'Alltrack']];
function famigliaListino(nome, famiglie) {
  const k = chiave(nome).replace(/^(nuova|nuovo|new)/, '');
  const f = famiglie.filter(x => k.startsWith(x.k) || (k[0] === 'e' && k.slice(1).startsWith(x.k))).sort((a, b) => b.k.length - a.k.length)[0];
  if (!f) return null;
  const resto = k.slice(k.indexOf(f.k) + f.k.length), corpo = (CARROZZERIE.find(([c]) => resto.includes(c)) || [])[1] || '';
  return { famiglia: f.nome, corpo };
}
const corpoAuto = c => { const m = String(c.modello || '').toLowerCase(); return (CARROZZERIE.find(([k]) => m.includes(k)) || [])[1] || ''; };

// parole della versione che dicono l'allestimento (non il motore): servono solo a mettere in ordine i candidati
const MOTORE = new Set(['tsi', 'tdi', 'tgi', 'etsi', 'mpi', 'act', 'scr', 'dsg', 'evo', 'bmt', 'net', 'kw', 'cv', 'pure', 'pro']);
function punteggio(versione, modelloAuto) {
  const auto = ' ' + String(modelloAuto || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ') + ' ';
  const parole = versione.toUpperCase().replace(/R-LINE/g, 'RLINE').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(p => p.length > 1 && !/^\d/.test(p) && !MOTORE.has(p.toLowerCase()));
  const a = auto.replace(/ R LINE /g, ' RLINE ').replace(/ R-LINE /g, ' RLINE ');
  return parole.reduce((s, p) => s + (a.includes(' ' + p + ' ') ? 1 : 0), 0);
}

/* ---------- abbinamento ---------- */
const mesiPrima = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setMonth(d.getMonth() - n); return d.toISOString().slice(0, 10); };
function abbina(cars, sezioni) {
  const famiglie = [...new Set(cars.filter(c => c.brand === 'Volkswagen' && c.family).map(c => c.family))].map(nome => ({ nome, k: chiave(nome) })).filter(f => f.k.length >= 2);
  // stesse sezioni lette da piu' file: le unisco per nome, carrozzeria e data
  const perModello = new Map();
  for (const s of sezioni) {
    const f = famigliaListino(s.modello, famiglie);
    if (!f) continue;
    const k = chiave(s.modello) + '|' + f.corpo + '|' + s.validita;
    const g = perModello.get(k) || { ...f, validita: s.validita, nome: s.modello, chiaveNome: chiave(s.modello), fonti: new Set(), voci: new Map() };
    g.fonti.add(`${s.file} p.${s.pagina}`);
    s.voci.forEach(v => g.voci.set(v.codice + '|' + v.versione + '|' + v.kw, { ...v, validita: s.validita }));
    perModello.set(k, g);
  }
  const gruppi = [...perModello.values()];
  const filtra = (voci, c, filtri) => {
    let l = voci.filter(v => v.fuel === c.fuel);
    if (filtri) filtri.push(c.fuel);
    if (c.kw > 0) { l = l.filter(v => v.kw === c.kw || v.cv === c.cv); if (filtri) filtri.push(`${c.kw} kW`); }
    if (c.cambio === 'Automatico' || c.cambio === 'Manuale') { l = l.filter(v => v.cambio === c.cambio); if (filtri) filtri.push(c.cambio.toLowerCase()); }
    return l;
  };
  const out = {};
  for (const c of cars) {
    if (c.brand !== 'Volkswagen') continue;
    const corpo = corpoAuto(c), stessi = gruppi.filter(g => g.famiglia === c.family && g.corpo === corpo);
    const nomeModello = `${c.family}${corpo ? ' ' + corpo : ''}`;
    if (!stessi.length) { out[c.targa] = { motivo: `Non ho listini della ${nomeModello}.` }; continue; }
    const dataImm = /^\d{4}-\d{2}$/.test(c.imm || '') && !/^0000/.test(c.imm) ? c.imm + '-01' : null;
    if (!dataImm) { out[c.targa] = { motivo: 'Immatricolazione non indicata nella stampa: non so quale listino usare.' }; continue; }
    const prima = stessi.filter(g => g.validita <= dataImm);
    if (!prima.length) {
      const piuVecchio = stessi.map(g => g.validita).sort()[0];
      out[c.targa] = { motivo: `Manca il listino della ${nomeModello} in vigore a ${c.imm.slice(5, 7)}/${c.imm.slice(0, 4)}: il più vecchio che ho è del ${it(piuVecchio)}.` };
      continue;
    }
    // listino in vigore: per ogni listino dello stesso modello (es. Golf e Golf Allestimenti Sportivi) l'ultimo uscito
    // prima dell'immatricolazione; tengo solo quelli ancora attivi (non piu' vecchi di 9 mesi rispetto al piu' recente)
    const ultimo = new Map();
    prima.forEach(g => { const u = ultimo.get(g.chiaveNome); if (!u || g.validita > u.validita) ultimo.set(g.chiaveNome, g); });
    const top = [...ultimo.values()].map(g => g.validita).sort().pop(), soglia = mesiPrima(top, 9);
    const inVigore = [...ultimo.values()].filter(g => g.validita >= soglia);
    const filtri = [];
    let l = filtra(inVigore.flatMap(g => [...g.voci.values()]), c, filtri), precedenti = false;
    const listino = { nome: inVigore.map(g => g.nome).join(' + '), validita: top, fonte: [...inVigore[0].fonti][0] };
    if (!l.length) {
      // auto immatricolata dopo un cambio di listino: cerco la versione nei listini dei 24 mesi prima, il piu' recente vince
      const vecchi = prima.filter(g => g.validita >= mesiPrima(dataImm, 24) && !inVigore.includes(g)).sort((a, b) => (a.validita < b.validita ? 1 : -1));
      const visti = new Set();
      l = filtra(vecchi.flatMap(g => [...g.voci.values()]), c).filter(v => !visti.has(v.codice) && visti.add(v.codice));
      precedenti = l.length > 0;
    }
    if (!l.length) {
      out[c.targa] = { listino, motivo: `Nel listino ${listino.nome} del ${it(top)} (e in quelli dei due anni prima) non c'è una versione ${filtri.join(', ')}.` };
      continue;
    }
    const cand = l.map(v => ({ ...v, p: punteggio(v.versione, c.modello) }))
      .sort((a, b) => b.p - a.p || a.prezzo - b.prezzo)
      .filter((v, i, a) => a.findIndex(x => x.codice === v.codice) === i);
    out[c.targa] = {
      listino, filtri: filtri.join(', '), precedenti,
      c: cand.slice(0, MAX_CANDIDATI).map(v => [v.codice, v.versione, v.prezzo, v.netto, v.p, v.validita]),
      altri: Math.max(0, cand.length - MAX_CANDIDATI)
    };
  }
  return out;
}
const it = iso => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/* ---------- avvio ---------- */
async function main() {
  const cache = leggi(CACHE, {});
  const files = trovaPdf(), nuova = {};
  let letti = 0;
  for (const f of files) {
    const st = fs.statSync(f), k = f.toLowerCase(), firma = `${st.size}|${st.mtimeMs}`;
    if (cache[k] && cache[k].firma === firma) { nuova[k] = cache[k]; continue; }
    try {
      const sezioni = await leggiPdf(f);
      nuova[k] = { firma, file: path.basename(f), sezioni };
      letti++;
      if (sezioni.length) console.log(`Letto ${path.basename(f)}: ${sezioni.length} modelli, ${sezioni.reduce((s, x) => s + x.voci.length, 0)} versioni.`);
    } catch (e) { nuova[k] = { firma, file: path.basename(f), sezioni: [], errore: e.message }; }
  }
  fs.writeFileSync(CACHE, JSON.stringify(nuova));
  const sezioni = Object.values(nuova).flatMap(x => x.sezioni.map(s => ({ ...s, file: x.file })));
  const stock = leggi(path.join(root, 'data', 'stock.json'), null);
  if (!stock) throw new Error('data/stock.json mancante');
  const auto = abbina(stock.cars, sezioni);
  const date = [...new Set(sezioni.map(s => s.validita))].sort();
  // riscrivo il file solo se cambia qualcosa, cosi' l'agente non pubblica a vuoto
  const dest = path.join(root, 'data', 'codici.json'), prima = leggi(dest, {});
  const dati = { listini: date.length, dal: date[0], al: date[date.length - 1], auto };
  if (JSON.stringify({ ...prima, aggiornato: undefined }) !== JSON.stringify({ ...dati, aggiornato: undefined })) fs.writeFileSync(dest, JSON.stringify({ aggiornato: new Date().toISOString(), ...dati }));
  const v = Object.values(auto), uno = v.filter(x => x.c && x.c.length === 1).length, piu = v.filter(x => x.c && x.c.length > 1).length;
  console.log(`Codici modello: ${v.length} Volkswagen, ${uno} con un solo codice, ${piu} con più codici da scegliere, ${v.length - uno - piu} senza codice. Listini letti ora: ${letti}.`);
}

module.exports = { leggiPdf, abbina, punteggio, famigliaListino };
if (require.main === module) main().catch(e => { console.error('Listini non letti: ' + e.message); process.exit(1); });
