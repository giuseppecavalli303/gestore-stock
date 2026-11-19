// Mercato per il valutatore permute, letto una volta al giorno dal PC: data/valutatore-mercato.json.
// Per i modelli che entrano di piu' nello stock (ultimi 12 mesi, dalle stampe) legge AutoScout24 e Subito anno per anno:
//  - gli annunci di Subito, che dal servizio Google non si leggono (Subito lo blocca): il valutatore li aggiunge ai suoi;
//  - quante auto sono in vendita su AutoScout e il prezzo mediano del giorno, per vedere nel tempo se il prezzo sale o scende.
// Degli annunci si tengono solo i numeri (anno, km, prezzo, privato o concessionario, giorni online): niente nomi, citta', link.
// Con calma: una pagina alla volta, con una pausa, come farebbe una persona.
// Uso: node agente/valutatore-mercato.js [--max N]   (N = quanti modelli, 25 se non si dice: circa 8 minuti)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const P = new Function(fs.readFileSync(path.join(root, 'assistente', 'Valutatore.gs'), 'utf8') + '\nreturn { urlPortali, leggiAutoscout, leggiSubito, normAlim, valSlug, VAL_UA, NEXT_DATA };')();
const FILE = path.join(root, 'data', 'valutatore-mercato.json');
const PAUSA_MS = 1200, GIORNI_STORIA = 150;
const pausa = ms => new Promise(r => setTimeout(r, ms));
const med = a => { const b = a.slice().sort((x, y) => x - y), n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : 0; };

// nomi delle stampe -> nomi di AutoScout (indirizzi) e carburante come lo scrive il valutatore
const MARCA_AS = { mercedes: 'mercedes-benz' };
const alim = fu => fu === 'Plug-in' ? 'Ibrida' : P.normAlim(fu);
const slugMarca = marca => MARCA_AS[P.valSlug(marca)] || P.valSlug(marca);
// chiave senza trattini e punti, come la calcola il valutatore (valNorm in sorgenti/valuta.js): "T Roc" e "T-Roc" sono la stessa
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const chiave = (marca, modello, fu) => [norm(slugMarca(marca)), norm(modello), alim(fu)].join('|');

// quali modelli e quali anni: i piu' entrati negli ultimi 12 mesi. Per ognuno gli anni con almeno 2 auto entrate:
// i 3 piu' frequenti tra le auto con almeno 3 anni (quasi sempre permute) e i 2 piu' frequenti tra le piu' giovani
// (km0, aziendali), che altrimenti prenderebbero tutto il posto.
function daLeggere(L, oggi, max) {
  const da = new Date(Date.parse(oggi) - 365 * 864e5).toISOString().slice(0, 10), annoOggi = +oggi.slice(0, 4), g = {};
  for (const a of Object.values(L)) {
    const ingr = a.ingr || a.da, anno = Number(String(a.imm || '').slice(0, 4));
    if (!ingr || ingr < da || !anno || !alim(a.fu)) continue;
    const k = chiave(a.b, a.f, a.fu);
    (g[k] = g[k] || { marca: a.b, modello: a.f, alimentazione: alim(a.fu), n: 0, anni: {} }).n++;
    g[k].anni[anno] = (g[k].anni[anno] || 0) + 1;
  }
  const migliori = (anni, filtro, n) => Object.entries(anni).filter(([a, c]) => c >= 2 && filtro(+a)).sort((x, y) => y[1] - x[1]).slice(0, n).map(([a]) => +a);
  return Object.entries(g).sort((a, b) => b[1].n - a[1].n).slice(0, max).map(([k, x]) => ({
    k, marca: x.marca, modello: x.modello, alimentazione: x.alimentazione,
    anni: migliori(x.anni, a => a <= annoOggi - 3, 3).concat(migliori(x.anni, a => a > annoOggi - 3, 2)).sort()
  })).filter(x => x.anni.length);
}

// stessi indirizzi del valutatore, ma per un anno solo
function indirizzi(m, anno) {
  const u = P.urlPortali({ marca: m.marca, modello: m.modello, alimentazione: m.alimentazione, anno, slug: { marca: slugMarca(m.marca), modello: P.valSlug(m.modello) } });
  const as = new URL(u.autoscout), su = new URL(u.subito);
  as.searchParams.set('fregfrom', anno); as.searchParams.set('fregto', anno);
  su.searchParams.set('ys', anno); su.searchParams.set('ye', anno);
  return { autoscout: as.toString(), subito: su.toString() };
}

async function pagina(url) {
  for (let t = 1; t <= 2; t++) {
    try {
      const r = await fetch(url, { headers: P.VAL_UA });
      if (r.ok) return await r.text();
      if (r.status === 404) return '';
    } catch (e) { /* rete: riprovo una volta */ }
    await pausa(3000);
  }
  return null;
}

// annuncio di Subito ridotto ai numeri: [modello, versione, anno, km, prezzo, 1 = concessionario, giorni online]
const compatto = a => [a.modello, String(a.versione || '').slice(0, 30), a.anno, a.km, a.prezzo, a.venditore === 'concessionario' ? 1 : 0, a.giorni];

function aggiorna(prima, letture, oggi) {
  const out = { aggiornato: new Date().toISOString(), giorno: oggi, modelli: {} };
  const limite = new Date(Date.parse(oggi) - GIORNI_STORIA * 864e5).toISOString().slice(0, 10);
  for (const l of letture) {
    const vecchio = (((prima.modelli || {})[l.k] || {})[l.anno]) || {};
    const storia = (vecchio.storia || []).filter(x => x[0] >= limite && x[0] !== oggi);
    if (l.mediana) storia.push([oggi, l.mediana, l.n]);
    const m = out.modelli[l.k] = out.modelli[l.k] || {};
    // se Subito oggi non ha risposto tengo gli annunci dell'ultima lettura buona
    m[l.anno] = { su: l.subito ? l.subito.map(compatto) : (vecchio.su || []), suGiorno: l.subito ? oggi : (vecchio.suGiorno || null), totAS: l.totAS != null ? l.totAS : (vecchio.totAS || null), storia };
  }
  return out;
}

module.exports = { daLeggere, indirizzi, aggiorna, chiave };

if (require.main === module) (async () => {
  const leggi = f => JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, ''));
  const oggi = new Date().toISOString().slice(0, 10);
  const i = process.argv.indexOf('--max'), max = i > 0 ? +process.argv[i + 1] || 25 : 25;
  const L = leggi(path.join(__dirname, 'storico-lungo-cache.json')).auto;
  let prima = {}; try { prima = leggi(FILE); } catch (e) {}
  const lista = daLeggere(L, oggi, max), letture = [];
  let errori = 0, pagine = 0;
  for (const m of lista) for (const anno of m.anni) {
    const u = indirizzi(m, anno), l = { k: m.k, anno, subito: null, totAS: null, mediana: 0, n: 0 };
    const as = await pagina(u.autoscout); pagine++; await pausa(PAUSA_MS);
    const su = await pagina(u.subito); pagine++; await pausa(PAUSA_MS);
    const prezzi = [];
    if (as != null) {
      const j = P.NEXT_DATA(as), pp = j && j.props && j.props.pageProps;
      l.totAS = pp && typeof pp.numberOfResults === 'number' ? pp.numberOfResults : 0;
      P.leggiAutoscout(as).filter(a => a.anno === anno).forEach(a => prezzi.push(a.prezzo));
    } else errori++;
    if (su != null) {
      l.subito = P.leggiSubito(su, new Date()).filter(a => a.anno === anno && a.prezzo >= 500 && P.valSlug(a.modello) === P.valSlug(m.modello));
      l.subito.forEach(a => prezzi.push(a.prezzo));
    } else errori++;
    if (prezzi.length >= 5) { l.mediana = Math.round(med(prezzi) / 50) * 50; l.n = prezzi.length; }
    letture.push(l);
  }
  const d = aggiorna(prima, letture, oggi);
  fs.writeFileSync(FILE, JSON.stringify(d));
  const nSu = letture.reduce((t, l) => t + (l.subito ? l.subito.length : 0), 0);
  console.log(`Mercato del valutatore: ${lista.length} modelli, ${letture.length} anni, ${pagine} pagine lette (${errori} senza risposta), ${nSu} annunci Subito.`);
  if (letture.length && errori === pagine) process.exit(1);
})();
