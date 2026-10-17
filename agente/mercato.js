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

module.exports = { scarica };

if (require.main === module) {
  scarica().then(r => {
    fs.writeFileSync(path.join(__dirname, 'autoscout.json'), JSON.stringify(r));
    const g = {};
    r.annunci.forEach(a => { g[a.giudizio || 'senza'] = (g[a.giudizio || 'senza'] || 0) + 1; });
    console.log(`AutoScout: ${r.annunci.length} annunci su ${r.totale}. Giudizi: ${Object.entries(g).map(([k, v]) => k + ' ' + v).join(', ')}.`);
  }).catch(e => { console.error(e.message); process.exit(1); });
}
