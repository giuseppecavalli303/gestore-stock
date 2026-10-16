// Scarica gli annunci di usato e km0 pubblicati su valentinoautomobili.it e li salva in data/annunci.json.
// Servono per foto, link all'annuncio e dati che la stampa PDF non riporta (cambio, porte, posti...).
// Uso: node agente/annunci.js
const fs = require('fs'), path = require('path');

const SITO = 'https://www.valentinoautomobili.it';
const ELENCO = SITO + '/auto/usate/?type=KM0%7CUSED';
const DATI = SITO + '/wp-json/wsr/v1/stock/listing/stock-listing-widget-1/update?type=KM0%7CUSED&page=';
const PAUSA_MS = 700;                        // tra una pagina e l'altra, per non pesare sul sito

const pausa = ms => new Promise(r => setTimeout(r, ms));

async function pagina(n) {
  for (let tentativo = 1; tentativo <= 3; tentativo++) {
    try {
      const r = await fetch(DATI + n, { headers: { 'User-Agent': 'Mozilla/5.0 (Gestore stock Valentino)', Referer: ELENCO, Accept: 'application/json' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if (!j.original || !Array.isArray(j.original.vehicles)) throw new Error('risposta senza veicoli');
      return j.original;
    } catch (e) {
      if (tentativo === 3) throw new Error(`pagina ${n}: ${e.message}`);
      await pausa(2000 * tentativo);
    }
  }
}

function annuncio(v) {
  const e = v.emissionConsumption || {};
  const get = k => (v[k] != null && v[k] !== '' ? v[k] : e[k]);
  const foto = (get('imageList') || []).map(i => i.image800 || i.image400).filter(Boolean);
  const tipo = get('type') === 'KM0' ? 'KM0' : 'USED';
  const url = `${SITO}/auto/${tipo === 'KM0' ? 'km0' : 'usate'}/${get('dealerCountyUrlCode') || 'roma'}/${get('makeUrlCode')}/${get('modelUrlCode')}/${get('fuelTypeUrlCode')}/${get('nameUrlCode')}/${get('vehicleId')}/`;
  const reg = get('registrationDate') ? String(get('registrationDate')).slice(0, 7) : '';
  return {
    id: String(get('vehicleId')), tipo, targa: String(get('numberPlate') || '').toUpperCase().replace(/\s+/g, ''),
    km: +get('km') || 0, imm: reg, marca: get('make') || '', modello: get('model') || '', versione: get('trim') || get('name') || '',
    prezzo: +get('price') || 0, cambio: get('gearType') || '', marce: +get('gearNumber') || 0, alim: get('fuelType') || '',
    cv: +get('hp') > 0 ? +get('hp') : 0, kw: +get('kw') > 0 ? +get('kw') : 0, carrozzeria: get('bodyType') || '',
    porte: +get('doors') > 0 ? +get('doors') : 0, posti: +get('seats') > 0 ? +get('seats') : 0, trazione: get('tractionType') || '',
    colore: [get('colorExt'), get('colorType')].filter(Boolean).join(' '), interni: [get('colorInt'), get('tapestry')].filter(Boolean).join(' '),
    neopatentati: !!get('novice'), garanzia: +get('warrantyMonth') > 0 ? +get('warrantyMonth') : 0, certificato: get('seal_name') || '',
    giro360: get('image360LinkClosedDoors') || '', video: get('video') || '', url, foto: foto.slice(0, 20)
  };
}

async function scarica() {
  const prima = await pagina(1);
  const perPagina = prima.resultsPerPage || prima.vehicles.length || 15;
  const pagine = Math.ceil((prima.totalResults || 0) / perPagina);
  const tutti = prima.vehicles.map(annuncio);
  for (let n = 2; n <= pagine; n++) {
    await pausa(PAUSA_MS);
    (await pagina(n)).vehicles.forEach(v => tutti.push(annuncio(v)));
  }
  const visti = new Set();
  const unici = tutti.filter(a => !visti.has(a.id) && visti.add(a.id));
  await galleriaCompleta(unici);
  return { aggiornato: new Date().toISOString(), dichiarati: prima.totalResults, annunci: unici };
}

/* L'elenco del sito da' solo le prime 3 foto: la galleria completa (interni compresi) e' nella pagina dell'annuncio.
   La leggo una volta per auto e la ricordo in agente/foto-cache.json, rinfrescandola ogni 7 giorni. */
const CACHE = path.join(__dirname, 'foto-cache.json');
const SETTE_GIORNI = 7 * 864e5;
function fotoDaPagina(html) {
  const i = html.indexOf('"imageList":[');
  if (i < 0) return [];
  let j = i + 12, prof = 0;
  for (; j < html.length; j++) { const ch = html[j]; if (ch === '[') prof++; else if (ch === ']' && --prof === 0) break; }
  const pezzo = html.slice(i + 12, j + 1);
  const out = [];
  for (const m of pezzo.matchAll(/images\\?\/800\\?\/(\d+)\\?\/([A-Za-z0-9_-]+\.(?:jpe?g|png|webp))/g)) { const u = `https://cdn.dealerk.it/dealer/datafiles/vehicle/images/800/${m[1]}/${m[2]}`; if (!out.includes(u)) out.push(u); }
  return out;
}
// telecamera: se l'elenco dotazioni del sito la nomina, conservo la frase; la conferma arriva poi dalle foto (agente/telecamera.js)
const RE_CAM = /telecamer|retrocamer|rear ?view/i;
function elenco(html, chiave) {
  const i = html.indexOf(`"${chiave}":[`);
  if (i < 0) return [];
  let j = i + chiave.length + 3, prof = 0;
  for (; j < html.length; j++) { const ch = html[j]; if (ch === '[') prof++; else if (ch === ']' && --prof === 0) break; }
  try { return JSON.parse(html.slice(i + chiave.length + 3, j + 1)).map(x => (typeof x === 'string' ? x : JSON.stringify(x))); } catch (e) { return []; }
}
function telecameraDaPagina(html) {
  const righe = elenco(html, 'equipmentStandardList').concat(elenco(html, 'equipmentList'), elenco(html, 'equipmentOptionalList'));
  return righe.filter(x => RE_CAM.test(x)).map(x => x.replace(/&amp;/g, '&')).join(' · ');
}
async function galleriaCompleta(annunci) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) {}
  let lette = 0, errori = 0;
  for (const a of annunci) {
    const c = cache[a.id];
    if (c && c.cam != null && Date.now() - c.t < SETTE_GIORNI) { if (c.foto.length > a.foto.length) a.foto = c.foto; a.camLista = c.cam; continue; }
    try {
      await pausa(400);
      const r = await fetch(a.url, { headers: { 'User-Agent': 'Mozilla/5.0 (Gestore stock Valentino)' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const html = await r.text(), foto = fotoDaPagina(html), cam = telecameraDaPagina(html);
      cache[a.id] = { t: Date.now(), foto, cam };
      if (foto.length > a.foto.length) a.foto = foto;
      a.camLista = cam;
      lette++;
      if (lette % 50 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));   // salvo strada facendo
    } catch (e) { errori++; }
  }
  const attivi = new Set(annunci.map(a => a.id));
  for (const k of Object.keys(cache)) if (!attivi.has(k)) delete cache[k];   // via le auto non piu' pubblicate
  fs.writeFileSync(CACHE, JSON.stringify(cache));
  if (lette || errori) console.log(`Gallerie lette: ${lette}${errori ? `, non lette: ${errori}` : ''}.`);
}

module.exports = { scarica };

if (require.main === module) {
  scarica().then(d => {
    const file = path.join(__dirname, '..', 'data', 'annunci.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (d.annunci.length < d.dichiarati * 0.9) { console.error(`Annunci incompleti: ${d.annunci.length} su ${d.dichiarati}. Tengo quelli di prima.`); process.exit(2); }
    fs.writeFileSync(file, JSON.stringify(d));
    console.log(`Annunci dal sito: ${d.annunci.length} su ${d.dichiarati}.`);
  }).catch(e => { console.error('Annunci non scaricati: ' + e.message); process.exit(1); });
}
