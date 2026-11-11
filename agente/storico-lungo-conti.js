// Dai dati raccolti da storico-lungo.js ai numeri dei grafici (data/storico-lungo.json).
// Solo aggregati: niente targhe, clienti o venditori, perche' il file e' pubblicato.
// "Vendita" = auto la cui ultima situazione nota e' prenotata con una data di prenotazione; la data della vendita e' quella.
// "Giorni per vendere" = dalla data di ingresso in stock alla prenotazione (0 se venduta prima dell'arrivo).
const { giorni, esclusa } = require('./storico-lungo.js');

const mediana = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const media = v => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
const r1 = x => (x == null ? null : Math.round(x * 10) / 10);
const FASCE_P = [[0, 10000, 'fino a 10.000 €'], [10000, 15000, '10–15.000 €'], [15000, 20000, '15–20.000 €'], [20000, 25000, '20–25.000 €'], [25000, 30000, '25–30.000 €'], [30000, 1e9, 'oltre 30.000 €']];
const FASCE_G = [[0, 15, 'entro 15 giorni'], [16, 30, '16–30'], [31, 60, '31–60'], [61, 90, '61–90'], [91, 180, '91–180'], [181, 1e9, 'oltre 180']];

function conti(S) {
  const gg = [...S.giorni].sort((a, b) => (a.d < b.d ? -1 : 1));
  const dal = gg[0].d, al = gg[gg.length - 1].d;

  // vendite ricostruite
  const vendite = [];
  for (const a of Object.values(S.auto)) {
    if (!a.bk || !a.pren || !a.ingr || esclusa(a)) continue;
    const g = giorni(a.pren, a.ingr);
    if (g < -400 || g > 1500 || a.pren > al) continue;                      // date sbagliate nel gestionale
    const prezzi = a.p.filter(x => x[0] <= a.pren || x === a.p[0]);
    let cali = 0; for (let i = 1; i < prezzi.length; i++) if (prezzi[i][1] < prezzi[i - 1][1]) cali++;
    const max = prezzi.length ? Math.max(...prezzi.map(x => x[1])) : 0, fin = a.pp || (prezzi.length ? prezzi[prezzi.length - 1][1] : 0);
    vendite.push({ d: a.pren, gg: Math.max(0, g), k: a.b + ' ' + a.f, b: a.b, fu: a.fu, ca: a.ca, prezzo: fin, cali, calo: max > 0 && fin > 0 && fin <= max ? (max - fin) / max * 100 : 0, vista: a.da });
  }
  const dentro = vendite.filter(v => v.d >= dal);                            // quelle prima dell'archivio servono solo ai tempi, non ai conteggi per mese

  // mese per mese: stock medio e movimento
  const mesi = new Map();
  const mese = k => { if (!mesi.has(k)) mesi.set(k, { m: k, n: 0, tot: 0, lib: 0, pren: 0, vecchie: 0, sommaP: 0, conP: 0, sommaGg: 0, fuel: {}, entrate: 0, uscite: 0, vendite: 0, ggV: [] }); return mesi.get(k); };
  for (const g of gg) {
    const x = mese(g.d.slice(0, 7));
    x.n++; x.tot += g.tot; x.lib += g.lib; x.pren += g.pren; x.vecchie += g.vecchie; x.sommaP += g.sommaP; x.conP += g.conP; x.sommaGg += g.sommaGg;
    for (const [f, n] of Object.entries(g.fuel)) x.fuel[f] = (x.fuel[f] || 0) + n;
  }
  for (const a of Object.values(S.auto)) {
    if (a.ingr && a.ingr >= dal && a.ingr <= al && mesi.has(a.ingr.slice(0, 7))) mese(a.ingr.slice(0, 7)).entrate++;
    if (a.a < al && mesi.has(a.a.slice(0, 7))) mese(a.a.slice(0, 7)).uscite++;
  }
  for (const v of dentro) if (mesi.has(v.d.slice(0, 7))) { const x = mese(v.d.slice(0, 7)); x.vendite++; x.ggV.push(v.gg); }
  const serie = [...mesi.values()].sort((a, b) => (a.m < b.m ? -1 : 1)).map(x => {
    const totF = Object.values(x.fuel).reduce((a, b) => a + b, 0) || 1, quota = f => r1((x.fuel[f] || 0) / totF * 100);
    return { m: x.m, stampe: x.n, tot: Math.round(x.tot / x.n), lib: Math.round(x.lib / x.n), pren: Math.round(x.pren / x.n),
      vecchie: r1(x.lib ? x.vecchie / x.lib * 100 : 0), prezzo: x.conP ? Math.round(x.sommaP / x.conP) : null, ggStock: x.lib ? Math.round(x.sommaGg / x.lib) : null,
      entrate: x.entrate, uscite: x.uscite, vendite: x.vendite, ggVendita: mediana(x.ggV),
      mix: { benzina: quota('Benzina'), diesel: quota('Diesel'), ibrida: r1(quota('Ibrida') + quota('Plug-in')), elettrica: quota('Elettrica'), gas: r1(quota('Metano') + quota('GPL')) } };
  });

  // gruppi: quante vendite, in quanti giorni (mediana), con quanto ribasso
  const gruppo = (lista, chiave, minimo) => {
    const m = new Map();
    for (const v of lista) { const k = chiave(v); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
    return [...m].filter(([, l]) => l.length >= (minimo || 1)).map(([k, l]) => ({ k, n: l.length, gg: mediana(l.map(v => v.gg)), entro30: Math.round(l.filter(v => v.gg <= 30).length / l.length * 100),
      ribassate: Math.round(l.filter(v => v.cali > 0).length / l.length * 100), calo: r1(media(l.filter(v => v.cali > 0).map(v => v.calo))), prezzo: Math.round(media(l.filter(v => v.prezzo > 0).map(v => v.prezzo)) || 0) }));
  };
  const fascia = (F, val) => { const f = F.find(([a, b]) => val >= a && val <= b); return f ? f[2] : null; };
  const anni = [...new Set(dentro.map(v => v.d.slice(0, 4)))].sort();
  // i ribassi si vedono solo per le auto entrate dopo l'inizio dell'archivio (delle altre non conosco il primo prezzo)
  const conStoria = dentro.filter(v => v.vista > dal);
  const stagione = anni.map(y => ({ anno: y, mesi: Array.from({ length: 12 }, (_, i) => { const k = `${y}-${String(i + 1).padStart(2, '0')}`; return k >= dal.slice(0, 7) && k <= al.slice(0, 7) ? dentro.filter(v => v.d.slice(0, 7) === k).length : null; }) }));
  const perGiorno = Array.from({ length: 7 }, (_, i) => dentro.filter(v => new Date(v.d + 'T12:00:00Z').getUTCDay() === (i + 1) % 7).length);   // da lunedi' a domenica

  return {
    aggiornato: new Date().toISOString(), dal, al, stampe: S.file.length, auto: Object.keys(S.auto).length, vendute: dentro.length,
    ggMediana: mediana(dentro.map(v => v.gg)), entro30: Math.round(dentro.filter(v => v.gg <= 30).length / (dentro.length || 1) * 100),
    mesi: serie, stagione, perGiorno,
    perAnno: gruppo(dentro, v => v.d.slice(0, 4)).sort((a, b) => (a.k < b.k ? -1 : 1)),
    perModello: gruppo(dentro, v => v.k, 40).sort((a, b) => b.n - a.n).slice(0, 18),
    perMarca: gruppo(dentro, v => v.b, 25).sort((a, b) => b.n - a.n).slice(0, 10),
    perFuel: gruppo(dentro, v => v.fu, 15).sort((a, b) => b.n - a.n),
    perCambio: gruppo(dentro, v => (v.ca === 'n.d.' ? null : v.ca)).sort((a, b) => b.n - a.n),
    perPrezzo: FASCE_P.map(f => gruppo(dentro.filter(v => v.prezzo > 0), v => fascia(FASCE_P, v.prezzo)).find(x => x.k === f[2])).filter(Boolean),
    velocita: FASCE_G.map(f => ({ k: f[2], n: dentro.filter(v => v.gg >= f[0] && v.gg <= f[1]).length })),
    perRibassi: ['nessun ribasso', '1 ribasso', '2 ribassi', '3 o più'].map((k, i) => { const l = conStoria.filter(v => (i < 3 ? v.cali === i : v.cali >= 3)); return { k, n: l.length, gg: mediana(l.map(v => v.gg)), calo: i ? r1(media(l.map(v => v.calo))) : 0 }; }),
    ribassiSu: conStoria.length
  };
}

module.exports = { conti };
