// Prepara le mail che l'agente spedisce da Outlook: riepilogo del giorno, avvisi delle ricerche salvate,
// conferme di iscrizione e allarmi. Scrive tutto in agente/posta-da-inviare.json; l'invio lo fa aggiorna-stock.ps1.
// Uso: node agente/posta.js riepilogo | avvisi | richieste | allarme <mancante|errore> [testo]
const fs = require('fs'), path = require('path');

const root = path.join(__dirname, '..');
const qui = f => path.join(__dirname, f), dati = f => path.join(root, 'data', f);
const APP = 'https://giuseppecavalli303.github.io/gestore-stock/';
const IO = 'giuseppe.cavalli@valentinoautomobili.it';
const DOMINIO = '@valentinoautomobili.it';
const FOTO = 'https://cdn.dealerk.it/dealer/datafiles/vehicle/images/200/';

const src = f => fs.readFileSync(path.join(root, 'sorgenti', f), 'utf8');
const { buildVocab, parseQuery, matchQuery, deacc } = new Function(src('norm.js') + '\n' + src('query.js') + '\nreturn { buildVocab, parseQuery, matchQuery, deacc };')();

const leggi = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return def; } };
const N = n => Math.round(n || 0).toLocaleString('it-IT', { useGrouping: 'always' });
const eur = n => (n ? N(n) + ' €' : 'prezzo non inserito');
const dIt = iso => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const imm = c => (c.imm ? c.imm.slice(5, 7) + '/' + c.imm.slice(0, 4) : '');
const etichetta = c => (c.free ? 'Libera' : c.booked && c.st < 2 ? 'Prenotata' : c.stato);

const coda = leggi(qui('posta-da-inviare.json'), []);
const accoda = (to, subject, corpo) => { if (to && /@/.test(to)) coda.push({ to, subject, html: pagina(subject, corpo) }); };
const salvaCoda = () => fs.writeFileSync(qui('posta-da-inviare.json'), JSON.stringify(coda, null, 1));

/* ---------- impaginazione mail (stili in linea: i client di posta ignorano i fogli di stile) ---------- */
function pagina(titolo, corpo) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f7">
<div style="max-width:640px;margin:0 auto;padding:18px 14px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0c1a2b;font-size:14px;line-height:1.45">
<div style="font-size:12px;color:#5b6b80;margin-bottom:6px">Gestore stock usato · Valentino Automobili</div>
<h1 style="font-size:20px;margin:0 0 14px">${esc(titolo)}</h1>${corpo}
<p style="margin-top:22px;font-size:12px;color:#5b6b80">Messaggio automatico preparato dall'agente dello stock. <a href="${APP}" style="color:#0a5cf5">Apri lo stock</a></p>
</div></body></html>`;
}
const sezione = (titolo, righe) => (righe.length ? `<h2 style="font-size:15px;margin:20px 0 8px">${esc(titolo)}</h2><table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${righe.join('')}</table>` : '');
function rigaAuto(c, extra) {
  const foto = c.web && c.web.foto && c.web.foto[0] ? `<img src="${FOTO + c.web.foto[0]}" width="84" style="border-radius:8px;display:block" alt="">` : '';
  const link = c.web && c.web.url ? ` · <a href="${c.web.url}" style="color:#0a5cf5">annuncio</a>` : '';
  return `<tr><td style="padding:8px 10px 8px 0;border-bottom:1px solid #dde3ea;width:84px;vertical-align:top">${foto}</td>
<td style="padding:8px 0;border-bottom:1px solid #dde3ea;vertical-align:top"><b>${esc(c.brand)} ${esc(c.family)}</b> <span style="color:#5b6b80">${esc(c.targa)}</span><br>
<span style="color:#44556a;font-size:13px">${esc(c.modello)}</span><br>
<span style="font-size:13px">${esc(imm(c))} · ${N(c.km)} km · ${esc(c.fuel)} · ${esc(c.cambio)} · <b>${eur(c.prezzo)}</b> · ${esc(etichetta(c))} · ${esc(c.ubic)}</span>
${extra ? `<br><span style="font-size:13px;color:#a85f00">${extra}</span>` : ''}<br>
<a href="${APP}#${encodeURIComponent(c.targa)}" style="color:#0a5cf5;font-size:13px">apri nello stock</a>${link}</td></tr>`;
}

function destinatari() {
  const f = qui('destinatari.txt');
  if (!fs.existsSync(f)) return [IO];
  const l = fs.readFileSync(f, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#') && /@/.test(s));
  return l.length ? l : [IO];
}

function caricaStock() {
  const cur = leggi(dati('stock.json'), null), prev = leggi(dati('prev.json'), null), sto = leggi(dati('storico.json'), null);
  if (!cur) throw new Error('data/stock.json mancante');
  cur.cars.forEach(c => { c._h = deacc([c.targa, c.brand, c.family, c.modello, c.colore, c.ubic, c.vend, c.acq, c.note, c.section, c.stato, c.antic].join(' ').toLowerCase()); });
  const pm = prev ? new Map(prev.cars.map(c => [c.targa, c])) : null;
  return { cur, prev, pm, sto };
}

/* ---------- riepilogo del giorno ---------- */
function riepilogo() {
  const { cur, prev, pm } = caricaStock();
  const day = cur.meta.day, cs = cur.cars;
  // le tre sezioni chieste da Giuseppe per i venditori
  // pronta da vendere = libera, con prezzo e pubblicata (annuncio sul sito o AutoScout)
  const pronta = c => c && c.free && c.prezzo > 0 && (!!c.web || !!c.as);
  // 1. nuovi arrivi: diventate pronte da vendere dall'ultima stampa (anche se entrate prima ma prezzate/pubblicate solo ora)
  const nuovi = cs.filter(c => pronta(c) && !(pm && pronta(pm.get(c.targa)))).sort((a, b) => (a.giorni ?? 0) - (b.giorni ?? 0));
  // 2. abbassamenti di prezzo sulle auto libere
  const ribassi = pm ? cs.filter(c => { const p = pm.get(c.targa); return c.free && p && p.prezzo > 0 && c.prezzo > 0 && c.prezzo < p.prezzo; }).map(c => [c, pm.get(c.targa).prezzo]).sort((a, b) => (a[0].prezzo - a[1]) - (b[0].prezzo - b[1])) : [];
  // 3. stock anziano: libere con prezzo ferme da almeno 90 giorni, le piu' vecchie prima
  const anziane = cs.filter(c => c.free && c.prezzo > 0 && (c.giorni ?? 0) >= 90).sort((a, b) => b.giorni - a.giorni);
  // 4. le proposte approvate da Giuseppe
  const prenotate = pm ? cs.filter(c => c.booked && !(pm.get(c.targa) || {}).booked) : [];
  const nascoste = cs.filter(c => c.free && (c.giorni ?? 0) >= 90 && !(c.web && c.web.foto && c.web.foto.length)).sort((a, b) => b.giorni - a.giorni);
  const arrivo = cs.filter(c => c.st === 7 && !(pm && (pm.get(c.targa) || {}).st === 7));
  const MOSTRA = 15;
  const tutte = (n, q) => (n > MOSTRA ? `<p style="font-size:13px"><a href="${APP}?q=${encodeURIComponent(q)}" style="color:#0a5cf5">Vedi tutte le ${N(n)} nello stock</a></p>` : '');
  const ora = cur.meta.printDate ? cur.meta.printDate.slice(11) : '';
  const box = (v, l) => `<td style="padding:10px 12px;background:#ffffff;border-radius:10px;text-align:left"><div style="font-size:20px;font-weight:700">${v}</div><div style="font-size:12px;color:#5b6b80">${l}</div></td>`;
  let corpo = `<p style="margin:0 0 12px;color:#44556a">Stampa del ${dIt(day)} ore ${ora}${prev ? `, confronto con quella del ${dIt(prev.meta.day)}` : ''}.</p>
<table role="presentation" cellpadding="0" cellspacing="6" style="width:100%"><tr>${box(N(nuovi.length), 'nuove pronte da vendere')}${box(N(ribassi.length), 'prezzi abbassati')}${box(N(anziane.length), 'libere da 90+ giorni')}</tr></table>`;
  corpo += sezione(`1. Nuovi arrivi pronti da vendere (${nuovi.length})`, nuovi.map(c => rigaAuto(c)));
  if (!nuovi.length) corpo += `<p style="font-size:13px;color:#5b6b80">Nessuna auto nuova con prezzo e annuncio da ieri.</p>`;
  corpo += sezione(`2. Prezzi abbassati (${ribassi.length})`, ribassi.map(([c, era]) => rigaAuto(c, `era ${eur(era)}, ribassata di ${eur(era - c.prezzo)}`)));
  if (!ribassi.length) corpo += `<p style="font-size:13px;color:#5b6b80">Nessun ribasso da ieri.</p>`;
  corpo += sezione(`3. Da spingere: libere in stock da più tempo (${anziane.length})`, anziane.slice(0, MOSTRA).map(c => rigaAuto(c, `${c.giorni} giorni in stock`)));
  corpo += tutte(anziane.length, 'libere da più di 90 giorni');
  corpo += sezione(`4. Prenotate dall'ultima stampa (${prenotate.length})`, prenotate.slice(0, MOSTRA).map(c => rigaAuto(c, c.vend ? 'venditore: ' + esc(c.vend) : '')));
  corpo += sezione(`5. Ferme da 90+ giorni senza annuncio o foto sul sito (${nascoste.length})`, nascoste.slice(0, MOSTRA).map(c => rigaAuto(c, `${c.giorni} giorni in stock: nessuno la vede online`)));
  corpo += tutte(nascoste.length, 'libere da più di 90 giorni senza annuncio');
  corpo += sezione(`6. Nuove in arrivo (${arrivo.length})`, arrivo.slice(0, MOSTRA).map(c => rigaAuto(c, 'in arrivo: si può già proporre')));
  corpo += tutte(arrivo.length, 'in arrivo');
  const titolo = `Stock usato ${dIt(day).slice(0, 5)}: ${nuovi.length} nuove pronte, ${ribassi.length} ribassi, ${prenotate.length} prenotate, ${arrivo.length} in arrivo`;
  for (const to of destinatari()) accoda(to, titolo, corpo);
}

/* ---------- ricerche salvate ---------- */
const registro = () => leggi(qui('ricerche.json'), { ricerche: [], gestite: [] });
const salvaRegistro = r => fs.writeFileSync(qui('ricerche.json'), JSON.stringify(r, null, 1));

function richieste() {
  const letto = leggi(qui('richieste.json'), []), req = Array.isArray(letto) ? letto : [letto], reg = registro();
  const { cur } = caricaStock();
  const vocab = buildVocab(cur.cars);
  for (const r of req) {
    if (reg.gestite.includes(r.id)) continue;
    reg.gestite.push(r.id);
    const email = String(r.email || '').toLowerCase();
    if (!email.endsWith(DOMINIO)) continue;                       // solo colleghi
    const ogg = String(r.oggetto || '').replace(/^\s*((r|re|i|fw|fwd|inoltra)\s*:\s*)+/i, '');
    const stop = /^\s*stop\s+avviso/i.test(ogg);
    let testo = ogg.replace(/^\s*(stop\s+)?avviso\s+stock\s*:?\s*/i, '').trim();
    if (!testo && !stop) testo = String(r.corpo || '').split(/\r?\n/).map(s => s.trim()).find(Boolean) || '';
    if (stop) {
      const prima = reg.ricerche.length;
      reg.ricerche = reg.ricerche.filter(x => x.email !== email || (testo && deacc(x.query) !== deacc(testo)));
      accoda(email, 'Avviso stock fermato', `<p>Ho fermato ${prima - reg.ricerche.length === 1 ? "l'avviso" : `${prima - reg.ricerche.length} avvisi`} a tuo nome. Per attivarne uno nuovo scrivi a ${IO} con oggetto <b>AVVISO STOCK: la tua ricerca</b>.</p>`);
      continue;
    }
    const Q = parseQuery(testo, vocab);
    // valida se contiene almeno un filtro riconosciuto, oppure parole che oggi trovano qualche auto
    const valida = Q.chips.length > Q.terms.length || (Q.terms.length && cur.cars.some(c => matchQuery(c, Q)));
    if (!testo || !valida) {
      accoda(email, 'Avviso stock: ricerca non capita', `<p>Non ho capito cosa cercare. Scrivi a ${IO} con oggetto, ad esempio:</p><p><b>AVVISO STOCK: golf diesel automatica sotto 25000</b></p><p>Puoi usare modello, alimentazione, cambio, colore, prezzo, chilometri, anno e ubicazione, come nella ricerca dello stock.</p>`);
      continue;
    }
    if (!reg.ricerche.some(x => x.email === email && deacc(x.query) === deacc(testo))) reg.ricerche.push({ email, nome: r.nome || '', query: testo, dal: new Date().toISOString().slice(0, 10) });
    const oggi = cur.cars.filter(c => !c.booked && matchQuery(c, Q));
    accoda(email, `Avviso stock attivo: ${testo}`, `<p>Ti scrivo quando entra in stock un'auto che corrisponde a:</p><p><b>${Q.chips.map(esc).join(' · ')}</b></p>
<p>Oggi ce ne sono già ${oggi.length} non prenotate: <a href="${APP}?q=${encodeURIComponent(testo)}" style="color:#0a5cf5">vedile nello stock</a>.</p>
<p style="color:#5b6b80;font-size:13px">Per fermare l'avviso scrivi a ${IO} con oggetto <b>STOP AVVISO</b>.</p>`);
  }
  salvaRegistro(reg);
}

function avvisi() {
  const { cur, pm } = caricaStock();
  if (!pm) return;
  const reg = registro(), vocab = buildVocab(cur.cars);
  const nuovi = cur.cars.filter(c => !pm.has(c.targa) && !c.booked);
  for (const r of reg.ricerche) {
    const Q = parseQuery(r.query, vocab);
    const trovate = nuovi.filter(c => matchQuery(c, Q));
    if (!trovate.length) continue;
    accoda(r.email, `${trovate.length === 1 ? "È entrata un'auto" : `Sono entrate ${trovate.length} auto`} per la tua ricerca: ${r.query}`,
      `<p>Nuovi ingressi del ${dIt(cur.meta.day)} che corrispondono a <b>${esc(r.query)}</b>:</p>` + sezione('', trovate.map(c => rigaAuto(c))) +
      `<p style="color:#5b6b80;font-size:13px">Per fermare l'avviso scrivi a ${IO} con oggetto <b>STOP AVVISO</b>.</p>`);
  }
}

/* ---------- allarmi a te ---------- */
function allarme(tipo, testo) {
  if (tipo === 'mancante') accoda(IO, 'Stock usato: la stampa di oggi non è ancora arrivata', `<p>Alle ${new Date().toTimeString().slice(0, 5)} non ho ancora trovato in Outlook la mail con <b>stock_auto_usato….pdf</b> di oggi da Muschitiello o Quartieri.</p><p>Il sito mostra ancora la stampa precedente. Continuo a controllare ogni 10 minuti fino alle 20.</p>`);
  else accoda(IO, "Stock usato: l'agente ha un problema", `<p>L'ultimo controllo si è fermato con questo messaggio:</p><pre style="white-space:pre-wrap;background:#fff;padding:10px;border-radius:8px">${esc(testo || 'errore sconosciuto')}</pre><p>Il sito mostra l'ultima stampa pubblicata correttamente. Il registro completo è in agente\\agente.log.</p>`);
}

const [cmd, ...arg] = process.argv.slice(2);
try {
  for (const c of [cmd, ...arg]) {
    if (c === 'riepilogo') riepilogo();
    else if (c === 'avvisi') avvisi();
    else if (c === 'richieste') richieste();
  }
  if (cmd === 'allarme') allarme(arg[0], arg.slice(1).join(' '));
  salvaCoda();
  console.log(`Mail pronte: ${coda.length}.`);
} catch (e) { console.error('Posta non preparata: ' + e.message); process.exit(1); }
