/**
 * Assistente dello stock usato - servizio Google Apps Script.
 *
 * Tiene la chiave di Gemini nel tuo account Google (Proprieta' script > GEMINI_KEY),
 * cosi' non compare mai nel sito pubblico. Il sito gli manda la domanda e l'elenco
 * delle auto disponibili; lui chiede a Gemini e restituisce risposta e auto consigliate.
 *
 * Proprieta' dello script (Impostazioni progetto > Proprieta' script):
 *   GEMINI_KEY  la chiave API del progetto con fatturazione (obbligatoria)
 *   MODELLO     facoltativa, per cambiare modello senza toccare il codice
 *   CHIAVE_SCELTE la chiave del telefono di Giuseppe: solo con questa si sceglie il codice modello di un'auto (e si cambiano i margini del valutatore)
 *   VAL_CONFIG  margini, passaggio e ripristino del valutatore permute (si impostano dall'app, con la chiave)
 *   VAL_FOGLIO  id del Foglio Google 'Valutazioni permute' (lo crea da solo alla prima valutazione)
 */

const MODELLO_PREDEFINITO = 'gemini-3.5-flash-lite';   // il 2.5 non e' piu' disponibile per i nuovi utenti
const TOKEN = 'FTcdlNGgGU7WXN-L';          // lo stesso scritto nel sito: ferma le chiamate a caso
const MAX_DOMANDE_ORA = 120;               // per tutto il sito, contro gli abusi
const MAX_FOTO_ORA = 400;                  // controlli delle foto (telecamera, tetto) in un'ora: conto a parte, per non bloccare le domande
const MAX_ELENCO = 200000;                 // caratteri dell'elenco auto accettati
// prezzi in dollari per milione di token (ingresso, uscita), per stimare la spesa del mese
const PREZZI = { 'gemini-3.5-flash-lite': [0.30, 2.50], 'gemini-3.1-flash-lite': [0.25, 1.50], 'gemini-2.5-flash-lite': [0.10, 0.40], 'gemini-2.5-flash': [0.30, 2.50] };

const ISTRUZIONI = [
  "Sei l'assistente dei venditori dell'usato di Valentino Automobili Roma.",
  "Ricevi l'elenco delle auto oggi disponibili, una per riga, e la domanda di un venditore, spesso la descrizione di un cliente.",
  "Regole:",
  "- Usa SOLO le auto dell'elenco. Non inventare auto, prezzi, chilometri o dotazioni che non ci sono.",
  "- Proponi da 1 a 6 auto, la piu' adatta per prima. Per ciascuna scrivi in 'perche' una frase breve e concreta legata alla richiesta (budget, uso, famiglia, consumi, cambio, chilometri, eta').",
  "- La 'targa' deve essere copiata identica dall'elenco.",
  "- Usa solo le caratteristiche scritte nell'elenco (per esempio 'trazione integrale 4x4', 'neopatentati', porte, carrozzeria). Se la richiesta chiede una caratteristica che nell'elenco non risulta per nessuna auto, dillo chiaramente invece di indovinare.",
  "- In 'risposta' scrivi al massimo 3 frasi in italiano, dirette, da collega a collega. Se nulla corrisponde bene dillo chiaramente e proponi le alternative piu' vicine spiegando cosa cambia.",
  "- I prezzi sono in euro e comprendono il passaggio di proprieta'. 'gg' sono i giorni in stock: a parita' di adattamento preferisci le auto ferme da piu' tempo.",
  "- Se la domanda non riguarda le auto in stock, rispondi che puoi aiutare solo a scegliere tra le auto disponibili e lascia 'auto' vuoto."
].join('\n');

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    risposta: { type: 'STRING' },
    auto: { type: 'ARRAY', items: { type: 'OBJECT', properties: { targa: { type: 'STRING' }, perche: { type: 'STRING' } }, required: ['targa', 'perche'] } }
  },
  required: ['risposta', 'auto']
};

function doPost(e) {
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (req.token !== TOKEN) return json_({ errore: 'Richiesta non autorizzata.' });
    if (req.azione === 'cartello') return json_(limite_('c', MAX_FOTO_ORA) ? cartello_(req) : { errore: "Troppi cartelli in quest'ora: riprova tra poco." });
    if (req.azione === 'telecamera') return json_(limite_('f', MAX_FOTO_ORA) ? telecamera_(req) : { errore: "Troppi controlli delle foto in quest'ora: riprova tra poco." });
    if (req.azione === 'codici') return json_({ scelte: scelte_() });
    if (req.azione === 'scegli') return json_(scegli_(req));
    if (['valuta', 'salvaValutazione', 'ultime', 'apri', 'margini'].indexOf(req.azione) >= 0) return json_(valutatore_(req));   // Valutatore.gs
    if (!limite_()) return json_({ errore: "Troppe domande in quest'ora: riprova tra poco." });
    const domanda = String(req.domanda || '').trim().slice(0, 600);
    const elenco = String(req.elenco || '').slice(0, MAX_ELENCO);
    if (!domanda) return json_({ errore: 'Scrivi una domanda.' });
    if (!elenco) return json_({ errore: 'Elenco auto vuoto.' });
    const opz = { temperatura: typeof req.temperatura === 'number' ? Math.max(0, Math.min(1, req.temperatura)) : 0, seed: typeof req.seed === 'number' ? req.seed : 7 };
    return json_(chiedi_(domanda, elenco, opz));
  } catch (err) {
    return json_({ errore: 'Errore del servizio: ' + err.message });
  }
}

// controllo veloce dal browser: apri l'indirizzo /exec e deve rispondere ok
function doGet() {
  const p = PropertiesService.getScriptProperties();
  const mese = JSON.parse(p.getProperty('MESE_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMM')) || '{"domande":0,"spesa":0}');
  return json_({ ok: true, chiave: !!p.getProperty('GEMINI_KEY'), modello: p.getProperty('MODELLO') || MODELLO_PREDEFINITO, questoMese: mese });
}

function chiedi_(domanda, elenco, opz) {
  opz = opz || { temperatura: 0, seed: 7 };
  const p = PropertiesService.getScriptProperties();
  // tolgo spazi, a capo e virgolette finite per sbaglio nel valore incollato
  const chiave = String(p.getProperty('GEMINI_KEY') || '').trim().replace(/^["']+|["']+$/g, '');
  if (!chiave) return { errore: 'Manca la chiave: aggiungi GEMINI_KEY nelle proprieta\' dello script.' };
  const modello = p.getProperty('MODELLO') || MODELLO_PREDEFINITO;
  const corpo = {
    systemInstruction: { parts: [{ text: ISTRUZIONI }] },
    contents: [{ role: 'user', parts: [{ text: 'Auto disponibili oggi (targa | modello | immatricolazione | km | alimentazione | cambio | potenza | prezzo | colore | ubicazione | giorni in stock | note):\n' + elenco + '\n\nDomanda del venditore: ' + domanda }] }],
    generationConfig: { temperature: opz.temperatura, seed: opz.seed, maxOutputTokens: 1500, responseMimeType: 'application/json', responseSchema: SCHEMA }
  };
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modello) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': chiave },
    payload: JSON.stringify(corpo), muteHttpExceptions: true
  });
  const codice = r.getResponseCode();
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (codice !== 200) {
    const msg = (j.error && j.error.message) || ('codice ' + codice);
    if (codice === 402 || /prepay|billing|credit/i.test(msg)) return { errore: 'Credito Gemini esaurito o fatturazione non attiva. Controlla in AI Studio.' };
    if (/api key not valid/i.test(msg)) return { errore: `Chiave non valida: GEMINI_KEY ha ${chiave.length} caratteri e inizia con "${chiave.slice(0, 4)}". Ricopiala da AI Studio con il pulsante Copia.` };
    if (/no longer available|not found/i.test(msg)) return { errore: 'Modello non disponibile: ' + msg + ' Si puo\' cambiare con la proprieta\' MODELLO.' };
    return { errore: 'Gemini non ha risposto: ' + msg };
  }
  const parti = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const testo = parti.map(function (x) { return x.text || ''; }).join('');
  let out;
  try { out = JSON.parse(testo); } catch (e) { return { errore: 'Risposta di Gemini non leggibile, riprova.' }; }
  const uso = j.usageMetadata || {};
  const tin = uso.promptTokenCount || 0, tout = (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0);
  out.uso = { ingresso: tin, uscita: tout, modello: modello, mese: conta_(modello, tin, tout) };
  return out;
}

// tiene il conto delle domande e della spesa stimata del mese corrente
function conta_(modello, tin, tout) {
  const p = PropertiesService.getScriptProperties();
  const k = 'MESE_' + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMM');
  const lock = LockService.getScriptLock();
  const preso = lock.tryLock(3000);
  try {
    const m = JSON.parse(p.getProperty(k) || '{"domande":0,"spesa":0}');
    const prezzo = PREZZI[modello] || PREZZI[MODELLO_PREDEFINITO];
    m.domande += 1;
    m.spesa += (tin * prezzo[0] + tout * prezzo[1]) / 1e6;
    p.setProperty(k, JSON.stringify(m));
    return { domande: m.domande, spesa: Math.round(m.spesa * 100) / 100 };
  } finally { if (preso) lock.releaseLock(); }
}

/* Cartello salone: dall'elenco dotazioni dell'annuncio Gemini sceglie le piu' importanti per chi compra
   e le scrive in righe corte come nei cartelli di Valentino; scrive anche il titolo del cartello. */
const SCHEMA_CARTELLO = { type: 'OBJECT', properties: { nome: { type: 'STRING' }, righe: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['nome', 'righe'] };
const ISTRUZIONI_CARTELLO = [
  "Prepari il cartello da esporre in salone per un'auto usata di Valentino Automobili Roma.",
  "Ricevi il modello e l'elenco completo delle dotazioni preso dall'annuncio. Regole:",
  "- 'nome': nome commerciale chiaro, al massimo 38 caratteri, con le iniziali maiuscole e non tutto maiuscolo (sigle come TSI, TDI, DSG in maiuscolo), per esempio 'Volkswagen T-Roc 1.0 TSI Style 110 CV', 'Volkswagen Golf 2.0 TSI GTI 245 CV DSG' o 'Fiat 500 1.0 Hybrid Club'.",
  "- 'righe': da 4 a 7 righe in MAIUSCOLO, ciascuna di AL MASSIMO 52 caratteri, con 2-4 dotazioni separate da ' - '.",
  "- Scegli le dotazioni che contano per chi compra: cerchi (con pollici), fari LED o Matrix, navigatore, Apple CarPlay/Android Auto, cockpit digitale, climatizzatore automatico o a zone, sensori di parcheggio, cruise control adattivo, assistenze alla guida, keyless, sedili riscaldati o in pelle, vetri privacy, pacchetti (R-Line, S line, Black), impianto audio di marca, portellone elettrico.",
  "- Scrivi RETROCAMERA solo se 'telecamera confermata' e TETTO APRIBILE solo se 'tetto confermato'.",
  "- Non mettere dotazioni ovvie (ABS, ESP, airbag, chiusura centralizzata, alzacristalli, servosterzo, poggiatesta, altoparlanti) e non inventare niente che non sia nell'elenco.",
  "- Abbrevia senza perdere senso: 'Cerchi in lega da 18 pollici' -> 'CERCHI IN LEGA 18\"'."
].join('\n');

// elenco dotazioni dalla pagina dell'annuncio (stessa lettura di agente/annunci.js)
function elencoPagina_(html, chiave) {
  const i = html.indexOf('"' + chiave + '":[');
  if (i < 0) return [];
  let j = i + chiave.length + 3, prof = 0;
  for (; j < html.length; j++) { const ch = html[j]; if (ch === '[') prof++; else if (ch === ']' && --prof === 0) break; }
  try { return JSON.parse(html.slice(i + chiave.length + 3, j + 1)).map(function (x) { return typeof x === 'string' ? x : JSON.stringify(x); }); } catch (e) { return []; }
}
function dotazioniAnnuncio_(url) {
  if (!/^https:\/\/www\.valentinoautomobili\.it\/auto\//.test(String(url || ''))) return [];
  const r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) return [];
  const html = r.getContentText();
  return elencoPagina_(html, 'equipmentStandardList').concat(elencoPagina_(html, 'equipmentList'), elencoPagina_(html, 'equipmentOptionalList'))
    .map(function (x) { return x.replace(/&amp;/g, '&').trim(); }).filter(String);
}

function cartello_(req) {
  if (!(req.dotazioni || []).length && req.url) req.dotazioni = dotazioniAnnuncio_(req.url);
  const dot = (req.dotazioni || []).map(function (x) { return String(x).slice(0, 160); }).slice(0, 250);
  if (!dot.length) return { errore: "Nell'annuncio non ho trovato le dotazioni." };
  const p = PropertiesService.getScriptProperties();
  const chiave = String(p.getProperty('GEMINI_KEY') || '').trim().replace(/^["']+|["']+$/g, '');
  const modello = p.getProperty('MODELLO') || MODELLO_PREDEFINITO;
  const testo = 'Auto: ' + String(req.auto || '').slice(0, 160) + (req.telecamera ? ' (telecamera confermata)' : '') + (req.tetto ? ' (tetto confermato)' : '') + '\nDotazioni:\n- ' + dot.join('\n- ');
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modello) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': chiave }, muteHttpExceptions: true,
    payload: JSON.stringify({ systemInstruction: { parts: [{ text: ISTRUZIONI_CARTELLO }] }, contents: [{ role: 'user', parts: [{ text: testo }] }],
      generationConfig: { temperature: 0, seed: 7, maxOutputTokens: 600, responseMimeType: 'application/json', responseSchema: SCHEMA_CARTELLO } })
  });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200) return { errore: 'Gemini non ha risposto: ' + ((j.error && j.error.message) || r.getResponseCode()) };
  const out = JSON.parse(((((j.candidates || [])[0] || {}).content || {}).parts || []).map(function (x) { return x.text || ''; }).join('') || '{}');
  const uso = j.usageMetadata || {};
  conta_(modello, uso.promptTokenCount || 0, (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0));
  return { nome: String(out.nome || '').slice(0, 60), righe: (out.righe || []).map(function (x) { return String(x).slice(0, 70); }).slice(0, 7) };
}

/* Telecamera posteriore: l'elenco dotazioni del sito la nomina, ma a volte per errore.
   L'agente del PC manda qui le foto dell'annuncio e Gemini dice se la telecamera si vede davvero. */
const SCHEMA_CAM = {
  type: 'OBJECT',
  properties: {
    telecamera: { type: 'STRING', enum: ['si', 'no', 'non visibile'] },
    foto: { type: 'INTEGER' },
    indizio: { type: 'STRING' }
  },
  required: ['telecamera', 'indizio']
};
const ISTRUZIONI_CAM = [
  "Ricevi le foto numerate dell'annuncio di un'auto usata (esterni e interni). Devi dire solo se l'auto ha la telecamera posteriore per la retromarcia.",
  "- 'si': vedi chiaramente l'obiettivo della telecamera sul retro (sul portellone, vicino alla maniglia, sopra la targa o dentro il logo, a volte nascosto nel logo che si apre) oppure sul display interno compare l'immagine della retrocamera con le linee guida.",
  "- 'no': almeno una foto mostra bene e da vicino la parte posteriore (portellone, zona targa e logo) e non c'e' nessuna telecamera.",
  "- 'non visibile': le foto non permettono di deciderlo con sicurezza.",
  "Non indovinare: se hai dubbi rispondi 'non visibile'. In 'foto' metti il numero della foto decisiva (1 = la prima), in 'indizio' cosa hai visto, al massimo 15 parole."
].join('\n');

function telecamera_(req) {
  const urls = (req.foto || []).filter(function (u) { return /^https:\/\/cdn\.dealerk\.it\//.test(String(u)); }).slice(0, 12);
  if (!urls.length) return { errore: 'Nessuna foto.' };
  const p = PropertiesService.getScriptProperties();
  const chiave = String(p.getProperty('GEMINI_KEY') || '').trim().replace(/^["']+|["']+$/g, '');
  const modello = p.getProperty('MODELLO') || MODELLO_PREDEFINITO;
  const scaricate = UrlFetchApp.fetchAll(urls.map(function (u) { return { url: u, muteHttpExceptions: true }; }));
  const parti = [];
  scaricate.forEach(function (r, i) {
    if (r.getResponseCode() !== 200) return;
    parti.push({ text: 'Foto ' + (i + 1) + ':' });
    parti.push({ inlineData: { mimeType: 'image/jpeg', data: Utilities.base64Encode(r.getBlob().getBytes()) } });
  });
  if (!parti.length) return { errore: 'Foto non scaricabili.' };
  parti.push({ text: 'Auto: ' + String(req.auto || '').slice(0, 120) + '. Ha la telecamera posteriore?' });
  // le istruzioni possono arrivare dall'agente del PC, cosi' si migliorano senza rifare il deployment
  const istruzioni = typeof req.istruzioni === 'string' && req.istruzioni.length > 50 ? req.istruzioni.slice(0, 4000) : ISTRUZIONI_CAM;
  const corpo = {
    systemInstruction: { parts: [{ text: istruzioni }] },
    contents: [{ role: 'user', parts: parti }],
    generationConfig: { temperature: 0, seed: 7, maxOutputTokens: 300, responseMimeType: 'application/json', responseSchema: SCHEMA_CAM }
  };
  const r = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(modello) + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': chiave }, payload: JSON.stringify(corpo), muteHttpExceptions: true
  });
  let j = {};
  try { j = JSON.parse(r.getContentText()); } catch (e) {}
  if (r.getResponseCode() !== 200) return { errore: 'Gemini non ha risposto: ' + ((j.error && j.error.message) || r.getResponseCode()) };
  const testo = ((((j.candidates || [])[0] || {}).content || {}).parts || []).map(function (x) { return x.text || ''; }).join('');
  let out;
  try { out = JSON.parse(testo); } catch (e) { return { errore: 'Risposta non leggibile.' }; }
  const uso = j.usageMetadata || {};
  const tin = uso.promptTokenCount || 0, tout = (uso.candidatesTokenCount || 0) + (uso.thoughtsTokenCount || 0);
  out.uso = { ingresso: tin, uscita: tout, mese: conta_(modello, tin, tout) };
  return out;
}

/* Codice modello VW scelto da Giuseppe quando il listino ne propone piu' d'uno.
   Una proprieta' per auto (COD_targa): cosi' non si supera il limite di grandezza di una singola proprieta'. */
function scelte_() {
  const tutte = PropertiesService.getScriptProperties().getProperties(), out = {};
  Object.keys(tutte).forEach(function (k) { if (k.indexOf('COD_') === 0) { try { out[k.slice(4)] = JSON.parse(tutte[k]); } catch (e) {} } });
  return out;
}

function scegli_(req) {
  const p = PropertiesService.getScriptProperties();
  const chiave = String(p.getProperty('CHIAVE_SCELTE') || '').trim();
  if (!chiave || String(req.chiave || '') !== chiave) return { errore: "Questo telefono non e' abilitato a scegliere i codici modello." };
  const targa = String(req.targa || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (!targa) return { errore: 'Targa mancante.' };
  if (req.codice) {
    p.setProperty('COD_' + targa, JSON.stringify({
      codice: String(req.codice).slice(0, 30), versione: String(req.versione || '').slice(0, 80),
      prezzo: Number(req.prezzo) || 0, quando: Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyy-MM-dd')
    }));
  } else p.deleteProperty('COD_' + targa);
  return { ok: true, scelte: scelte_() };
}

// conta le richieste dell'ora in corso: 'n' per domande e valutazioni, 'f' per i controlli delle foto
function limite_(nome, max) {
  const cache = CacheService.getScriptCache();
  const k = (nome || 'n') + Utilities.formatDate(new Date(), 'Europe/Rome', 'yyyyMMddHH');
  const n = Number(cache.get(k) || 0);
  if (n >= (max || MAX_DOMANDE_ORA)) return false;
  cache.put(k, String(n + 1), 3700);
  return true;
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// Da lanciare una volta dall'editor (menu in alto: scegli "prova", poi Esegui) per autorizzare e verificare la chiave
function prova() {
  const elenco = [
    'AA111AA | Volkswagen Golf GOLF 8 LIFE 1.0 ETSI DSG | 06/2023 | 31.840 km | Ibrida | Automatico | 110 CV | 22.950 € | Grigio | Tiburtina 2 | 12 gg',
    'BB222BB | Volkswagen T-Roc NUOVO T-ROC STYLE 1.0 TSI | 03/2023 | 28.410 km | Benzina | Manuale | 110 CV | 23.650 € | Bianco | Tiburtina | 47 gg',
    'CC333CC | Fiat 500 1.0 HYBRID CLUB | 04/2023 | 22.790 km | Ibrida | Manuale | 70 CV | 13.450 € | Bianco | Corvaglia | 66 gg | neopatentati'
  ].join('\n');
  Logger.log(JSON.stringify(chiedi_('Ragazza neopatentata, budget 15 mila, usa l\'auto in citta', elenco), null, 2));
}
