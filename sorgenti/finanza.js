/* ---------- finanziamento: le stesse formule del simulatore di Giuseppe (Documents\simulatore vw) ----------
   Tassi e spese vanno aggiornati qui e nel simulatore. Le provvigioni non ci sono: il sito e' pubblico. */
const FIN = {
  speseIstruttoria: 380,
  speseIncasso: 3.40,
  bolloPercent: 0.25,                 // imposta sostitutiva % sul finanziato
  kmAnnui: 15000,
  // manutenzione finanziata (PVV e Multimake), in euro al mese: nel simulatore e' gia' spuntata con 1 tagliando
  manutenzione: { tagliando1: 5, tagliando2: 13, plugin: 13 },
  // servizi assicurativi: furto e incendio e GAP sono finanziati (fanno interessi), Alter Ego e Personal Safe ripartiti sulla rata
  servizi: { furtoPerMille: { first_trip: 11, business_tour: 18 }, gap: 19, alterEgo: 18, personalSafe: 16 },
  vfg: { min: 30, max: 70, iniziale: 45 },   // % del prezzo da nuovo (o del prezzo di vendita se il listino manca)
  pvv: { nome: 'PVV', titolo: 'Progetto Valore Volkswagen', tan: 8.99, codice: 'FMS BD 70', maxAnticipo: 35, durate: [24, 36, 48] },
  multimake: { nome: 'Multimake', titolo: 'Finanziamento Multimake', maxAnticipo: 30, durate: [24, 36, 48],
    tassi: [{ tan: 11.49, nome: 'Standard', codice: 'MMPCP24 | BD 90' }, { tan: 9.99, nome: 'VTI / Tedesche', codice: 'MMPCP25 | BD 90' }] },
  classico: { nome: 'Classico', titolo: 'Credito Classico', tan: 10.99, codice: 'FU1 BD 100', maxAnticipo: 100, durataMin: 24, durataMax: 72 },
  portale: 'https://vwbank.it.vwfs.io/FSSuiteWeb/home.jsp'
};

function finIRR(flussi) {
  let r = 0.01;
  for (let i = 0; i < 1000; i++) {
    let npv = 0, der = 0;
    for (let t = 0; t < flussi.length; t++) { npv += flussi[t] / Math.pow(1 + r, t); if (t) der -= t * flussi[t] / Math.pow(1 + r, t + 1); }
    if (Math.abs(der) < 1e-7) break;
    const n = r - npv / der;
    if (Math.abs(n - r) < 1e-7) return n;
    r = n;
  }
  return r;
}

// o = { tipo: 'pvv'|'multimake'|'classico', prezzo, anticipo, durata, tan, vfg (in euro, solo pvv/multimake),
//      servizi (euro finanziati: manutenzione, furto e incendio, GAP), ripartiti (euro spalmati sulle rate: Alter Ego, Personal Safe) }
function finCalcola(o) {
  const r2 = v => Math.round(v * 100) / 100;
  const prezzo = +o.prezzo, anticipo = +o.anticipo || 0, durata = +o.durata, tan = +o.tan;
  const P = FIN[o.tipo], palla = o.tipo !== 'classico';
  if (!(prezzo > 0)) return { errore: 'Prezzo di vendita non inserito.' };
  if (anticipo < 0) return { errore: "L'anticipo non può essere negativo." };
  if (anticipo >= prezzo) return { errore: "L'anticipo deve essere inferiore al prezzo." };
  if (palla && anticipo > prezzo * P.maxAnticipo / 100 + 0.005) return { errore: `Con ${P.nome} l'anticipo massimo è il ${P.maxAnticipo}% del prezzo.` };
  const servizi = r2(+o.servizi || 0), ripartiti = r2(+o.ripartiti || 0);
  const finanziato = r2(prezzo - anticipo + FIN.speseIstruttoria + servizi);
  const bollo = r2(finanziato * FIN.bolloPercent / 100);
  const im = tan / 100 / 12;
  let rata, nRate, vfg = 0;
  if (palla) {
    vfg = r2(+o.vfg || 0);
    nRate = durata - 1;                                   // rate normali N-1, poi la maxirata
    const capitale = finanziato - vfg / Math.pow(1 + im, durata);
    if (capitale <= 0) return { errore: 'Anticipo e valore futuro sono troppo alti rispetto al prezzo: riduci uno dei due.' };
    rata = r2(capitale * (im * Math.pow(1 + im, nRate)) / (Math.pow(1 + im, nRate) - 1));
  } else {
    nRate = durata;
    rata = r2(finanziato * (im * Math.pow(1 + im, nRate)) / (Math.pow(1 + im, nRate) - 1));
  }
  const rataServizi = r2(ripartiti / nRate);               // servizi ripartiti: si aggiungono alla rata senza interessi
  rata = r2(rata + rataServizi);
  // TAEG sugli importi che paga il cliente: l'istruttoria e' un costo, quindi non e' nell'erogato
  const flussi = [prezzo - anticipo + servizi + ripartiti];
  for (let i = 1; i <= durata; i++) {
    let out = FIN.speseIncasso;
    if (i <= nRate) out += rata;
    if (palla && i === durata) out += vfg;
    if (i === 1) out += bollo;
    flussi.push(-out);
  }
  const irr = finIRR(flussi), taeg = isFinite(irr) ? Math.pow(1 + irr, 12) - 1 : null;
  return { tipo: o.tipo, prezzo, anticipo, durata, tan, rata, nRate, vfg, servizi, ripartiti, rataServizi, finanziato, bollo, primaRata: r2(rata + bollo + FIN.speseIncasso), taeg, istruttoria: FIN.speseIstruttoria, incasso: FIN.speseIncasso };
}
