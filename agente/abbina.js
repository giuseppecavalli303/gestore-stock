// Collega ogni auto dello stock al suo annuncio su valentinoautomobili.it.
// Prima per targa; se il sito usa un codice interno al posto della targa, per chilometri esatti + mese/anno di immatricolazione + marca.
// Uso da riga di comando: node agente/abbina.js  (riapplica gli annunci a data/stock.json)
const fs = require('fs'), path = require('path');

const FOTO_BASE = 'https://cdn.dealerk.it/dealer/datafiles/vehicle/images/';
const FOTO_MAX = 40;                         // tutte le foto dell'annuncio (oggi al massimo 24)
const deacc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function cambioDa(a) {
  const g = deacc(a.cambio);
  if (/autom|sequenz|robot|dsg|cvt|doppia frizione/.test(g)) return 'Automatico';
  if (/manual/.test(g)) return 'Manuale';
  return '';
}

function arricchisci(cars, annunci) {
  const perTarga = new Map(), perKm = new Map();
  for (const a of annunci) {
    if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(a.targa)) perTarga.set(a.targa, a);
    if (a.km >= 100 && a.imm) { const k = a.km + '|' + a.imm; perKm.set(k, (perKm.get(k) || []).concat(a)); }
  }
  let perT = 0, perK = 0;
  for (const c of cars) {
    delete c.web;
    if (c._cambioPdf) { c.cambio = c._cambioPdf; delete c._cambioPdf; }
    let a = perTarga.get(c.targa), come = 'targa';
    const stessaMarca = x => deacc(x.marca).slice(0, 4) === deacc(c.brand).slice(0, 4);
    // due targhe vere e diverse sono due auto diverse, anche se i chilometri tornano
    const targaVera = t => /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(t);
    const compatibile = x => stessaMarca(x) && !(targaVera(c.targa) && targaVera(x.targa));
    if (!a && c.km >= 100) {
      const l = (perKm.get(c.km + '|' + c.imm) || []).filter(compatibile);
      if (l.length === 1) { a = l[0]; come = 'km'; }
    }
    // targhe interne tipo NW117634: sul sito compare solo la parte numerica (117634)
    if (!a) {
      const cifre = (c.targa.match(/\d{5,}/) || [])[0];
      if (cifre) { const l = annunci.filter(x => /^\d{5,}$/.test(x.targa) && cifre.endsWith(x.targa) && stessaMarca(x)); if (l.length === 1) { a = l[0]; come = 'codice'; } }
    }
    if (!a) continue;
    come === 'targa' ? perT++ : perK++;
    c.web = {
      url: a.url, come, foto: a.foto.slice(0, FOTO_MAX).map(u => u.replace(/^.*\/images\/\d+\//, '')),
      prezzo: a.prezzo, cambio: a.cambio, marce: a.marce, carrozzeria: a.carrozzeria, porte: a.porte, posti: a.posti,
      trazione: a.trazione, interni: a.interni, colore: a.colore, neopatentati: a.neopatentati, garanzia: a.garanzia,
      certificato: a.certificato, giro360: a.giro360, video: a.video, km0: a.tipo === 'KM0', camLista: a.camLista || '', tettoLista: a.tettoLista || '', vin: a.vin || '', cc: a.cc || 0, euro: a.euro || '', offerta: a.offerta || ''
    };
    // il PDF spesso non dice il cambio: lo prendo dall'annuncio, ricordando il valore originale
    const cb = cambioDa(a);
    if (c.cambio === 'n.d.' && cb) { c._cambioPdf = c.cambio; c.cambio = cb; }
    if (!c.cv && a.cv) { c.cv = a.cv; c.kw = a.kw || Math.round(a.cv / 1.35962); }
  }
  return { perTarga: perT, perKm: perK };
}

function caricaAnnunci(root) {
  const f = path.join(root, 'data', 'annunci.json');
  if (!fs.existsSync(f)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - Date.parse(d.aggiornato) > 4 * 864e5) return null;   // troppo vecchi: meglio niente che dati sbagliati
    return d;
  } catch (e) { return null; }
}

module.exports = { arricchisci, caricaAnnunci, FOTO_BASE };

if (require.main === module) {
  const root = path.join(__dirname, '..'), file = path.join(root, 'data', 'stock.json');
  const ann = caricaAnnunci(root);
  if (!ann) { console.error('Annunci assenti o vecchi: niente da abbinare.'); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const prima = JSON.stringify(data.cars);
  const r = arricchisci(data.cars, ann.annunci);
  data.meta.annunci = { aggiornato: ann.aggiornato, totali: ann.annunci.length, abbinati: r.perTarga + r.perKm, fotoBase: FOTO_BASE };
  if (JSON.stringify(data.cars) === prima) { console.log('Annunci invariati.'); process.exit(3); }
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`Annunci abbinati: ${r.perTarga} per targa, ${r.perKm} per km e immatricolazione.`);
}
