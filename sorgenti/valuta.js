/* ---------- valutatore permute: valore di mercato dalle auto simili e quanto offrire al cliente ---------- */
// Le regole sono scritte anche nelle note, una riga ciascuna, cosi' il venditore vede da dove viene il numero.
const VAL_MIN_SIMILI = 5;
const VAL_SCARTO = /incidentat|sinistrat|export|non marciant|motore rotto|ricambi/i;
const valNorm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
// il punto delle migliaia anche sui numeri di 4 cifre (toLocaleString italiano scrive 4400)
const valEuro = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';

// carburante scritto dai portali o a mano ("gpl", "Benzina/Gpl", "Gasolio") -> una parola sola
function valAlim(s) {
  s = String(s || '').toLowerCase();
  if (/gpl/.test(s)) return 'GPL';
  if (/metano/.test(s)) return 'Metano';
  if (/ibrid|hybrid|elettrica\/|\/elettrica/.test(s)) return 'Ibrida';
  if (/elettr/.test(s)) return 'Elettrica';
  if (/diesel|gasolio/.test(s)) return 'Diesel';
  if (/benzina/.test(s)) return 'Benzina';
  return '';
}

function margine(prezzo, fasce) {
  const f = (fasce || []).find(x => x.fino == null || prezzo <= x.fino);
  if (!f) return 0;
  return f.perc != null ? Math.round(prezzo * f.perc / 100 / 50) * 50 : (f.euro || 0);
}

// annunci compatibili con l'auto da valutare, con il loro peso (piu' simile = pesa di piu')
function simili(auto, annunci) {
  const marca = valNorm(auto.marca), modello = valNorm(auto.modello), alim = valAlim(auto.alimentazione);
  const vers = valNorm(auto.versione);
  // la stessa auto pubblicata su piu' portali (stesso anno, stessi km, stesso prezzo) conta una volta sola
  const viste = new Set(), ordine = { autoscout: 0, automobile: 1, subito: 2 };
  const uniche = (annunci || []).slice().sort((a, b) => (ordine[a && a.portale] || 0) - (ordine[b && b.portale] || 0)).filter(a => {
    if (!a) return false;
    const k = [a.anno, Math.round((a.km || 0) / 1000), a.prezzo].join('|');
    if (viste.has(k)) return false;
    viste.add(k);
    return true;
  });
  return uniche.filter(a => {
    if (!a || !(a.prezzo >= 500)) return false;
    if (VAL_SCARTO.test((a.titolo || '') + ' ' + (a.versione || ''))) return false;
    if (valNorm(a.marca) !== marca || valNorm(a.modello) !== modello) return false;
    if (alim && valAlim(a.alimentazione) !== alim) return false;
    if (auto.anno && !(Math.abs((a.anno || 0) - auto.anno) <= 1)) return false;
    return true;
  }).map(a => {
    let peso = auto.anno ? Math.pow(0.5, Math.abs(a.anno - auto.anno)) : 1;
    if (auto.km && a.km) peso *= Math.pow(0.5, Math.abs(a.km - auto.km) / 30000);
    if (vers && valNorm((a.titolo || '') + ' ' + (a.versione || '')).includes(vers)) peso *= 1.5;
    return Object.assign({}, a, { peso });
  });
}

// prezzo dell'annuncio riportato ai km dell'auto da valutare: 3% ogni 10.000 km, al massimo +-20%
function valCorretto(a, km) {
  if (!km || !a.km) return a.prezzo;
  const f = Math.max(-0.2, Math.min(0.2, 0.03 * (a.km - km) / 10000));
  return a.prezzo * (1 + f);
}

function valMediana(xs) {
  const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function valMedianaPesata(xs) {
  const s = xs.slice().sort((a, b) => a.p - b.p), tot = s.reduce((t, x) => t + x.w, 0);
  let acc = 0;
  for (const x of s) { acc += x.w; if (acc >= tot / 2) return x.p; }
  return s.length ? s[s.length - 1].p : 0;
}

/* ---------- dati pubblicati dall'agente del PC: le nostre vendite (cifrate) e il mercato letto di notte ---------- */
const valMarca = s => valNorm(s).replace(/^vw$/, 'volkswagen').replace(/^mercedes$/, 'mercedesbenz');
const valChiave = auto => [valMarca(auto.marca), valNorm(auto.modello), valAlim(auto.alimentazione)].join('|');
const valAnni = (da, a) => (Date.parse(a + '-15') - Date.parse(da + '-15')) / (365.25 * 864e5);

// Le nostre vendite simili (agente/valutatore-dati.js): righe [marca, modello, alimentazione, imm, km, prezzo, primo, giorni,
// pren, versione]. Stessa marca, modello e carburante, eta' alla vendita entro 1 anno e mezzo da quella di oggi.
// Ogni prezzo e' riportato all'auto da valutare: circa 5% per ogni anno di eta' (come nei prezzi consigliati, al massimo
// +-10%) e 3% ogni 10.000 km (come per gli annunci, al massimo +-20%).
function nostreVendite(auto, vendite, oggi) {
  if (!auto || !auto.anno || !Array.isArray(vendite)) return { n: 0, simili: [] };
  const marca = valMarca(auto.marca), modello = valNorm(auto.modello), alim = valAlim(auto.alimentazione);
  const etaOggi = valAnni(auto.anno + '-07', String(oggi || new Date().toISOString()).slice(0, 7));
  const el = vendite.filter(v => v && valMarca(v[0]) === marca && valNorm(v[1]) === modello && (!alim || valAlim(v[2] === 'Plug-in' ? 'Ibrida' : v[2]) === alim))
    .map(v => {
      const eta = valAnni(v[3], v[8]), d = eta - etaOggi;
      const fEta = Math.max(-0.1, Math.min(0.1, 0.05 * d));
      const fKm = auto.km && v[4] ? Math.max(-0.2, Math.min(0.2, 0.03 * (v[4] - auto.km) / 10000)) : 0;
      let peso = Math.pow(0.5, Math.abs(d));
      if (auto.km && v[4]) peso *= Math.pow(0.5, Math.abs(v[4] - auto.km) / 30000);
      return { anno: +String(v[3]).slice(0, 4), km: v[4], prezzo: v[5], primo: v[6], giorni: v[7], pren: v[8], versione: v[9], d, pc: v[5] * (1 + fEta) * (1 + fKm), peso };
    }).filter(v => Math.abs(v.d) <= 1.5);
  if (!el.length) return { n: 0, simili: [] };
  const gg = el.map(v => v.giorni).filter(g => g != null);
  return { n: el.length, prezzo: valMedianaPesata(el.map(v => ({ p: v.pc, w: v.peso }))), giorni: gg.length ? Math.round(valMediana(gg)) : null, simili: el };
}

// Mercato letto di notte (agente/valutatore-mercato.js) per l'anno dell'auto e i due vicini: gli annunci di Subito (che il
// servizio Google non vede) nella stessa forma degli altri, quante auto sono in vendita su AutoScout e come va il prezzo.
function mercatoNotte(auto, mercato) {
  const m = mercato && mercato.modelli && auto && auto.anno ? mercato.modelli[valChiave(auto)] : null;
  if (!m) return null;
  const anni = [auto.anno - 1, auto.anno, auto.anno + 1].filter(a => m[a]);
  if (!anni.length) return null;
  const annunci = [];
  anni.forEach(a => (m[a].su || []).forEach((x, i) => annunci.push({
    portale: 'subito', id: `sun:${a}:${i}`, url: '', titolo: `${auto.marca} ${x[1] || x[0]}`, marca: auto.marca, modello: x[0], versione: x[1],
    alimentazione: auto.alimentazione, anno: x[2], km: x[3], prezzo: x[4], venditore: x[5] ? 'concessionario' : 'privato', citta: '', giorni: x[6], notte: m[a].suGiorno
  })));
  // prezzo mediano dell'anno dell'auto (o del piu' vicino) oggi e un mese fa: ultimi 7 giorni contro 28-42 giorni fa
  const s = (m[auto.anno] || m[anni[0]]).storia || [];
  let andamento = null;
  if (s.length) {
    const ult = s[s.length - 1][0], giorni = d => (Date.parse(ult) - Date.parse(d)) / 864e5;
    const ora = s.filter(x => giorni(x[0]) <= 7).map(x => x[1]), prima = s.filter(x => giorni(x[0]) >= 28 && giorni(x[0]) <= 42).map(x => x[1]);
    if (ora.length && prima.length) andamento = valMediana(ora) / valMediana(prima) - 1;
  }
  const tot = anni.reduce((t, a) => t + (m[a].totAS || 0), 0);
  return { annunci, totAS: tot || null, andamento, giorno: mercato.giorno };
}

function valuta(auto, annunci, cfg, ripristino, extra) {
  if (!auto.anno) return { ok: false, n: 0, motivo: "Manca l'anno di immatricolazione: senza non do un valore (toccalo in \"Ho capito così\")" };
  extra = extra || {};
  const el = simili(auto, annunci).map(a => Object.assign(a, { pc: valCorretto(a, auto.km) }));
  const med = el.length ? valMediana(el.map(a => a.pc)) : 0;
  const buoni = el.filter(a => a.pc >= med * 0.5 && a.pc <= med * 1.6);
  const n = buoni.length;
  if (n < VAL_MIN_SIMILI) return { ok: false, n, motivo: `Troppo poche auto simili (${n}): non do un valore` };
  const perPortale = { autoscout: 0, subito: 0, automobile: 0 };
  buoni.forEach(a => { perPortale[a.portale] = (perPortale[a.portale] || 0) + 1; });
  const cento = x => Math.round(x / 100) * 100, cinquanta = x => Math.floor(x / 50) * 50;
  const mercato = cento(valMedianaPesata(buoni.map(a => ({ p: a.pc, w: a.peso }))));
  const conc = buoni.filter(a => a.venditore === 'concessionario');
  // rivendita: dalle nostre vendite simili se sono almeno 3 (prezzo vero alla prenotazione), altrimenti dagli annunci dei
  // concessionari, e se anche quelli sono pochi dal mercato +8%
  const nostre = nostreVendite(auto, extra.vendite, extra.oggi);
  const daNostre = nostre.n >= 3;
  const rivenditaStimata = !daNostre && conc.length < 3;
  const rivendita = daNostre ? cento(nostre.prezzo) : rivenditaStimata ? cento(mercato * 1.08) : cento(valMedianaPesata(conc.map(a => ({ p: a.pc, w: a.peso }))));
  const rip = ripristino == null || ripristino === '' || isNaN(ripristino) ? cfg.ripristino : Number(ripristino);
  const mN = margine(rivendita, cfg.nostro), mC = margine(mercato, cfg.commerciante);
  const teniamo = { offerta: cinquanta(rivendita - rip - cfg.passaggio - mN), margine: mN };
  const commerciante = { offerta: cinquanta(mercato - rip - cfg.passaggio - mC), margine: mC };
  const conviene = teniamo.offerta >= commerciante.offerta ? 'teniamo' : 'commerciante';
  const qualita = n >= 15 ? 'buono' : n >= 8 ? 'discreto' : 'indicativo';
  const scarto = Math.abs(teniamo.offerta - commerciante.offerta);
  const note = [
    (auto.km ? `Valore di mercato: mediana delle ${n} auto simili, corrette per i km (3% ogni 10.000 km).` : `Valore di mercato: mediana delle ${n} auto simili.`) +
      ` Confronto ${qualita}${qualita === 'indicativo' ? ': poche auto, prendi il numero come orientamento' : ''}. Sono prezzi chiesti negli annunci, non prezzi di vendita.`,
    `Se la teniamo noi: offri fino a ${valEuro(teniamo.offerta)}. La rivendete a ${valEuro(rivendita)}, meno ripristino ${valEuro(rip)}, passaggio e vostro margine ${valEuro(mN)}.`,
    `Se la diamo al commerciante: offri fino a ${valEuro(commerciante.offerta)}. Lui la rivende al valore di mercato, ${valEuro(mercato)}, meno ripristino ${valEuro(rip)}, passaggio e il suo margine ${valEuro(mC)}.`,
    scarto ? (conviene === 'teniamo' ? `Conviene tenerla: puoi offrire ${valEuro(scarto)} in più al cliente.` : `Conviene darla al commerciante: puoi offrire ${valEuro(scarto)} in più al cliente.`) : 'Le due strade si equivalgono.'
  ];
  if (rivenditaStimata) note.splice(2, 0, 'Pochi annunci di concessionari: rivendita stimata dal mercato +8%.');
  if (daNostre) note.splice(2, 0, `Rivendita dalle nostre ${nostre.n} vendite simili degli ultimi 2 anni: prezzo alla prenotazione, adeguato ad anno e km.${nostre.giorni != null ? ` Prenotate in media ${nostre.giorni} giorni dopo il primo prezzo.` : ''}`);
  else if (nostre.n) note.splice(2, 0, `Solo ${nostre.n === 1 ? '1 vendita simile' : nostre.n + ' vendite simili'} da noi negli ultimi 2 anni: troppo poche per la rivendita, uso gli annunci.`);
  if (!auto.km) note.splice(1, 0, 'Mancano i km: il valore non tiene conto dei chilometri, è meno preciso. Aggiungili in "Ho capito così".');
  if (!valAlim(auto.alimentazione)) note.splice(1, 0, 'Manca il carburante: sto mescolando benzina, diesel, GPL e gli altri. Aggiungilo in "Ho capito così".');
  return { ok: true, n, qualita, perPortale, simili: buoni, mercato, rivendita, rivenditaStimata, daNostre, nostre, ripristino: rip, teniamo, commerciante, conviene, scarto, note };
}
