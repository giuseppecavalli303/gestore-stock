// Controlli automatici da lanciare dopo ogni modifica al lettore:  npm test
// Rilegge tutte le stampe vere scaricate dall'agente (restano solo su questo PC) e verifica i conteggi del report.
const fs = require('fs'), path = require('path');
const _w = console.warn, _l = console.log; console.warn = console.log = () => {};
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js');
console.warn = _w; console.log = _l;

const root = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8');
const { extract, normalize, buildVocab, parseQuery, matchQuery, deacc } = new Function(['parser.js', 'norm.js', 'query.js'].map(src).join('\n') + '\nreturn { extract, normalize, buildVocab, parseQuery, matchQuery, deacc };')();

let errori = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok   ' : '  NO   ') + msg); if (!cond) errori++; };

async function leggi(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0, isEvalSupported: false }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p), h = page.view[3], tc = await page.getTextContent();
    pages.push({ items: tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: h - i.transform[5], w: i.width, fs: i.transform[0] })) });
  }
  return normalize(extract(pages));
}

(async () => {
  const dir = path.join(__dirname, 'arrivi');
  const pdf = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /\.pdf$/i.test(f)).sort() : [];
  console.log(`Stampe da verificare: ${pdf.length}`);
  let ultima = null;
  for (const f of pdf) {
    const d = await leggi(path.join(dir, f)), m = d.meta;
    ok(m.count === m.expected && !m.badSec.length && !m.warnings.length, `${f}: ${m.count} letti, ${m.expected} dichiarati${m.badSec.length ? ', sezioni che non tornano: ' + m.badSec.join(', ') : ''}`);
    ok(new Set(d.cars.map(c => c.targa)).size === d.cars.length, `${f}: targhe tutte diverse`);
    ok(d.cars.filter(c => c.brand === 'Altre marche').length <= 5, `${f}: marche riconosciute (${d.cars.filter(c => c.brand === 'Altre marche').length} non riconosciute)`);
    ok(d.cars.every(c => c.ingr && c.giorni != null), `${f}: data di ingresso presente su tutte`);
    ultima = d;
  }
  if (ultima) {
    const cars = ultima.cars;
    cars.forEach(c => { c._h = deacc([c.targa, c.brand, c.family, c.modello, c.colore, c.ubic, c.vend, c.acq, c.note, c.section, c.stato, c.antic].join(' ').toLowerCase()); });
    const V = buildVocab(cars);
    const prova = (q, attese) => { const Q = parseQuery(q, V); ok(attese.every(a => Q.chips.includes(a)), `ricerca "${q}" capita come: ${Q.chips.join(' · ')}`); return cars.filter(c => matchQuery(c, Q)); };
    const r1 = prova('golf diesel automatica sotto 40000 libera', ['Golf', 'Diesel', 'Automatico', 'Libere']);
    ok(r1.every(c => c.family === 'Golf' && c.fuel === 'Diesel' && c.free && c.prezzo <= 40000), 'i risultati rispettano i filtri');
    prova('t-roc tiburtina 2 dal 2023 meno di 40.000 km', ['T-Roc', 'da 2023']);
    prova('elettriche in arrivo', ['Elettrica', 'In arrivo']);
  }
  // rata: valori calcolati con il simulatore di Giuseppe (Documents\simulatore vw), manutenzione 1 tagliando nei PVV
  const { FIN, finCalcola } = new Function(src('finanza.js') + '\nreturn { FIN, finCalcola };')();
  const pvv = finCalcola({ tipo: 'pvv', prezzo: 20000, anticipo: 3000, durata: 36, tan: FIN.pvv.tan, vfg: 9000, servizi: 5 * 36 });
  ok(pvv.rata === 348.05 && Math.abs(pvv.taeg * 100 - 11.02) < 0.01, `rata PVV come il simulatore: ${pvv.rata} € (attesa 348,05)`);
  const cl = finCalcola({ tipo: 'classico', prezzo: 14450, anticipo: 2000, durata: 60, tan: FIN.classico.tan });
  ok(cl.rata === 278.89, `rata Credito Classico come il simulatore: ${cl.rata} € (attesa 278,89)`);
  ok(!!finCalcola({ tipo: 'pvv', prezzo: 20000, anticipo: 9000, durata: 36, tan: FIN.pvv.tan, vfg: 9000 }).errore, 'PVV: anticipo oltre il 35% rifiutato');
  // codice modello: allestimento e carrozzeria dal nome del listino
  const { punteggio, famigliaListino } = require('./listini.js');
  ok(punteggio('1.0 TSI Edition Plus DSG', 'NUOVO T-ROC EDITION PLUS 1.0 TSI DSG') === 2 && punteggio('1.0 TSI R-Line', 'T-ROC R-LINE 1.0 TSI') === 1, 'listini: allestimento riconosciuto');
  const fam = [{ nome: 'Golf', k: 'golf' }, { nome: 'up!', k: 'up' }, { nome: 'T-Roc', k: 'troc' }];
  const g = famigliaListino('Nuova Golf Variant', fam), u = famigliaListino('e-up!', fam), t = famigliaListino('Nuovo T-Roc Cabriolet', fam);
  ok(g && g.famiglia === 'Golf' && g.corpo === 'Variant' && u && u.famiglia === 'up!' && t && t.corpo === 'Cabrio', 'listini: modello e carrozzeria dal nome');
  // valutatore permute: valore di mercato dalle auto simili e offerte (teniamo / commerciante)
  const { valuta, simili, margine } = new Function(src('valuta.js') + '\nreturn { valuta, simili, margine };')();
  // valori di prova inventati: i margini veri stanno solo nel servizio Google, mai nel repo pubblico
  const CFG = { passaggio: 222, ripristino: 333,
    nostro: [{ fino: 8000, euro: 1111 }, { fino: 15000, euro: 1717 }, { fino: 25000, euro: 2323 }, { fino: null, perc: 7 }],
    commerciante: [{ fino: 8000, euro: 1333 }, { fino: 15000, euro: 1919 }, { fino: 25000, euro: 2727 }, { fino: null, perc: 11 }] };
  const A = (p, km, anno, extra) => Object.assign({ portale: 'autoscout', id: String(p) + km, titolo: 'Renault Clio 0.9 TCe GPL Energy', marca: 'Renault', modello: 'Clio', versione: '0.9 TCe 90 CV GPL Energy', alimentazione: 'GPL', anno, km, prezzo: p, venditore: 'concessionario' }, extra);
  const CLIO = { marca: 'Renault', modello: 'Clio', alimentazione: 'GPL', anno: 2013, km: 120000, versione: 'Energy' };
  const lotto = [A(6300, 120000, 2013), A(6200, 118000, 2013), A(6400, 125000, 2014), A(6100, 130000, 2012), A(6900, 110000, 2013),
    A(6000, 121000, 2013, { venditore: 'privato', portale: 'subito' }), A(5900, 122000, 2013, { venditore: 'privato', portale: 'subito' })];
  ok(margine(6900, CFG.nostro) === 1111 && margine(30000, CFG.nostro) === 2100, 'valutatore: margini a fasce e in percentuale');
  const rv = valuta(CLIO, lotto, CFG, null);
  ok(rv.ok && rv.n === 7 && rv.ripristino === 333, `valutatore: ${rv.n} auto simili, ripristino standard ${rv.ripristino}`);
  ok(rv.teniamo.offerta === Math.floor((rv.rivendita - 333 - 222 - 1111) / 50) * 50 && rv.commerciante.offerta === Math.floor((rv.mercato - 333 - 222 - 1333) / 50) * 50, `valutatore: offerte = rivendita/mercato meno ripristino, passaggio, margine (mercato ${rv.mercato}, rivendita ${rv.rivendita}, offerte ${rv.teniamo.offerta} / ${rv.commerciante.offerta})`);
  const rp = valuta(CLIO, lotto, Object.assign({}, CFG, { passaggio: 777 }), null);
  ok(rp.note.every(n => !/777/.test(n)) && rp.note.some(n => /passaggio/.test(n)) && rp.teniamo.offerta === Math.floor((rp.rivendita - 333 - 777 - 1111) / 50) * 50, 'valutatore: il passaggio compare solo come parola ma resta nel conto');
  ok(valuta(CLIO, lotto, CFG, 833).teniamo.offerta === rv.teniamo.offerta - 500, 'valutatore: ripristino corretto a mano cambia l\'offerta');
  ok(simili(CLIO, [A(6000, 120000, 2013, { alimentazione: 'Benzina' })]).length === 0, 'valutatore: alimentazione diversa esclusa');
  ok(simili(CLIO, [A(1, 120000, 2013), A(6000, 120000, 2013, { titolo: 'Clio GPL incidentata' })]).length === 0, 'valutatore: annunci anomali esclusi');
  ok(simili({ marca: 'Renault', modello: 'Clio', anno: 2013 }, lotto).length === 7, 'valutatore: km e carburante mancanti non escludono niente');
  const poche = valuta(CLIO, lotto.slice(0, 4), CFG, null);
  ok(!poche.ok && /Troppo poche auto simili \(4\)/.test(poche.motivo), 'valutatore: con meno di 5 auto non da un valore');
  // valutatore permute: lettura dei portali (frammenti scritti a mano: le pagine vere hanno nomi di privati)
  const P = new Function(fs.readFileSync(path.join(root, 'assistente', 'Valutatore.gs'), 'utf8') + '\nreturn { urlPortali, leggiAutoscout, leggiSubito, leggiAutomobile, normAlim };')();
  const nd = o => '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(o) + '</script>';
  const up = P.urlPortali(Object.assign({}, CLIO, { slug: { marca: 'renault', modello: 'clio' } }));
  ok(/autoscout24\.it\/lst\/renault\/clio\?/.test(up.autoscout) && /fuel=L/.test(up.autoscout) && /fregfrom=2012/.test(up.autoscout) && /fregto=2014/.test(up.autoscout), 'portali: ricerca AutoScout con GPL e anni ±1');
  ok(/subito\.it\/annunci-italia\/vendita\/auto\/\?q=renault\+clio\+gpl/.test(up.subito) && /ys=2012/.test(up.subito) && /ye=2014/.test(up.subito), 'portali: ricerca Subito con anni ±1');
  ok(/automobile\.it\/renault-clio-gpl$/.test(up.automobile), 'portali: ricerca Automobile.it per carburante');
  ok(P.normAlim('Benzina/Gpl') === 'GPL' && P.normAlim('GPL - Euro 5') === 'GPL' && P.normAlim('Elettrica/Benzina') === 'Ibrida' && P.normAlim('Gasolio') === 'Diesel', 'portali: carburanti dei tre siti riconosciuti');
  const as1 = P.leggiAutoscout(nd({ props: { pageProps: { listings: [{ id: 'x', url: '/annunci/x', vehicle: { make: 'Renault', model: 'Clio', modelVersionInput: '0.9 TCe GPL Energy', fuel: 'GPL' }, tracking: { firstRegistration: '06-2013', mileage: '120000', price: '6300' }, price: { priceRaw: 6300 }, seller: { type: 'Dealer', companyName: 'Auto Srl' }, location: { city: 'Roma - RM' } }] } } }));
  ok(as1.length === 1 && as1[0].prezzo === 6300 && as1[0].anno === 2013 && as1[0].km === 120000 && as1[0].alimentazione === 'GPL' && as1[0].venditore === 'concessionario' && as1[0].url === 'https://www.autoscout24.it/annunci/x', 'portali: annuncio AutoScout letto');
  const sub = P.leggiSubito(nd({ props: { pageProps: { x: { list: [{ item: { urn: 'id:ad:1', subject: 'Renault Clio 0.9 GPL Energy', date: '2026-09-22 10:00:00', urls: { default: 'https://www.subito.it/auto/clio-1.htm' },
    advertiser: { name: 'Mario Rossi', company: false }, geo: { town: { value: 'Latina' } },
    features: { '/car': { values: [{ label: 'Marca', value: 'RENAULT' }, { label: 'Modello', value: 'Clio 4ª serie', group_label: 'Clio' }, { label: 'Versione', value: 'Clio TCe 90 CV GPL Energy' }] },
      '/fuel': { values: [{ value: 'Benzina/Gpl' }] }, '/year': { values: [{ value: '2013' }] }, '/mileage_scalar': { values: [{ value: '125000 Km' }] }, '/price': { values: [{ value: '5800 €' }] } } } }] } } } }), new Date('2026-10-22T10:00:00'));
  ok(sub.length === 1 && sub[0].marca.toLowerCase() === 'renault' && sub[0].modello === 'Clio' && sub[0].anno === 2013 && sub[0].km === 125000 && sub[0].prezzo === 5800 && sub[0].alimentazione === 'GPL' && sub[0].venditore === 'privato' && sub[0].citta === 'Latina' && sub[0].giorni === 30, 'portali: annuncio Subito letto');
  ok(!JSON.stringify(sub).includes('Mario Rossi'), 'portali: il nome del privato su Subito non viene salvato');
  const am = P.leggiAutomobile(nd({ props: { pageProps: { apiResults: { result: { resultList: [{ id: 7, title: 'Renault Clio 1.2 75CV GPL 5 porte Live', formattedPrice: '€ 4.400', location: 'Perugia (PG)', url: '/perugia-renault-clio', sellerType: 'DEALER', details: { registration: 'Marzo 2013', fuelEmissions: 'GPL - Euro 5', formattedKm: '123.000 km' } }] } } } } }), { marca: 'Renault', modello: 'Clio' });
  ok(am.length === 1 && am[0].prezzo === 4400 && am[0].anno === 2013 && am[0].km === 123000 && am[0].alimentazione === 'GPL' && am[0].venditore === 'concessionario' && am[0].modello === 'Clio', 'portali: annuncio Automobile.it letto');
  ok(P.leggiSubito('<html>niente</html>').length === 0 && P.leggiAutomobile('', CLIO).length === 0 && P.leggiAutoscout('<script id="__NEXT_DATA__">{rotto').length === 0, 'portali: pagina cambiata o vuota non fa saltare la valutazione');
  ok(rv.note.some(n => /margine 1\.111 €/.test(n)), 'valutatore: cifre con il punto delle migliaia (1.111 €)');
  // valutatore permute: storico delle ricerche e auto vendute
  const Q = new Function(fs.readFileSync(path.join(root, 'assistente', 'Valutatore.gs'), 'utf8') + '\nreturn { chiaveRicerca, venduti, completo };')();
  ok(Q.chiaveRicerca(CLIO) === Q.chiaveRicerca({ marca: ' RENAULT', modello: 'clio ', alimentazione: 'gpl', anno: 2013, km: 90000 }), 'storico: stessa ricerca, stessa chiave (maiuscole, spazi e km non contano)');
  ok(Q.chiaveRicerca(CLIO) !== Q.chiaveRicerca(Object.assign({}, CLIO, { anno: 2015 })), 'storico: anno diverso, ricerca diversa');
  const ieri = new Date('2026-10-21T09:00:00'), oggi3 = new Date('2026-10-22T10:00:00');
  const vista = (id, quando, portale) => ({ id, portale: portale || 'autoscout', prezzo: 6000, ultimaVista: quando.toISOString() });
  const vend = Q.venduti([vista('a', ieri), vista('b', ieri), vista('c', new Date('2026-10-22T09:00:00')), vista('d', ieri, 'automobile')], [{ id: 'b', portale: 'autoscout' }], oggi3, { autoscout: true, automobile: false });
  ok(vend.length === 1 && vend[0].id === 'a', 'storico: venduta = vista ieri e sparita oggi; non se vista da poco o se il portale non mostrava tutti i risultati');
  const ndc = o => '<script id="__NEXT_DATA__" type="application/json">' + JSON.stringify(o) + '</script>';
  ok(Q.completo('autoscout', ndc({ props: { pageProps: { numberOfResults: 16 } } }), 16) && !Q.completo('autoscout', ndc({ props: { pageProps: { numberOfResults: 300 } } }), 20), 'storico: AutoScout completo solo se ha mostrato tutti i risultati');
  ok(!Q.completo('automobile', ndc({ props: { pageProps: { apiResults: { result: { pagination: { next: { pageNumber: 2 } } } } } } }), 20) && Q.completo('automobile', ndc({ props: { pageProps: { apiResults: { result: { pagination: {} } } } } }), 7), 'storico: Automobile.it completo solo senza pagina successiva');
  // valutatore permute: il servizio intero con Google simulato (Gemini, portali, Foglio, proprieta')
  {
    const props = { GEMINI_KEY: 'k', CHIAVE_SCELTE: 'segreta' }, fogli = {};
    const foglio = () => { const righe = []; const sh = { righe, setName: () => sh, appendRow: r => { righe.push(r.slice()); return sh; }, getLastRow: () => righe.length, getDataRange: () => ({ getValues: () => righe.map(r => r.slice()) }),
      getRange: (r, c, nr, nc) => ({ setValues: v => v.forEach((x, i) => { righe[r - 1 + i] = x.slice(); }), getValues: () => righe.slice(r - 1, r - 1 + nr).map(x => x.slice(c - 1, c - 1 + nc)),
        createTextFinder: t => ({ matchEntireCell: () => ({ findNext: () => { const i = righe.slice(r - 1, r - 1 + nr).findIndex(x => String(x[0]) === t); return i < 0 ? null : { getRow: () => r + i }; } }) }) }) }; return sh; };
    const SpreadsheetApp = { create: () => { const s = { a: foglio(), b: null }; const f = { getId: () => 'F1', getSheets: () => [s.a], insertSheet: n => (s.b = foglio()), getSheetByName: n => n === 'valutazioni' ? s.a : s.b }; fogli.F1 = f; return f; }, openById: id => fogli[id] };
    const PropertiesService = { getScriptProperties: () => ({ getProperty: k => props[k] || null, setProperty: (k, v) => { props[k] = v; } }) };
    const LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) };
    const risposta = (code, testo) => ({ getResponseCode: () => code, getContentText: () => testo });
    const pagina = nd({ props: { pageProps: { numberOfResults: 7, listings: lotto.map((a, i) => ({ id: 'L' + i, url: '/a/' + i, vehicle: { make: 'Renault', model: 'Clio', modelVersionInput: a.versione, fuel: 'GPL' }, tracking: { firstRegistration: '01-' + a.anno, mileage: String(a.km) }, price: { priceRaw: a.prezzo }, seller: { type: 'Dealer' }, location: { city: 'Roma' } })) } } });
    const UrlFetchApp = { fetch: () => risposta(200, JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ marca: 'Renault', modello: 'Clio', alimentazione: 'GPL', anno: 2013, km: 120000, allestimento: 'Energy', slugMarca: 'renault', slugModello: 'clio' }) }] } }] })),
      fetchAll: rs => rs.map(r => /autoscout/.test(r.url) ? risposta(200, pagina) : /subito/.test(r.url) ? risposta(403, 'bloccato') : risposta(200, '<html></html>')) };
    let uuid = 0; const Utilities = { getUuid: () => 'id-' + (++uuid), formatDate: () => '202610' };
    const codice = fs.readFileSync(path.join(root, 'assistente', 'Codice.gs'), 'utf8') + '\n' + fs.readFileSync(path.join(root, 'assistente', 'Valutatore.gs'), 'utf8');
    const G = new Function('SpreadsheetApp', 'PropertiesService', 'LockService', 'UrlFetchApp', 'Utilities', 'ContentService', 'CacheService', codice + '\nreturn { doPost };')(SpreadsheetApp, PropertiesService, LockService, UrlFetchApp, Utilities, { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} }, (() => { const c = {}; return { getScriptCache: () => ({ get: k => c[k] || null, put: (k, v) => { c[k] = v; } }) }; })());
    const post = o => JSON.parse(G.doPost({ postData: { contents: JSON.stringify(Object.assign({ token: 'FTcdlNGgGU7WXN-L' }, o)) } }));
    ok(post({ azione: 'margini', cfg: CFG }).errore === 'Solo con la chiave di Giuseppe' && post({ azione: 'margini', cfg: CFG, chiave: 'segreta' }).cfg.passaggio === 222, 'servizio: i margini si cambiano solo con la chiave');
    const v = post({ azione: 'valuta', frase: 'Clio GPL Energy 120000 km del 2013' });
    ok(v.auto && v.auto.alimentazione === 'GPL' && v.annunci.length === 7 && v.portali.autoscout === 7 && v.portali.subito === 'errore' && v.cfg && v.cfg.passaggio === 222, `servizio: valuta legge i portali e dice quale manca (${JSON.stringify(v.portali || v.errore)})`);
    const r2 = valuta(v.auto, v.annunci, v.cfg, null);
    const s = post({ azione: 'salvaValutazione', frase: 'Clio GPL', targa: 'ab 123 cd', auto: v.auto, risultato: r2, eurotax: { giallo: 5200, blu: 3700 }, annunci: v.annunci });
    const u2 = post({ azione: 'ultime' }), a2 = post({ azione: 'apri', id: s.id });
    ok(u2.valutazioni.length === 1 && u2.valutazioni[0].targa === 'AB123CD' && a2.eurotax.giallo === 5200 && a2.annunci.length === 7, 'servizio: valutazione salvata, nelle ultime e riapribile con Eurotax');
    // revisione finale: un portale che cade, che cambia formato, carburante scritto a mano, annunci salvati ripuliti
    const gemini = UrlFetchApp.fetch, chiesti = [];
    UrlFetchApp.fetchAll = rs => { rs.forEach(r => chiesti.push(r.url)); throw new Error('Address unavailable'); };
    UrlFetchApp.fetch = u => { if (/generativelanguage/.test(u)) return gemini(); chiesti.push(u); if (/subito/.test(u)) throw new Error('DNS error'); return /autoscout/.test(u) ? risposta(200, pagina) : risposta(200, '<html></html>'); };
    const v1 = post({ azione: 'valuta', frase: 'Clio GPL Energy 120000 km del 2013' });
    ok(!v1.errore && v1.portali && v1.portali.autoscout === 7 && v1.portali.subito === 'errore', `servizio: un portale irraggiungibile non ferma la valutazione (${JSON.stringify(v1.portali || v1.errore)})`);
    UrlFetchApp.fetchAll = rs => rs.map(r => { chiesti.push(r.url); return /autoscout/.test(r.url) ? risposta(200, nd({ props: { pageProps: {} } })) : risposta(200, '<html></html>'); });
    const v2 = post({ azione: 'valuta', frase: 'Clio GPL Energy 120000 km del 2013' });
    ok(v2.portali && v2.portali.autoscout === 'errore', `servizio: portale con la pagina cambiata segnalato come mancante, non come 0 (${JSON.stringify(v2.portali)})`);
    chiesti.length = 0;
    const v3 = post({ azione: 'valuta', auto: Object.assign({}, v.auto, { alimentazione: 'gpl' }) });
    ok(v3.auto && v3.auto.alimentazione === 'GPL' && chiesti.some(u => /autoscout/.test(u) && /fuel=L/.test(u)), 'servizio: carburante corretto a mano ("gpl") riconosciuto');
    const brutto = { portale: 'autoscout', id: 'z', titolo: 'Clio', marca: 'Renault', modello: 'Clio', alimentazione: 'GPL', anno: '2013<b>', km: 1, prezzo: 5000, venditore: '<img src=x onerror=alert(1)>', url: 'javascript:alert(1)', citta: 'Roma', extra: 'boh' };
    const s2 = post({ azione: 'salvaValutazione', frase: 'prova', auto: v.auto, risultato: r2, annunci: [brutto] });
    const a3 = post({ azione: 'apri', id: s2.id }).annunci[0] || {};
    ok(a3.venditore === 'privato' && a3.url === '' && a3.anno === 0 && !('extra' in a3), `servizio: annunci salvati ripuliti (${JSON.stringify(a3)})`);
    // revisione ChatGPT: anche il controllo delle foto (telecamera, tetto) ha un limite orario, separato dalle domande
    let ultima = null;
    for (let i = 0; i < 401; i++) ultima = post({ azione: 'telecamera', foto: [] });
    ok(/Troppi controlli/.test(ultima.errore || ''), `servizio: controllo foto con limite orario (${ultima.errore})`);
    ok(!post({ azione: 'valuta', frase: 'Clio GPL Energy 120000 km del 2013' }).errore, 'servizio: il limite delle foto non blocca le valutazioni');
  }
  // revisione finale: vendute solo nella stessa fascia di km, dati mancanti, carburante scritto a mano
  {
    const Q2 = new Function(fs.readFileSync(path.join(root, 'assistente', 'Valutatore.gs'), 'utf8') + '\nreturn { venduti, finestraKm };')();
    const vecchia = { id: 'a', portale: 'autoscout', km: 120000, prezzo: 6000, ultimaVista: '2026-10-20T09:00:00Z' };
    ok(Q2.venduti([vecchia], [], new Date('2026-10-22T10:00:00'), { autoscout: true }, Q2.finestraKm({ km: 50000 })).length === 0 && Q2.venduti([vecchia], [], new Date('2026-10-22T10:00:00'), { autoscout: true }, Q2.finestraKm({ km: 118000 })).length === 1, 'storico: venduta solo se rientra nei km cercati oggi');
    const senzaAnno = valuta({ marca: 'Renault', modello: 'Clio', alimentazione: 'GPL', km: 120000 }, lotto, CFG, null);
    ok(!senzaAnno.ok && /anno/i.test(senzaAnno.motivo), 'valutatore: senza anno non da un valore');
    const senzaAlim = valuta(Object.assign({}, CLIO, { alimentazione: '' }), lotto, CFG, null);
    ok(senzaAlim.ok && senzaAlim.note.some(n => /carburante/i.test(n)), 'valutatore: senza carburante avvisa che mescola i carburanti');
    const senzaKm = valuta(Object.assign({}, CLIO, { km: 0 }), lotto, CFG, null);
    ok(senzaKm.ok && !senzaKm.note.some(n => /corrette per i km/.test(n)) && senzaKm.note.some(n => /km/i.test(n)), 'valutatore: senza km non dice "corrette per i km" e avvisa');
    ok(simili(Object.assign({}, CLIO, { alimentazione: 'gpl' }), lotto).length === 7 && simili(Object.assign({}, CLIO, { alimentazione: 'Gasolio' }), [A(6000, 120000, 2013, { alimentazione: 'Diesel' })]).length === 1, 'valutatore: carburante scritto a mano ("gpl", "Gasolio") riconosciuto');
  }
  // tetto apribile / in vetro: stessa regola della telecamera (dotazioni del sito + conferma dalle foto)
  {
    const { tettoDaPagina } = require('./annunci.js');
    const pag = '"equipmentStandardList":["Barre longitud.al tetto nero","Spoiler al tetto","Tetto black","Tetto in contrasto","Cielo in grigio luce","Scomparto portaoggetti al tetto"],"equipmentOptionalList":["Tetto apribile anteriore di vetro , elettrico, a compasso e scorrevole"]';
    ok(tettoDaPagina(pag) === 'Tetto apribile anteriore di vetro , elettrico, a compasso e scorrevole', `tetto: dalle dotazioni solo il tetto vero, non barre, spoiler o colore (${tettoDaPagina(pag)})`);
    ok(tettoDaPagina('"equipmentList":["Tetto Panorama con tendina parasole","Tetto in cristallo"]') === 'Tetto Panorama con tendina parasole · Tetto in cristallo', 'tetto: panorama e cristallo riconosciuti');
    const V0 = buildVocab([]);
    const qa = parseQuery('tetto apribile', V0), qv = parseQuery('tetto panoramico', V0);
    const auto = (lista, esito) => ({ _h: '', web: { tettoLista: lista, tetto: esito ? { esito } : undefined } });
    // apribile = in una foto il tetto e' APERTO (cosi' vengono fotografate, dice Giuseppe); 'vetro' = vetro visto ma chiuso
    const apribile = auto('Tetto Panorama con tendina parasole', 'si'), panorama = auto('Tetto apribile anteriore di vetro , elettrico, a compasso e scorrevole', 'vetro');
    ok(qa.chips.includes('Tetto apribile confermato') && matchQuery(apribile, qa) && !matchQuery(panorama, qa), `tetto: "tetto apribile" trova solo quelli fotografati aperti (${qa.chips.join(' · ')})`);
    ok(qv.chips.includes('Tetto apribile confermato') && matchQuery(apribile, qv) && !matchQuery(panorama, qv), 'tetto: anche "tetto panoramico" vale solo se fotografato aperto (il resto si ignora)');
    ok(!matchQuery(auto('Tetto apribile anteriore di vetro', 'no'), qa) && !matchQuery(auto('Tetto apribile anteriore di vetro', null), qa), 'tetto: senza conferma dalle foto non compare');
  }
  // coda delle mail: una mail resta in coda finche' non parte; se fallisce si riprova al giro dopo (al massimo 5 volte)
  {
    const { svuotaCoda } = require('./coda-posta.js');
    const os = require('os'), fc = path.join(os.tmpdir(), 'prova-coda-posta.json'), log = [];
    fs.writeFileSync(fc, JSON.stringify([{ to: 'a@x.it', subject: 'uno' }, { to: 'rotta@x.it', subject: 'due' }, { to: 'c@x.it', subject: 'tre' }]));
    const invia = async m => { if (/rotta/.test(m.to)) throw new Error('SMTP giu'); };
    const e1 = await svuotaCoda(fc, invia, t => log.push(t));
    const resto = JSON.parse(fs.readFileSync(fc, 'utf8'));
    ok(e1.inviate === 2 && resto.length === 1 && resto[0].to === 'rotta@x.it' && resto[0].tentativi === 1, `coda mail: quella non partita resta in coda per il giro dopo (${JSON.stringify(e1)})`);
    for (let i = 0; i < 4; i++) await svuotaCoda(fc, invia, t => log.push(t));
    ok(!fs.existsSync(fc) && log.some(t => /abbandono/.test(t)), 'coda mail: dopo 5 tentativi la abbandona e lo scrive nel registro');
    fs.writeFileSync(fc, JSON.stringify([{ to: 'rotta@x.it', subject: 'x', tentativi: 1 }]));
    const e2 = await svuotaCoda(fc, async () => {}, () => {});
    ok(e2.inviate === 1 && !fs.existsSync(fc), 'coda mail: al giro dopo parte e la coda si svuota');
    if (process.platform === 'win32') {
      const r = require('child_process').spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'prova-coda.ps1')], { encoding: 'utf8' });
      ok(r.status === 0 && /TUTTO OK/.test(r.stdout), `coda mail del PC (Outlook): stessa regola ${(r.stdout + r.stderr).trim().split('\n').slice(-3).join(' | ')}`);
    }
  }
  // carburante: "E- HYBRID" con lo spazio (stampa troncata) e' un'ibrida plug-in, non un'elettrica
  {
    const { describe } = new Function(['parser.js', 'norm.js'].map(src).join('\n') + '\nreturn { describe };')();
    const f = describe('FORMENTOR 1.4 ELECTRIC/TSI E- HYBRID 150KW 6- SPEED', 'CUPRA', '');
    ok(f.fuel === 'Plug-in', `carburante: Formentor "E- HYBRID" riconosciuta plug-in (${f.fuel})`);
    ok(describe('GOLF GTE 1.4 TSI', 'VW', '').fuel === 'Plug-in' && describe('ID.3 PRO 58 KWH', 'VW', '').fuel === 'Elettrica', 'carburante: GTE e ID.3 come prima');
    ok(describe('500 MY22 1.0 GSE HYBRID CLUB 5', 'FIAT', '').fuel === 'Ibrida' && describe('PANDA 1.0 FIREFLY S&S HYBRID', 'FIAT', '').fuel === 'Ibrida', 'carburante: Fiat 500 e Panda "GSE HYBRID" sono ibride leggere, non plug-in');
  }
  // AutoScout: se restano due annunci possibili, si guarda il modello; se il dubbio resta, nessun abbinamento
  {
    const { abbinaAutoscout } = require('./mercato.js');
    const auto = [{ targa: 'AA111AA', brand: 'Volkswagen', family: 'T-Roc', km: 30000, imm: '2023-03', prezzo: 25000, as: true }];
    const ann = (id, modello) => ({ id, url: 'https://www.autoscout24.it/a/' + id, marca: 'Volkswagen', modello, km: 30000, imm: '2023-03', prezzo: 25000, giudizio: 'fair-price', contatti: 'Some' });
    const r1 = abbinaAutoscout(auto, [], { annunci: [ann('g', 'Golf'), ann('t', 'T-Roc')] });
    ok(r1.get('AA111AA') && r1.get('AA111AA').id === 't', 'AutoScout: tra due annunci uguali vince quello dello stesso modello');
    const r2 = abbinaAutoscout(auto, [], { annunci: [ann('x', 'T-Roc'), ann('y', 'T-Roc')] });
    ok(!r2.has('AA111AA'), 'AutoScout: due annunci indistinguibili, nessun abbinamento');
  }
  // revisione ChatGPT: la stessa auto su piu' portali conta una volta; qualita' del confronto dichiarata
  {
    const copie = ['autoscout', 'subito', 'automobile', 'autoscout', 'subito'].map((p, i) => A(6300, 120000, 2013, { portale: p, id: p + i }));
    const cp = valuta(CLIO, copie, CFG, null);
    ok(!cp.ok && cp.n === 1, `valutatore: 5 copie della stessa auto contano come 1 (${cp.n})`);
    ok(rv.qualita === 'indicativo' && rv.note.some(n => /Confronto indicativo/.test(n)), `valutatore: con 7 auto il confronto e' dichiarato indicativo (${rv.qualita})`);
    const tante = Array.from({ length: 16 }, (_, i) => A(6000 + i * 37, 110000 + i * 1500, 2013));
    ok(valuta(CLIO, tante, CFG, null).qualita === 'buono', 'valutatore: con 15 o piu\' auto il confronto e\' buono');
  }
  // Km 0: dalla sezione della stampa (VW KM0, REMARKETING ... KM0) oppure dal sito
  {
    const { km0, parseQuery: pq, matchQuery: mq, buildVocab: bv } = new Function(['parser.js', 'norm.js', 'query.js'].map(src).join('\n') + '\nreturn { km0, parseQuery, matchQuery, buildVocab };')();
    const a = (section, web) => ({ _h: '', section, web });
    ok(km0(a('VW KM0')) && km0(a('REMARKETING EUROPA-500 KM0')) && km0(a('POLO BENZINA', { km0: true })) && !km0(a('POLO BENZINA - LIFE 95CV MAN.')) && !km0(a('T-ROC BENZINA', { km0: false })), 'km0: riconosciuta dalla sezione della stampa o dal sito');
    const Q0 = pq('polo km0', bv([])), Q1 = pq('km 0', bv([]));
    ok(Q0.chips.includes('Km 0') && Q1.chips.includes('Km 0') && mq(a('VW KM0'), Q1) && !mq(a('POLO BENZINA'), Q1), `km0: la ricerca "km0" o "km 0" trova solo le Km 0 (${Q0.chips.join(' · ')})`);
    ok(!pq('golf meno di 40.000 km', bv([])).chips.includes('Km 0'), 'km0: "meno di 40.000 km" non diventa Km 0');
  }
  // prezzo diverso dal sito: in cosa differisce (passaggio incluso per sbaglio, oppure prezzo proprio diverso)
  {
    const { sitoDiverso } = new Function(['parser.js', 'norm.js', 'query.js'].map(src).join('\n') + '\nreturn { sitoDiverso };')();
    const conPass = sitoDiverso({ prezzoV: 19540, pp: 560, prezzo: 20100, web: { prezzo: 20100 } });
    ok(conPass && conPass.passaggio && conPass.diff === 560 && /passaggio/.test(conPass.testo) && /20\.100/.test(conPass.testo) && /19\.540/.test(conPass.testo), `sito: prezzo con il passaggio riconosciuto (${conPass && conPass.testo})`);
    const piuBasso = sitoDiverso({ prezzoV: 19540, pp: 700, prezzo: 20240, web: { prezzo: 18540 } });
    ok(piuBasso && !piuBasso.passaggio && piuBasso.diff === -1000 && /1\.000 € piu' basso|1\.000 € più basso/.test(piuBasso.testo), `sito: prezzo piu' basso spiegato (${piuBasso && piuBasso.testo})`);
    ok(sitoDiverso({ prezzoV: 19540, web: { prezzo: 19540 } }) === null && sitoDiverso({ prezzoV: 19540 }) === null, 'sito: stesso prezzo o senza annuncio, niente differenza');
  }
  // cartello salone: dati dall'annuncio (cilindrata, Euro, riga dell'offerta, dotazioni)
  {
    const { dettagliAnnuncio } = require('./annunci.js');
    const vw = dettagliAnnuncio({ displacement: 1984, make: 'Volkswagen', description: 'Propone VW GOLF.<br/>La vettura rispetta la normativa antinquinamento Euro6.Vettura in offerta a soli &#x20ac;38.450,00 valida con progetto valore della durata di 36 Mesi.<br/>La rata comprende' });
    ok(vw.cc === 1984 && vw.euro === 'Euro 6' && vw.offerta === 'OFFERTA VALIDA CON PROGETTO VALORE VOLKSWAGEN 36 MESI', `cartello: dati VW dall'annuncio (${JSON.stringify(vw)})`);
    const fiat = dettagliAnnuncio({ displacement: 999, make: 'Fiat', description: 'normativa antinquinamento Euro 6d-TEMP. Vettura in offerta a soli 13.450,00 valida con finanziamento.<br></p>' });
    ok(fiat.euro === 'Euro 6d-TEMP' && fiat.offerta === 'OFFERTA VALIDA CON FINANZIAMENTO', `cartello: dati altre marche (${JSON.stringify(fiat)})`);
    ok(dettagliAnnuncio({}).cc === 0 && dettagliAnnuncio({}).offerta === '', 'cartello: annuncio senza dati, campi vuoti');
    // il servizio Google legge le dotazioni dalla pagina dell'annuncio (assistente/Codice.gs)
    const gs = fs.readFileSync(path.join(root, 'assistente', 'Codice.gs'), 'utf8'), da = gs.indexOf('function elencoPagina_'), a = gs.indexOf('function paginaAnnuncio_');
    const { elencoPagina_, datiPagina_ } = new Function(gs.slice(da, a) + ';return { elencoPagina_, datiPagina_ };')();
    const pg = datiPagina_('"displacement":999,"equipmentList":["Navigatore"] <p>La vettura rispetta la normativa antinquinamento Euro6.Vettura in offerta a soli &#x20ac;13.450,00 valida con progetto valore della durata di 36 Mesi.</p>', true);
    ok(pg.cc === 999 && pg.euro === 'Euro 6' && pg.offerta === 'OFFERTA VALIDA CON PROGETTO VALORE VOLKSWAGEN 36 MESI' && pg.dot.join() === 'Navigatore', `cartello: il servizio legge cilindrata, Euro e offerta dalla pagina (${JSON.stringify(pg)})`);
    ok(elencoPagina_('x"equipmentStandardList":["ABS",["a"],"Navigatore"],"y":1', 'equipmentStandardList').join('|') === 'ABS|["a"]|Navigatore' && elencoPagina_('niente', 'equipmentList').length === 0, 'cartello: il servizio legge l\'elenco dotazioni dalla pagina');
  }
  // cartello salone: modello giusto, campi compilati come i cartelli di Valentino, testo che entra negli spazi
  {
    const { datiCartello, compilaCartello } = new Function(src('cartello.js') + '\nreturn { datiCartello, compilaCartello };')();
    const golf = { targa: 'GP327AA', brand: 'Volkswagen', family: 'Golf', modello: 'GOLF 8 GTI 2.0 TSI 245CV DSG', imm: '2021-07', km: 44592, kw: 180, cv: 245, cambio: 'Automatico', fuel: 'Benzina', prezzoV: 31950, pp: 1000, prezzo: 32950, spec: false,
      web: { cc: 1984, euro: 'Euro 6', garanzia: 12, offerta: 'OFFERTA VALIDA CON PROGETTO VALORE VOLKSWAGEN 36 MESI' } };
    const scelte = { nome: 'Volkswagen Golf 2.0 TSI GTI 245 CV DSG', righe: ['CERCHI IN LEGA 19" - FARI LED MATRIX - NAVIGATORE', 'DIGITAL COCKPIT PRO - CLIMATRONIC 3 ZONE', 'PARK PILOT - RETROCAMERA - KEYLESS'] };
    const g = datiCartello(golf, scelte);
    ok(g.file === 'schedaVW-UsatoCertificato-2023.pdf' && !g.ps, `cartello: VW -> Usato Certificato (${g.file})`);
    ok(g.campi['NOME 2'] === 'Volkswagen Golf 2.0 TSI GTI 245 CV DSG' && g.campi['9'] === '2.0' && g.campi['10'] === '180/245' && g.campi['11'] === 'Automatico' && g.campi['12'] === 'Benzina' && g.campi['13'] === 'Euro 6' && g.campi['14'] === '07/2021' && g.campi['15'] === '44.592' && g.campi['16'] === '12 mesi', `cartello: dati tecnici (${JSON.stringify(g.campi).slice(0, 200)})`);
    ok(g.campi.TESTO10 === scelte.righe[0] && g.campi.TESTO11 === scelte.righe[1] && g.campi.TESTO12 === scelte.righe[2] && g.campi.TESTO16 === golf.web.offerta, 'cartello: righe delle dotazioni nell\'ordine del modello VW, offerta in fondo');
    ok(g.campi['prezzo veicolo 4'] === '31.950' && g.campi['prezzo veicolo 5'] === '1.000' && g.campi['prezzo veicolo 6'] === '32.950', 'cartello: prezzo veicolo, passaggio, totale');
    ok(g.nomeFile === 'Volkswagen Golf 2.0 TSI GTI 245 CV DSG GP327AA.pdf', `cartello: nome del file (${g.nomeFile})`);
    const fiat = { targa: 'GH268NJ', brand: 'Fiat', family: '500', modello: '500 1.0 HYBRID SPORT', imm: '2021-01', km: 30274, kw: 51, cv: 70, cambio: 'Manuale', fuel: 'Ibrida', prezzoV: 13950, pp: 500, prezzo: 14450, spec: true, web: { cc: 999, garanzia: 12 } };
    const f = datiCartello(fiat);
    ok(f.file === 'PS-scheda-UsatoSelezionato-2023.pdf' && f.ps && f.campi.NOME === 'Fiat 500 1.0 Hybrid Sport' && f.campi['4'] === 'Benzina/Ibrida' && f.campi['prezzo veicolo 2'] === '500,00' && f.campi['1'] === '1.0', `cartello: altre marche a prezzo speciale -> PS Usato Selezionato (${f.file}, ${f.campi.NOME})`);
    const daServizio = datiCartello(Object.assign({}, fiat, { web: { garanzia: 12 } }), { righe: [], cc: 1498, euro: 'Euro 6d', offerta: 'OFFERTA VALIDA CON FINANZIAMENTO' });
    ok(daServizio.campi['1'] === '1.5' && daServizio.campi['5'] === 'Euro 6d' && daServizio.campi.TESTO8 === 'OFFERTA VALIDA CON FINANZIAMENTO', 'cartello: cilindrata, Euro e offerta letti dal servizio quando i dati dello stock non li hanno ancora');
    ok(!datiCartello(Object.assign({}, fiat, { spec: false })).ps && datiCartello(fiat).campi.TESTO1 === '', 'cartello: senza prezzo speciale niente PS; senza scelte dell\'assistente righe vuote');
    // compilazione vera del PDF con pdf-lib, come fa l'app
    const PDFLib = require('pdf-lib');
    const pdf = await compilaCartello(PDFLib, fs.readFileSync(path.join(root, 'cartelli', g.file)), g);
    const letto = (await PDFLib.PDFDocument.load(pdf)).getForm();
    ok(Object.entries(g.campi).every(([k, v]) => (letto.getTextField(k).getText() || '') === v), 'cartello: PDF compilato, ogni campo contiene il suo valore');
    ok(pdf.misure.every(m => m.larghezza <= m.spazio + 0.5), `cartello: ogni testo entra nel suo spazio (${pdf.misure.filter(m => m.ridotto).map(m => m.campo + ' ' + m.dimensione + 'pt').join(', ') || 'nessuno ridotto'})`);
  }
  //__VALUTATORE__
  console.log(errori ? `\n${errori} controlli falliti` : '\nTutto in ordine');
  process.exit(errori ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
