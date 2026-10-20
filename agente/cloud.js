// Agente dello stock usato online (GitHub Actions): fa il lavoro di aggiorna-stock.ps1 senza PC e senza Outlook.
// Legge la posta da Plion (IMAP), lancia gli stessi script dell'agente del PC, pubblica il sito e manda le mail (SMTP),
// mettendone una copia nella Posta inviata. Le stampe PDF restano nella cartella temporanea della macchina: mai pubblicate.
// In prova (PROVA=1, oppure "prova": true in stato/config.json) non invia e non pubblica: scrive in agente/prova-posta.json
// cosa avrebbe mandato, cosi' si confronta con l'agente del PC.
// Uso: MAIL_PASSWORD=... node agente/cloud.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { ImapFlow } = require('imapflow');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');

const root = path.join(__dirname, '..');
const qui = f => path.join(__dirname, f);
const leggi = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch (e) { return def; } };
const CONFIG = leggi(qui('config.json'), {});
const PROVA = process.env.PROVA ? process.env.PROVA === '1' : CONFIG.prova !== false;
const MAIL = {
  user: process.env.MAIL_USER || 'giuseppe.cavalli@valentinoautomobili.it', pass: process.env.MAIL_PASSWORD || '', nome: 'Giuseppe Cavalli',
  imap: { host: process.env.IMAP_HOST || 'email.plion.it', port: 993, secure: true },
  smtp: { host: process.env.SMTP_HOST || 'smtp.plion.it', port: 465, secure: true }
};
const MITTENTI = /muschitiello|quartieri/i;
const ALLEGATO = /^stock_auto_usato.*\.pdf$/i;
const GIORNI_MAX = 3, ORA_ALLARME = 13;
const RE_RICHIESTA = /^\s*((r|re|i|fw|fwd)\s*:\s*)*(stop\s+avviso|avviso\s+stock)/i;
const ARRIVI = qui('arrivi');
const STATO = qui(PROVA ? 'stato-prova.json' : 'stato.json');

// ora di Roma, qualunque sia il fuso della macchina
function adesso() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { giorno: `${p.year}-${p.month}-${p.day}`, ora: +p.hour % 24, minuti: p.minute, domenica: p.weekday === 'Sun' };
}
const T = adesso();
const FATTI = [];                                    // cosa ha fatto questo giro, per stato/ultimo-giro.json
function scrivi(msg) {
  if (msg) FATTI.push(msg.split(/\r?\n/)[0].slice(0, 200));
  const riga = `${T.giorno} ${String(T.ora).padStart(2, '0')}:${T.minuti}  ${PROVA ? '[prova] ' : ''}${msg}`;
  fs.appendFileSync(qui('agente.log'), riga + '\n');
  console.log(riga);
}
// gli script stampano anche avvisi di pdf.js: tengo solo le righe utili
const pulisci = s => String(s || '').split('\n').filter(l => l.trim() && !/polyfill|Require stack|^- |canvas|^Warning/i.test(l)).join('\n').trim();
function esegui(script, ...args) {
  try { return { codice: 0, testo: pulisci(execFileSync(process.execPath, [path.join(root, script), ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })) }; }
  catch (e) { return { codice: e.status == null ? 1 : e.status, testo: pulisci((e.stdout || '') + '\n' + (e.stderr || '')) || e.message }; }
}
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const stato = () => leggi(STATO, {});
function segna(k, v) { const s = stato(); s[k] = v; fs.writeFileSync(STATO, JSON.stringify(s, null, 1)); }

function pubblica(messaggio) {
  if (!git('status', '--porcelain', 'data')) return false;
  if (PROVA) { scrivi('Non pubblicato (prova): ' + messaggio); return true; }
  git('add', 'data');
  git('commit', '-q', '-m', messaggio);
  // l'agente del PC puo' aver pubblicato i codici modello nel frattempo: mi rimetto in coda prima di inviare
  try { git('pull', '--rebase', '--autostash', '-q'); } catch (e) { throw new Error('Pubblicazione non riuscita (allineamento): ' + e.message); }
  git('push', '-q');
  scrivi('Pubblicato sul sito: ' + messaggio);
  return true;
}

/* ---------- posta ---------- */
let imap = null;
async function apriPosta() {
  if (!MAIL.pass) throw new Error('Manca la password della posta (segreto MAIL_PASSWORD).');
  imap = new ImapFlow({ ...MAIL.imap, auth: { user: MAIL.user, pass: MAIL.pass }, logger: false });
  await imap.connect();
}
async function chiudiPosta() { try { if (imap) await imap.logout(); } catch (e) {} }

function partiTesto(s, out = []) { if (!s) return out; if (s.childNodes) s.childNodes.forEach(c => partiTesto(c, out)); else out.push(s); return out; }
async function leggiTesto(uid, nodo) {
  const p = partiTesto(nodo).find(x => x.type === 'text/plain');
  if (!p) return '';
  const { content } = await imap.download(uid, p.part || '1', { uid: true, maxBytes: 4000 });
  let s = ''; for await (const b of content) s += b.toString('utf8');
  return s;
}

// una sola passata sulla posta degli ultimi giorni: stampe dello stock e richieste di avviso
async function scansiona(dal) {
  const lock = await imap.getMailboxLock('INBOX');
  try {
    const uids = await imap.search({ since: new Date(Date.now() - GIORNI_MAX * 864e5) }, { uid: true });
    const mail = [];
    if (uids && uids.length) for await (const m of imap.fetch(uids, { envelope: true, bodyStructure: true, internalDate: true }, { uid: true })) mail.push(m);
    mail.sort((a, b) => b.internalDate - a.internalDate);
    const richieste = [];
    let stampa = null;
    for (const m of mail) {
      const e = m.envelope || {}, da = (e.from || [])[0] || {}, oggetto = e.subject || '';
      if (RE_RICHIESTA.test(oggetto)) {
        if (dal && m.internalDate < new Date(dal)) continue;            // gia' gestite dall'agente del PC
        const corpo = (await leggiTesto(m.uid, m.bodyStructure)).replace(/\s+$/, '').slice(0, 300);
        richieste.push({ id: e.messageId || String(m.uid), email: da.address || '', nome: da.name || '', oggetto, corpo });
        continue;
      }
      if (stampa || !MITTENTI.test(`${da.name || ''} ${da.address || ''}`)) continue;
      const all = partiTesto(m.bodyStructure).find(p => ALLEGATO.test((p.dispositionParameters && p.dispositionParameters.filename) || (p.parameters && p.parameters.name) || ''));
      if (all) stampa = { uid: m.uid, part: all.part, nome: (all.dispositionParameters && all.dispositionParameters.filename) || all.parameters.name, quando: m.internalDate, mittente: da.name || da.address };
    }
    if (stampa && !fs.existsSync(path.join(ARRIVI, stampa.nome))) {
      fs.mkdirSync(ARRIVI, { recursive: true });
      const { content } = await imap.download(stampa.uid, stampa.part, { uid: true });
      const pezzi = []; for await (const b of content) pezzi.push(b);
      fs.writeFileSync(path.join(ARRIVI, stampa.nome), Buffer.concat(pezzi));
    }
    return { richieste, stampa };
  } finally { lock.release(); }
}

async function cartellaInviata() {
  const l = await imap.list();
  const c = l.find(x => x.specialUse === '\\Sent') || l.find(x => /^(sent|inviat|posta inviata|elementi inviati)/i.test(x.name));
  return c && c.path;
}

async function inviaPosta() {
  const f = qui('posta-da-inviare.json');
  if (!fs.existsSync(f)) return;
  let lista = leggi(f, []);
  fs.rmSync(f, { force: true });
  if (!Array.isArray(lista)) lista = [lista];
  const da = `"${MAIL.nome}" <${MAIL.user}>`;
  let smtp = null, inviata;
  for (const m of lista) {
    if (!m || !m.to) continue;
    if (PROVA) {
      const reg = leggi(qui('prova-posta.json'), []);
      reg.push({ quando: `${T.giorno} ${T.ora}:${T.minuti}`, a: m.to, oggetto: m.subject, allegati: (m.allegati || []).map(a => path.basename(a)) });
      fs.writeFileSync(qui('prova-posta.json'), JSON.stringify(reg.slice(-400), null, 1));
      scrivi(`Non inviata (prova) a ${m.to}: ${m.subject}`);
      continue;
    }
    try {
      if (!smtp) smtp = nodemailer.createTransport({ ...MAIL.smtp, auth: { user: MAIL.user, pass: MAIL.pass } });
      const allegati = (m.allegati || []).map(p => (path.isAbsolute(p) ? p : path.join(root, p))).filter(p => fs.existsSync(p)).map(p => ({ filename: path.basename(p), path: p }));
      const grezzo = await new MailComposer({ from: da, to: m.to, subject: m.subject, html: m.html, attachments: allegati }).compile().build();
      await smtp.sendMail({ envelope: { from: MAIL.user, to: m.to }, raw: grezzo });
      scrivi(`Mail inviata a ${m.to}: ${m.subject}`);
      // copia nella Posta inviata, come faceva Outlook
      try { if (inviata === undefined) inviata = await cartellaInviata(); if (inviata) await imap.append(inviata, grezzo, ['\\Seen']); } catch (e) {}
    } catch (e) { scrivi(`Mail non inviata a ${m.to}: ${e.message}`); }
  }
}

/* ---------- giro dell'agente ---------- */
// in prova il registro degli avvisi dei colleghi non deve cambiare: lo ripristino alla fine
const RICERCHE = qui('ricerche.json'), ricercheVere = PROVA && fs.existsSync(RICERCHE) ? fs.readFileSync(RICERCHE) : null;

async function main() {
  const s0 = stato();
  if (!PROVA && !s0.dal) segna('dal', new Date().toISOString());          // da quando gestisco io le richieste
  await apriPosta();
  const { richieste, stampa } = await scansiona(stato().dal || (PROVA ? null : new Date().toISOString()));

  // 1. richieste di avviso dei colleghi (in prova le leggo soltanto: il registro resta quello vero)
  if (richieste.length && !PROVA) {
    fs.writeFileSync(qui('richieste.json'), JSON.stringify(richieste));
    const r = esegui('agente/posta.js', 'richieste');
    if (r.codice) scrivi(r.testo); else await inviaPosta();
  } else if (richieste.length) scrivi(`Richieste di avviso viste: ${richieste.length} (in prova non le gestisco).`);

  // 2. stampa nuova
  let nuova = false;
  if (stampa) {
    const attuale = leggi(path.join(root, 'data', 'stock.json'), null);
    const pulito = !git('status', '--porcelain', 'data/stock.json');
    const giaFatta = PROVA ? stato().stampa === stampa.nome : pulito && attuale && attuale.meta && attuale.meta.source === stampa.nome;
    if (!giaFatta) {
      scrivi(`Trovato ${stampa.nome} da ${stampa.mittente}, ricevuto il ${new Date(stampa.quando).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}.`);
      scrivi(esegui('agente/annunci.js').testo);
      const c = esegui('agente/converti.js', path.join(ARRIVI, stampa.nome));
      scrivi(c.testo);
      if (c.codice !== 0 && c.codice !== 3) throw new Error('Stampa non pubblicata. ' + c.testo);
      if (!PROVA) scrivi(esegui('agente/telecamera.js', '--max', '60').testo);   // in prova niente: il credito Gemini lo usa gia' il PC
      // lo storico si ricostruisce da tutte le versioni pubblicate: la storia completa la scarico solo adesso che serve
      try { if (git('rev-parse', '--is-shallow-repository') === 'true') git('fetch', '--unshallow', '-q'); } catch (e) {}
      scrivi(esegui('agente/storico.js').testo);
      // in prova il sito e' gia' aggiornato dal PC: preparo comunque riepilogo e rapporto, per confrontarli
      nuova = pubblica(`Stock aggiornato dalla stampa ${stampa.nome}`) || PROVA;
      if (PROVA) segna('stampa', stampa.nome);
      const giorno = (leggi(path.join(root, 'data', 'stock.json'), {}).meta || {}).day;
      if (nuova && stato().riepilogo !== giorno) {
        const p = esegui('agente/posta.js', 'riepilogo', 'avvisi');
        if (p.codice) scrivi(p.testo); else { await inviaPosta(); segna('riepilogo', giorno); }
      }
      if (nuova && stato().rapporto !== giorno) {
        segna('rapporto', giorno);                                         // una sola presentazione al giorno, anche se qualcosa va storto
        scrivi(esegui('agente/mercato.js').testo);
        const r = esegui('agente/rapporto.js');
        scrivi(r.testo);
        if (!r.codice) await inviaPosta();
      }
      fs.readdirSync(ARRIVI).forEach(f => fs.rmSync(path.join(ARRIVI, f), { force: true }));   // le stampe non restano da nessuna parte
    }
  }

  // 3. foto e annunci dal sito, ogni 6 ore durante la giornata
  const ann = leggi(path.join(root, 'data', 'annunci.json'), {});
  const vecchi = !ann.aggiornato || Date.now() - new Date(ann.aggiornato) > 6 * 3600e3;
  if (!nuova && T.ora >= 9 && T.ora < 20 && vecchi) {
    const a = esegui('agente/annunci.js');
    scrivi(a.testo);
    if (!a.codice) {
      const b = esegui('agente/abbina.js'); if (!b.codice) scrivi(b.testo);
      if (!PROVA) scrivi(esegui('agente/telecamera.js', '--max', '60').testo);
      scrivi(esegui('agente/mercato.js').testo);
      pubblica('Foto e annunci del sito aggiornati');
    }
  }

  // 4. stampa di oggi non ancora arrivata (domenica esclusa)
  if (T.ora >= ORA_ALLARME && !T.domenica && stato().allarme !== T.giorno) {
    const giorno = (leggi(path.join(root, 'data', 'stock.json'), {}).meta || {}).day;
    if (giorno !== T.giorno && !(stampa && PROVA)) {
      const p = esegui('agente/posta.js', 'allarme', 'mancante');
      if (!p.codice) { await inviaPosta(); segna('allarme', T.giorno); scrivi('Avviso inviato: stampa di oggi non ancora arrivata.'); }
    }
  }
}

main().catch(async e => {
  scrivi('Errore: ' + e.message);
  if (stato().errore !== T.giorno) {
    segna('errore', T.giorno);
    try { if (!imap || !imap.usable) await apriPosta(); const p = esegui('agente/posta.js', 'allarme', 'errore', e.message.replace(/"/g, "'")); if (!p.codice) await inviaPosta(); } catch (x) {}
  }
  process.exitCode = 1;
}).finally(async () => {
  await chiudiPosta();
  if (ricercheVere) fs.writeFileSync(RICERCHE, ricercheVere);
  // segno sempre l'ultimo giro: si vede che l'agente lavora anche quando non c'e' niente di nuovo
  fs.writeFileSync(qui('ultimo-giro.json'), JSON.stringify({ quando: new Date().toISOString(), ora: `${T.giorno} ${String(T.ora).padStart(2, '0')}:${T.minuti}`, prova: PROVA, esito: process.exitCode ? 'errore' : 'ok', fatti: FATTI.length ? FATTI : ['nessuna novità'] }, null, 1));
});
