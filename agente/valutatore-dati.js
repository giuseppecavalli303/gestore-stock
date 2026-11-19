// Le nostre vendite degli ultimi 2 anni per il valutatore permute: data/valutatore-vendite.json.
// Viaggiano compresse e cifrate con la stessa chiave dei nomi dei clienti (agente/nomi.js): le legge solo chi ha
// aperto il link con la chiave sul suo telefono. Senza chiave il valutatore funziona come prima, solo con i portali.
// Per ogni vendita: marca, modello, carburante, immatricolazione, km, prezzo veicolo alla prenotazione, primo prezzo,
// giorni dal primo prezzo alla prenotazione. Niente targhe, niente venditori, niente costi. Escluse le cessioni a
// commercianti (vendite-escluse.json). Dai prezzi veri di CROSS (cross-vendute.txt) solo un rapporto medio.
// Uso: node agente/valutatore-dati.js (lo lancia l'agente dopo ogni stampa nuova)
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const { leggiChiave, cifra } = require('./nomi');
const { esclusa } = require('./storico-lungo');
const { kwDa, creaVeicolo } = require('./prezzo-veicolo');
const root = path.join(__dirname, '..');
const leggi = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
const med = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };
const FILE = path.join(root, 'data', 'valutatore-vendite.json');

function vendite(L, cars, oggi, PV) {
  const { veicolo } = creaVeicolo(cars);
  const da = new Date(Date.parse(oggi) - 730 * 864e5).toISOString().slice(0, 10);
  const giorni = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 864e5));
  const out = [], rapp = [];
  for (const [t, a] of Object.entries(L)) {
    if (!a.pren || !(a.pp > 0) || !a.imm || a.pren < da || esclusa(a)) continue;
    const kw = kwDa(a.m), pp = veicolo(a.pp, kw), primo = a.p && a.p[0] ? veicolo(a.p[0][1], kw) : pp;
    if (!(pp > 0)) continue;
    const pv = PV.get(t);
    if (pv && pv / pp >= 0.7 && pv / pp <= 1.1) rapp.push(pv / pp);        // fuori forbice = errore di registrazione
    // giorni in vendita: dal primo prezzo messo alla prenotazione (dall'ingresso conterebbe anche la carrozzeria)
    const daPrezzo = a.p && a.p[0] && a.p[0][0];
    out.push([a.b, a.f, a.fu, a.imm, a.km || 0, pp, primo > 0 ? primo : pp, daPrezzo ? giorni(daPrezzo, a.pren) : null, a.pren.slice(0, 7), String(a.m || '').slice(0, 40)]);
  }
  return { campi: ['marca', 'modello', 'alimentazione', 'imm', 'km', 'prezzo', 'primo', 'giorni', 'pren', 'versione'], vendite: out, incasso: rapp.length >= 30 ? +med(rapp).toFixed(3) : null, nIncasso: rapp.length };
}

function prezziCross() {
  const PV = new Map();
  try {
    const righe = fs.readFileSync(path.join(__dirname, 'cross-vendute.txt'), 'latin1').split(/\r?\n/).filter(Boolean), h = righe[0].split(';');
    const iT = h.indexOf('Targa'), iP = h.indexOf('PV-lordo'), num = x => +String(x || '').replace(/\./g, '').replace(',', '.') || 0;
    righe.slice(1).forEach(r => { const c = r.split(';'), v = num(c[iP]); if (c[iT] && v > 0) PV.set(c[iT].trim(), v); });
  } catch (e) { /* senza export di CROSS niente rapporto di incasso */ }
  return PV;
}

module.exports = { vendite };

if (require.main === module) {
  const chiave = leggiChiave();
  if (!chiave) { console.log('Valutatore: manca la chiave dei nomi clienti (node agente/nomi.js), vendite non pubblicate.'); process.exit(0); }
  const s = leggi(path.join(root, 'data', 'stock.json'));
  const d = vendite(leggi(path.join(__dirname, 'storico-lungo-cache.json')).auto, s.cars, s.meta.day, prezziCross());
  const x = cifra(zlib.gzipSync(JSON.stringify(d)).toString('base64'), chiave);
  fs.writeFileSync(FILE, JSON.stringify({ giorno: s.meta.day, n: d.vendite.length, x }));
  console.log('Valutatore: ' + d.vendite.length + ' vendite degli ultimi 2 anni pubblicate cifrate (' + Math.round(x.length / 1024) + ' KB).');
}
