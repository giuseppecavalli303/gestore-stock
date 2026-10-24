// Legge gli annunci di Valentino su AutoScout24 con il giudizio di AutoScout sul prezzo e la fascia di contatti ricevuti.
// Servono al rapporto per Giuseppe (prezzo contro il mercato, interesse dei clienti). Resta in locale: agente/autoscout.json.
// Uso: node agente/mercato.js
const fs = require('fs'), path = require('path');

const CLIENTE = '17888770';                  // codice del concessionario su AutoScout24
const ELENCO = (desc, n) => `https://www.autoscout24.it/lst?atype=C&custtype=D&cid=${CLIENTE}&sort=price&desc=${desc}&page=${n}`;
const PAUSA_MS = 900;
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36', 'Accept-Language': 'it-IT' };
const pausa = ms => new Promise(r => setTimeout(r, ms));

async function pagina(desc, n) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const r = await fetch(ELENCO(desc, n), { headers: H });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const m = (await r.text()).match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!m) throw new Error('pagina senza dati');
      return JSON.parse(m[1]).props.pageProps;
    } catch (e) {
      if (tentativo === 3) throw new Error(`AutoScout pagina ${n}: ${e.message}`);
      await pausa(2500 * tentativo);
    }
  }
}

function annuncio(l) {
  const v = l.vehicle || {}, t = l.tracking || {};
  const [mm, aa] = String(t.firstRegistration || '').split('-');
  return {
    id: l.id, url: 'https://www.autoscout24.it' + l.url, marca: v.make || '', modello: v.model || '', versione: v.modelVersionInput || '',
    km: Number(t.mileage) || (v.mileageInKm && v.mileageInKm.raw) || 0, imm: aa && mm ? `${aa}-${mm}` : '',
    prezzo: (l.price && l.price.priceRaw) || Number(t.price) || 0,
    giudizio: t.priceLabel || '', contatti: (l.statistics && l.statistics.leadsRange) || ''
  };
}

// AutoScout mostra al massimo 20 pagine per ricerca: leggo l'elenco dal piu' economico e poi dal piu' caro
async function scarica() {
  const perId = new Map();
  let totale = 0;
  for (const desc of [0, 1]) {
    for (let n = 1; n <= 20; n++) {
      const p = await pagina(desc, n);
      totale = p.numberOfResults || totale;
      const l = p.listings || [];
      if (!l.length) break;
      l.forEach(x => perId.set(x.id, annuncio(x)));
      if (perId.size >= totale) break;
      await pausa(PAUSA_MS);
    }
    if (perId.size >= totale) break;
  }
  return { aggiornato: new Date().toISOString(), totale, annunci: [...perId.values()] };
}

// annuncio AutoScout di ogni auto dello stock: AutoScout non mostra la targa, quindi marca + km + immatricolazione
// (anche quelli dell'annuncio sul sito); se restano piu' annunci, il prezzo; se restano dubbi, nessun abbinamento
const m4 = s => String(s || '').normalize('NFD').replace(/[^a-z]/gi, '').toLowerCase().slice(0, 4);
function abbinaAutoscout(cs, annunci, as) {
  const per = new Map();
  if (!as || !as.annunci) return per;
  const sito = new Map((annunci || []).map(a => [a.url, a]));
  const k = new Map();
  as.annunci.forEach(a => { const key = m4(a.marca) + '|' + a.km + '|' + a.imm; k.set(key, (k.get(key) || []).concat(a)); });
  for (const c of cs) {
    if (!(c.web || c.as)) continue;
    const s = (c.web && sito.get(c.web.url)) || {};
    let l = k.get(m4(c.brand) + '|' + c.km + '|' + c.imm) || [];
    if (l.length !== 1) { const l2 = k.get(m4(c.brand) + '|' + s.km + '|' + s.imm) || []; if (l2.length) l = l2; }
    if (l.length > 1) { const p = l.filter(a => a.prezzo === c.prezzo || a.prezzo === c.prezzoV); if (p.length) l = p; }
    if (l.length > 1) { const p = l.filter(a => m4(a.modello) === m4(c.family)); if (p.length) l = p; }
    if (l.length === 1) per.set(c.targa, l[0]);   // se il dubbio resta, nessun abbinamento (il link porterebbe all'annuncio sbagliato)
  }
  return per;
}

// per l'app: solo il giudizio sul prezzo e il link all'annuncio (i contatti restano sul PC)
function pubblicaGiudizi(as) {
  const root = path.join(__dirname, '..'), leggi = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
  const stock = leggi(path.join(root, 'data', 'stock.json')), sito = leggi(path.join(root, 'data', 'annunci.json')) || {};
  if (!stock) return 0;
  const per = abbinaAutoscout(stock.cars, sito.annunci, as), auto = {};
  per.forEach((a, t) => { auto[t] = { g: a.giudizio, u: a.url }; });
  const dest = path.join(root, 'data', 'mercato.json'), prima = leggi(dest) || {};
  if (JSON.stringify(prima.auto) !== JSON.stringify(auto)) fs.writeFileSync(dest, JSON.stringify({ aggiornato: as.aggiornato, auto }));
  return per.size;
}

module.exports = { scarica, abbinaAutoscout, pubblicaGiudizi };

if (require.main === module) {
  scarica().then(r => {
    fs.writeFileSync(path.join(__dirname, 'autoscout.json'), JSON.stringify(r));
    const n = pubblicaGiudizi(r);
    const g = {};
    r.annunci.forEach(a => { g[a.giudizio || 'senza'] = (g[a.giudizio || 'senza'] || 0) + 1; });
    console.log(`AutoScout: ${r.annunci.length} annunci su ${r.totale}, ${n} abbinati alle auto. Giudizi: ${Object.entries(g).map(([k, v]) => k + ' ' + v).join(', ')}.`);
  }).catch(e => { console.error(e.message); process.exit(1); });
}
