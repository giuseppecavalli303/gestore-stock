/**
 * Valutatore permute - parte del servizio Google Apps Script (va accanto a Codice.gs).
 * Legge le auto simili su AutoScout24, Subito e Automobile.it. Le funzioni di lettura non usano
 * niente di Google, cosi' i controlli automatici del PC (npm test) le provano con Node.
 * Del venditore si tiene solo privato/concessionario e la citta': mai il nome.
 */

const VAL_FUEL_AS = { Benzina: 'B', Diesel: 'D', GPL: 'L', Metano: 'C', Elettrica: 'E', Ibrida: '2' };
const VAL_FUEL_PAROLA = { Benzina: 'benzina', Diesel: 'diesel', GPL: 'gpl', Metano: 'metano', Elettrica: 'elettrica', Ibrida: 'ibrida' };

function normAlim(s) {
  s = String(s || '').toLowerCase();
  if (/gpl/.test(s)) return 'GPL';
  if (/metano/.test(s)) return 'Metano';
  if (/ibrid|hybrid|elettrica\/|\/elettrica/.test(s)) return 'Ibrida';
  if (/elettr/.test(s)) return 'Elettrica';
  if (/diesel|gasolio/.test(s)) return 'Diesel';
  if (/benzina/.test(s)) return 'Benzina';
  return '';
}

const valSlug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const valNumero = s => Number(String(s == null ? '' : s).replace(/[^\d]/g, '')) || 0;

// fascia di km cercata sui portali: +-40% dei km dell'auto (null se i km non si sanno)
function finestraKm(auto) {
  return auto && auto.km ? { da: Math.max(0, Math.round(auto.km * 0.6 / 1000) * 1000), a: Math.round(auto.km * 1.4 / 1000) * 1000 } : null;
}

function urlPortali(auto) {
  const slug = auto.slug || {};
  const marca = slug.marca || valSlug(auto.marca), modello = slug.modello || valSlug(auto.modello);
  const anni = auto.anno ? [auto.anno - 1, auto.anno + 1] : null;
  const as = ['atype=C', 'cy=I', 'sort=standard'];
  if (anni) as.push('fregfrom=' + anni[0], 'fregto=' + anni[1]);
  const fk = finestraKm(auto);
  if (fk) as.push('kmfrom=' + fk.da, 'kmto=' + fk.a);
  if (VAL_FUEL_AS[auto.alimentazione]) as.push('fuel=' + VAL_FUEL_AS[auto.alimentazione]);
  const parole = [marca, modello, VAL_FUEL_PAROLA[auto.alimentazione] || ''].filter(Boolean).join(' ').replace(/-/g, ' ');
  const sub = ['q=' + parole.trim().replace(/\s+/g, '+')];
  if (anni) sub.push('ys=' + anni[0], 'ye=' + anni[1]);
  return {
    autoscout: 'https://www.autoscout24.it/lst/' + marca + '/' + modello + '?' + as.join('&'),
    subito: 'https://www.subito.it/annunci-italia/vendita/auto/?' + sub.join('&'),
    automobile: 'https://www.automobile.it/' + marca + '-' + modello + (VAL_FUEL_PAROLA[auto.alimentazione] ? '-' + VAL_FUEL_PAROLA[auto.alimentazione] : '')
  };
}

function NEXT_DATA(html) {
  const m = String(html || '').match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch (e) { return null; }
}

function leggiAutoscout(html) {
  const j = NEXT_DATA(html);
  const lista = (j && j.props && j.props.pageProps && j.props.pageProps.listings) || [];
  return lista.map(function (l) {
    const v = l.vehicle || {}, t = l.tracking || {}, reg = String(t.firstRegistration || '').split('-');
    return {
      portale: 'autoscout', id: 'as:' + l.id, url: 'https://www.autoscout24.it' + (l.url || ''),
      titolo: [v.make, v.model, v.modelVersionInput].filter(Boolean).join(' '),
      marca: v.make || '', modello: v.model || v.modelGroup || '', versione: v.modelVersionInput || '',
      alimentazione: normAlim(v.fuel || t.fuelType && ({ b: 'Benzina', d: 'Diesel', l: 'GPL', c: 'Metano', e: 'Elettrica' })[t.fuelType]),
      anno: Number(reg[1]) || 0, km: valNumero(t.mileage || v.mileageInKm),
      prezzo: (l.price && l.price.priceRaw) || valNumero(t.price),
      venditore: l.seller && l.seller.type === 'Dealer' ? 'concessionario' : 'privato',
      citta: String((l.location && l.location.city) || '').replace(/\s+-\s+[A-Z]{2}$/, ''),
      giorni: null, giudizio: t.priceLabel || ''
    };
  }).filter(function (a) { return a.prezzo > 0; });
}

function leggiSubito(html, oggi) {
  const j = NEXT_DATA(html), out = [];
  (function cerca(o) {
    if (!o || typeof o !== 'object') return;
    if (o.subject && o.features && o.urn) { out.push(o); return; }
    for (const k in o) cerca(o[k]);
  })(j);
  oggi = oggi || new Date();
  const val = function (it, k) { const f = it.features[k]; return f && f.values && f.values[0] ? f.values[0].value : ''; };
  return out.map(function (it) {
    const car = (it.features['/car'] && it.features['/car'].values) || [];
    const per = function (lab) { return car.filter(function (x) { return x.label === lab; })[0] || {}; };
    const mod = per('Modello');
    const quando = it.date ? new Date(String(it.date).replace(' ', 'T')) : null;
    return {
      portale: 'subito', id: 'su:' + it.urn, url: (it.urls && it.urls.default) || '',
      titolo: it.subject, marca: per('Marca').value || '', modello: mod.group_label || String(mod.value || '').replace(/\s+\d+.?\s*serie$/i, ''),
      versione: per('Versione').value || '', alimentazione: normAlim(val(it, '/fuel')),
      anno: Number(val(it, '/year')) || 0, km: valNumero(val(it, '/mileage_scalar')), prezzo: valNumero(val(it, '/price')),
      venditore: it.advertiser && it.advertiser.company ? 'concessionario' : 'privato',
      citta: (it.geo && it.geo.town && it.geo.town.value) || '',
      giorni: quando && !isNaN(quando) ? Math.max(0, Math.round((oggi - quando) / 864e5)) : null
    };
  }).filter(function (a) { return a.prezzo > 0; });
}

function leggiAutomobile(html, auto) {
  const j = NEXT_DATA(html);
  const r = j && j.props && j.props.pageProps && j.props.pageProps.apiResults && j.props.pageProps.apiResults.result;
  auto = auto || {};
  return ((r && r.resultList) || []).map(function (x) {
    const d = x.details || {}, reg = String(d.registration || '').toLowerCase().split(/\s+/);
    return {
      portale: 'automobile', id: 'am:' + x.id, url: 'https://www.automobile.it' + (x.url || ''),
      titolo: x.title || '', marca: auto.marca || '', modello: auto.modello || '', versione: x.title || '',
      alimentazione: normAlim(d.fuelEmissions), anno: Number(reg[reg.length - 1]) || 0,
      km: valNumero(d.formattedKm), prezzo: valNumero(x.formattedPrice),
      venditore: x.sellerType === 'DEALER' ? 'concessionario' : 'privato',
      citta: String(x.location || '').replace(/\s*\([A-Z]{2}\)$/, ''), giorni: null
    };
  }).filter(function (a) { return a.prezzo > 0; });
}

/* ---------- storico: le stesse ricerche nel tempo dicono quali auto sono sparite (di solito vendute) ---------- */

function chiaveRicerca(auto) {
  return [auto.marca, auto.modello, auto.alimentazione, auto.anno].map(valSlug).join('|');
}

// la pagina mostrava tutti i risultati? Se no, un annuncio assente puo' essere solo in seconda pagina
function completo(portale, html, n) {
  const j = NEXT_DATA(html);
  if (!j) return false;
  if (portale === 'autoscout') { const t = j.props && j.props.pageProps && j.props.pageProps.numberOfResults; return t != null && t <= n; }
  if (portale === 'automobile') { const r = j.props && j.props.pageProps && j.props.pageProps.apiResults && j.props.pageProps.apiResults.result; return !!r && !(r.pagination && r.pagination.next); }
  let tot = null;
  (function cerca(o) { if (tot != null || !o || typeof o !== 'object') return; if (typeof o.total === 'number') { tot = o.total; return; } for (const k in o) cerca(o[k]); })(j.props);
  return tot != null && tot <= n;
}

// vendute: viste almeno un giorno fa con la stessa ricerca, assenti oggi, su un portale che ha mostrato tutto,
// e con i km dentro la fascia cercata oggi (fuori fascia non comparirebbero comunque)
function venduti(prima, ora, oggi, completi, finestra) {
  const adesso = {};
  (ora || []).forEach(function (a) { adesso[a.id] = true; });
  return (prima || []).filter(function (a) {
    if (finestra && !(a.km >= finestra.da && a.km <= finestra.a)) return false;
    return completi[a.portale] && !adesso[a.id] && (oggi - new Date(a.ultimaVista)) >= 864e5;
  });
}

// la pagina ha ancora la forma che sappiamo leggere? (se no il portale va segnalato, non contato come 0)
function leggibile(portale, html) {
  const j = NEXT_DATA(html), pp = j && j.props && j.props.pageProps;
  if (!pp) return false;
  if (portale === 'autoscout') return Array.isArray(pp.listings);
  if (portale === 'automobile') return !!(pp.apiResults && pp.apiResults.result && Array.isArray(pp.apiResults.result.resultList));
  let trovato = false;
  (function cerca(o) { if (trovato || !o || typeof o !== 'object') return; if ((o.subject && o.features && o.urn) || typeof o.total === 'number') { trovato = true; return; } for (const k in o) cerca(o[k]); })(pp);
  return trovato;
}

// annuncio ricevuto dall'app (quindi da chiunque abbia il link): solo i campi noti, con i tipi giusti
const VAL_HOST = /^https:\/\/(www\.)?(autoscout24\.it|subito\.it|automobile\.it)\//;
function pulisciAnnuncio(a) {
  a = a || {};
  const s = function (x, n) { return String(x == null ? '' : x).slice(0, n); }, num = function (x) { return Number(x) || 0; };
  return {
    portale: ['autoscout', 'subito', 'automobile'].indexOf(a.portale) >= 0 ? a.portale : 'autoscout', id: s(a.id, 100),
    url: VAL_HOST.test(String(a.url || '')) ? s(a.url, 300) : '', titolo: s(a.titolo, 140), marca: s(a.marca, 40), modello: s(a.modello, 60), versione: s(a.versione, 100),
    alimentazione: normAlim(a.alimentazione), anno: num(a.anno), km: num(a.km), prezzo: num(a.prezzo),
    venditore: a.venditore === 'concessionario' ? 'concessionario' : 'privato', citta: s(a.citta, 50),
    giorni: a.giorni == null || isNaN(Number(a.giorni)) ? null : Number(a.giorni), ultimaVista: a.ultimaVista ? s(a.ultimaVista, 30) : undefined
  };
}

/* ---------- da qui in giu' gira solo su Google: Gemini, portali, Foglio "Valutazioni permute" ---------- */

const VAL_ISTRUZIONI = [
  "Ricevi la descrizione di un'auto usata scritta in fretta da un venditore italiano, per esempio 'clio gpl energy 120000 km del 2013'.",
  "Restituisci i dati dell'auto. Regole:",
  "- Non inventare: lascia vuoto (stringa vuota o 0) quello che la frase non dice. Non dedurre km o anno.",
  "- alimentazione: una tra Benzina, Diesel, GPL, Metano, Elettrica, Ibrida, oppure vuota.",
  "- marca e modello con il nome commerciale corretto (Renault, Clio); serie se la riconosci con sicurezza dall'anno (Clio IV), altrimenti vuota.",
  "- allestimento e motore solo se scritti (Energy, 0.9 TCe); cv solo se scritti o certi dal motore.",
  "- slugMarca e slugModello come negli indirizzi di AutoScout24 Italia (renault, clio; volkswagen, golf; mercedes-benz, classe-a)."
].join('\n');

const VAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    marca: { type: 'STRING' }, modello: { type: 'STRING' }, serie: { type: 'STRING' }, motore: { type: 'STRING' }, cv: { type: 'INTEGER' },
    alimentazione: { type: 'STRING' }, allestimento: { type: 'STRING' }, anno: { type: 'INTEGER' }, km: { type: 'INTEGER' }, cambio: { type: 'STRING' },
    slugMarca: { type: 'STRING' }, slugModello: { type: 'STRING' }
  },
  required: ['marca', 'modello', 'alimentazione', 'anno', 'km', 'slugMarca', 'slugModello']
};

const VAL_UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Accept-Language': 'it-IT,it;q=0.9' };

function valutatore_(req) {
  if (req.azione === 'valuta') return valValuta_(req);
  if (req.azione === 'salvaValutazione') return valSalva_(req);
  if (req.azione === 'ultime') return valUltime_();
  if (req.azione === 'apri') return valApri_(req);
  if (req.azione === 'margini') return valMargini_(req);
  return { errore: 'Azione sconosciuta.' };
}

function valInterpreta_(frase) {
  const p = PropertiesService.getScriptProperties();
  const chiave = String(p.getProperty('GEMINI_KEY') || '').trim().replace(/^["']+|["']+$/g, '');
  if (!chiave) return { errore: "Manca la chiave di Gemini nelle proprieta' dello script." };
  const modello = p.getProperty('MODELLO') || MODELLO_PREDEFINITO;
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modello) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': chiave }, muteHttpExceptions: true,
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: VAL_ISTRUZIONI }] },
      contents: [{ role: 'user', parts: [{ text: frase }] }],
      generationConfig: { temperature: 0, seed: 7, maxOutputTokens: 400, responseMimeType: 'application/json', responseSchema: VAL_SCHEMA }
    })
  });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200) return { errore: 'Gemini non ha risposto: ' + ((j.error && j.error.message) || r.getResponseCode()) };
  const testo = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(function (x) { return x.text || ''; }).join('');
  let d;
  try { d = JSON.parse(testo); } catch (e) { return { errore: 'Non ho capito la frase, riprova scrivendola in un altro modo.' }; }
  const uso = j.usageMetadata || {};
  conta_(modello, uso.promptTokenCount || 0, (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0));
  return {
    marca: d.marca || '', modello: d.modello || '', serie: d.serie || '', motore: d.motore || '', cv: d.cv || 0,
    alimentazione: normAlim(d.alimentazione) || '', allestimento: d.allestimento || '', anno: d.anno || 0, km: d.km || 0, cambio: d.cambio || '',
    versione: [d.motore, d.allestimento].filter(Boolean).join(' '), slug: { marca: d.slugMarca || valSlug(d.marca), modello: d.slugModello || valSlug(d.modello) }
  };
}

function valValuta_(req) {
  if (!limite_()) return { errore: "Troppe richieste in quest'ora: riprova tra poco." };
  const frase = String(req.frase || '').trim().slice(0, 300);
  let auto = req.auto;
  if (!auto) {
    if (!frase) return { errore: "Scrivi l'auto da valutare." };
    auto = valInterpreta_(frase);
    if (auto.errore) return auto;
  }
  auto.alimentazione = normAlim(auto.alimentazione);
  auto.anno = Number(auto.anno) || 0; auto.km = Number(auto.km) || 0;
  if (!auto.marca || !auto.modello) return { auto: auto, mancano: ['marca', 'modello'], errore: 'Non ho capito marca e modello: scrivili per esteso.' };
  const mancano = ['alimentazione', 'anno', 'km'].filter(function (k) { return !auto[k]; });
  const url = urlPortali(auto), nomi = ['autoscout', 'subito', 'automobile'];
  const richieste = nomi.map(function (n) { return { url: url[n], headers: VAL_UA, muteHttpExceptions: true, followRedirects: true }; });
  let risposte;
  try { risposte = UrlFetchApp.fetchAll(richieste); }
  catch (e) {   // un indirizzo irraggiungibile fa fallire tutto il gruppo: riprovo un portale alla volta
    risposte = richieste.map(function (r) { try { return UrlFetchApp.fetch(r.url, r); } catch (er) { return null; } });
  }
  const annunci = [], portali = {}, completi = {};
  risposte.forEach(function (r, i) {
    const n = nomi[i], html = r && r.getResponseCode() === 200 ? r.getContentText() : '';
    const letti = n === 'autoscout' ? leggiAutoscout(html) : n === 'subito' ? leggiSubito(html, new Date()) : leggiAutomobile(html, auto);
    portali[n] = html && leggibile(n, html) ? letti.length : 'errore';
    completi[n] = !!html && completo(n, html, letti.length);
    letti.forEach(function (a) { annunci.push(a); });
  });
  return { auto: auto, mancano: mancano, annunci: annunci, venduti: valStorico_(chiaveRicerca(auto), annunci, completi, finestraKm(auto)), portali: portali, cfg: valConfig_() };
}

function valConfig_() {
  const s = PropertiesService.getScriptProperties().getProperty('VAL_CONFIG');
  return s ? JSON.parse(s) : null;
}

function valFoglio_() {
  const p = PropertiesService.getScriptProperties();
  const id = p.getProperty('VAL_FOGLIO');
  if (id) return SpreadsheetApp.openById(id);
  const f = SpreadsheetApp.create('Valutazioni permute');
  f.getSheets()[0].setName('valutazioni').appendRow(['id', 'data', 'frase', 'targa', 'mercato', 'offerta teniamo', 'offerta commerciante', 'dati']);
  f.insertSheet('annunci').appendRow(['ricerca', 'id', 'portale', 'ultima vista', 'dati']);
  p.setProperty('VAL_FOGLIO', f.getId());
  return f;
}

// aggiorna lo storico della ricerca e restituisce le auto sparite (vendute) degli ultimi 90 giorni
function valStorico_(chiave, annunci, completi, finestra) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return [];
  try {
    const sh = valFoglio_().getSheetByName('annunci');
    const righe = sh.getDataRange().getValues();
    const oggi = new Date(), dove = {}, prima = [];
    for (let i = 1; i < righe.length; i++) {
      if (righe[i][0] !== chiave) continue;
      dove[righe[i][1]] = i;
      try { prima.push(Object.assign(JSON.parse(righe[i][4]), { id: righe[i][1], portale: righe[i][2], ultimaVista: new Date(righe[i][3]).toISOString() })); } catch (e) {}
    }
    const vend = venduti(prima, annunci, oggi, completi, finestra).filter(function (a) { return oggi - new Date(a.ultimaVista) < 90 * 864e5; });
    const nuove = [];
    annunci.forEach(function (a) {
      const riga = [chiave, a.id, a.portale, oggi, JSON.stringify(a)];
      if (dove[a.id] != null) sh.getRange(dove[a.id] + 1, 1, 1, 5).setValues([riga]); else nuove.push(riga);
    });
    if (nuove.length) sh.getRange(sh.getLastRow() + 1, 1, nuove.length, 5).setValues(nuove);
    return vend;
  } finally { lock.releaseLock(); }
}

function valSalva_(req) {
  const r = req.risultato || {};
  const dati = { frase: String(req.frase || '').slice(0, 300), targa: String(req.targa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10),
    auto: req.auto || {}, risultato: r, eurotax: req.eurotax || {}, ripristino: req.ripristino, annunci: (req.annunci || []).slice(0, 150).map(pulisciAnnuncio), venduti: (req.venduti || []).slice(0, 60).map(pulisciAnnuncio) };
  let testo = JSON.stringify(dati);
  if (testo.length > 49000) { dati.annunci = []; dati.venduti = []; testo = JSON.stringify(dati); }
  const sh = valFoglio_().getSheetByName('valutazioni');
  const riga = [req.id || Utilities.getUuid(), new Date(), dati.frase, dati.targa, r.mercato || '', (r.teniamo || {}).offerta || '', (r.commerciante || {}).offerta || '', testo];
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const ids = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).getValues().map(function (x) { return x[0]; });
    const i = req.id ? ids.indexOf(req.id) : -1;
    if (i > 0) sh.getRange(i + 1, 1, 1, riga.length).setValues([riga]); else sh.appendRow(riga);
  } finally { lock.releaseLock(); }
  return { id: riga[0] };
}

function valUltime_() {
  const sh = valFoglio_().getSheetByName('valutazioni'), n = sh.getLastRow();
  if (n < 2) return { valutazioni: [] };
  const da = Math.max(2, n - 29);
  const righe = sh.getRange(da, 1, n - da + 1, 7).getValues().reverse();
  return { valutazioni: righe.map(function (x) { return { id: x[0], data: new Date(x[1]).toISOString(), frase: x[2], targa: x[3], mercato: x[4], offertaTeniamo: x[5], offertaCommerciante: x[6] }; }) };
}

function valApri_(req) {
  if (!req.id) return { errore: 'Valutazione non trovata.' };
  const sh = valFoglio_().getSheetByName('valutazioni');
  const f = sh.getRange(1, 1, Math.max(1, sh.getLastRow()), 1).createTextFinder(String(req.id)).matchEntireCell(true).findNext();
  if (!f) return { errore: 'Valutazione non trovata.' };
  const riga = sh.getRange(f.getRow(), 1, 1, 8).getValues()[0];
  return Object.assign(JSON.parse(riga[7]), { id: riga[0], data: new Date(riga[1]).toISOString() });
}

function valMargini_(req) {
  if (!req.cfg) return { cfg: valConfig_() };
  const giusta = String(PropertiesService.getScriptProperties().getProperty('CHIAVE_SCELTE') || '').trim();
  if (!giusta || String(req.chiave || '').trim() !== giusta) return { errore: 'Solo con la chiave di Giuseppe' };
  const c = req.cfg, fasce = function (f) { return Array.isArray(f) && f.length && f.every(function (x) { return (x.fino == null || x.fino > 0) && (x.euro >= 0 || x.perc >= 0); }); };
  if (!(c.passaggio >= 0) || !(c.ripristino >= 0) || !fasce(c.nostro) || !fasce(c.commerciante)) return { errore: 'Margini non validi.' };
  const pulita = { passaggio: Number(c.passaggio), ripristino: Number(c.ripristino), nostro: c.nostro, commerciante: c.commerciante };
  PropertiesService.getScriptProperties().setProperty('VAL_CONFIG', JSON.stringify(pulita));
  return { cfg: pulita };
}

// da lanciare una volta dall'editor se Google non chiede il permesso per i Fogli: crea il Foglio e autorizza
function autorizzaFogli() { Logger.log(valFoglio_().getUrl()); }
