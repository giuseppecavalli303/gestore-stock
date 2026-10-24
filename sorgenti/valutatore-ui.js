/* ---------- valutatore permute: la schermata (scheda auto, scheda Permute, pagina a se') ---------- */
// Usa valuta(), simili() e valEuro() di valuta.js; parla con il servizio Google (Valutatore.gs).
const VAL_PORTALI = { autoscout: 'AutoScout', subito: 'Subito', automobile: 'Automobile.it' };
const VAL_COLORI = { autoscout: '#5fae2e', subito: '#e8663d', automobile: '#2f8fd8' };
const VAL_EUROTAX = 'https://www.eurotax.it/';
const valEsc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const valKm = n => valEuro(n).replace(' €', ' km');
// gli annunci salvati arrivano dal servizio, che chiunque abbia il link puo' riempire: link solo verso i tre portali
const valLink = u => /^https:\/\/(www\.)?(autoscout24\.it|subito\.it|automobile\.it)\//.test(String(u || '')) ? u : '';
const valNum = n => Number(n) || 0;

function montaValutatore(el, opz) {
  const st = { frase: '', auto: null, mancano: [], annunci: [], venduti: [], portali: {}, cfg: null, rip: null, et: { giallo: '', blu: '' }, targa: '', id: null, r: null, lista: false };
  el.innerHTML = `<div class="val">
    <form class="val-in"><input type="text" placeholder="Es. Clio GPL Energy 120000 km del 2013" enterkeyhint="search" autocomplete="off" aria-label="Auto da valutare"><button class="btn btn-primary">Valuta</button></form>
    <div class="val-out" aria-live="polite"></div>
    <div class="val-piede"><button type="button" class="btn btn-ghost btn-sm" data-v="ultime">Ultime valutazioni</button><button type="button" class="btn btn-ghost btn-sm" data-v="margini">Margini</button></div>
    <div class="val-extra"></div>
  </div>`;
  const q = s => el.querySelector(s), out = q('.val-out'), extra = q('.val-extra');

  const chiama = async (azione, dati) => {
    const r = await fetch(opz.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(Object.assign({ token: opz.token, azione }, dati)) });
    const j = await r.json();
    if (j.errore) throw new Error(j.errore);
    return j;
  };
  const attesa = msg => { out.innerHTML = `<p class="val-attesa"><span class="spin" aria-hidden="true"></span>${valEsc(msg)}</p>`; };
  const errore = msg => { out.innerHTML = `<p class="val-err">${valEsc(msg)}</p>`; };

  async function valutaOra(auto) {
    attesa('Leggo AutoScout, Subito e Automobile.it…');
    try {
      const j = await chiama('valuta', auto ? { auto, frase: st.frase } : { frase: st.frase });
      Object.assign(st, { auto: j.auto, mancano: j.mancano || [], annunci: j.annunci || [], venduti: j.venduti || [], portali: j.portali || {}, cfg: j.cfg, id: null, lista: false });
      if (!st.cfg) return errore('Margini non ancora impostati: aprili da "Margini" con la chiave di Giuseppe.');
      calcola(); disegna();
    } catch (e) { errore(e.message || 'Il servizio non risponde, riprova.'); }
  }
  const calcola = () => { st.r = valuta(st.auto, st.annunci, st.cfg, st.rip); };

  function chips() {
    const a = st.auto, voci = [['marca', a.marca], ['modello', a.serie && valNorm(a.serie).includes(valNorm(a.modello)) ? a.serie : [a.modello, a.serie].filter(Boolean).join(' ')], ['versione', a.versione], ['alimentazione', a.alimentazione], ['anno', a.anno || ''], ['km', a.km ? valKm(a.km) : '']];
    return voci.filter(([k, v]) => v || ['alimentazione', 'anno', 'km'].includes(k))
      .map(([k, v]) => `<button type="button" class="val-chip${v ? '' : ' manca'}" data-campo="${k}">${valEsc(v || k + '?')}</button>`).join('');
  }

  function fonti() {
    const r = st.r, ps = Object.keys(VAL_PORTALI);
    const conti = ps.filter(p => r.perPortale && r.perPortale[p]).map(p => `${VAL_PORTALI[p]} ${r.perPortale[p]}`).join(' · ');
    const giu = ps.filter(p => st.portali[p] === 'errore').map(p => VAL_PORTALI[p]);
    return `da ${r.n} auto simili in vendita${r.qualita ? ` · confronto ${r.qualita}` : ''}${conti ? ' · ' + conti : ''}${giu.length ? ` · <span class="val-warn">${giu.join(' e ')} non ${giu.length > 1 ? 'hanno' : 'ha'} risposto</span>` : ''}`;
  }

  function note() {
    const r = st.r;
    if (!r.ok) return `<p>${valEsc(r.motivo)}</p>`;
    return r.note.slice(1).map((n, i) => {
      const k = n.indexOf('. ');
      const testa = k > 0 && /^Se la/.test(n) ? n.slice(0, k + 1) : n, coda = testa === n ? '' : n.slice(k + 2);
      const off = /teniamo/.test(n) ? 'teniamo' : /commerciante/.test(n) && /^Se/.test(n) ? 'commerciante' : '';
      return `<p><b${off ? ` data-off="${off}"` : ''}>${valEsc(testa)}</b>${coda ? `<br><span>${valEsc(coda)}</span>` : ''}</p>`;
    }).join('') + `<p class="val-come">${valEsc(r.note[0])}</p>`;
  }

  function scarto() {
    const g = Number(st.et.giallo) || 0, s = st.r && st.r.ok && g ? g - st.r.mercato : null;
    return s == null ? '' : s ? `<b class="${s < 0 ? 'neg' : 'pos'}">${s < 0 ? '−' : '+'}${valEuro(Math.abs(s))}</b> ${s < 0 ? 'sotto' : 'sopra'} il mercato` : 'uguale al mercato';
  }
  function eurotax() {
    return `<div class="val-et"><label>Eurotax Giallo <input type="number" inputmode="numeric" class="val-etg" value="${valEsc(st.et.giallo)}" placeholder="vendita"></label>
      <label>Eurotax Blu <input type="number" inputmode="numeric" class="val-etb" value="${valEsc(st.et.blu)}" placeholder="acquisto"></label>
      <span class="val-scarto">${scarto()}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-v="eurotax">Apri Eurotax</button></div>`;
  }

  function grafico() {
    const pts = (st.r.simili || st.annunci).filter(a => a.km && a.prezzo);
    const vend = simili(st.auto, st.venduti).filter(a => a.km && a.prezzo);
    const tutti = pts.concat(vend);
    if (tutti.length < 2) return '';
    const W = 340, H = 170, L = 38, B = 22, T = 8, R = 8;
    const kms = tutti.map(a => a.km).concat(st.auto.km ? [st.auto.km] : []), ps = tutti.map(a => a.prezzo);
    const dk = (Math.max(...kms) - Math.min(...kms)) * 0.04 || 1000, dp = (Math.max(...ps) - Math.min(...ps)) * 0.08 || 200;
    const k0 = Math.min(...kms) - dk, k1 = Math.max(...kms) + dk, p0 = Math.min(...ps) - dp, p1 = Math.max(...ps) + dp;
    const x = k => L + (k1 > k0 ? (k - k0) / (k1 - k0) : 0.5) * (W - L - R), y = p => T + (p1 > p0 ? 1 - (p - p0) / (p1 - p0) : 0.5) * (H - T - B);
    const tua = st.auto.km ? `<rect x="${x(st.auto.km * 0.9)}" y="${T}" width="${Math.max(2, x(st.auto.km * 1.1) - x(st.auto.km * 0.9))}" height="${H - T - B}" class="val-fascia"/><line x1="${x(st.auto.km)}" x2="${x(st.auto.km)}" y1="${T}" y2="${H - B}" class="val-tua"/>` : '';
    const punto = (a, v) => `<circle cx="${x(a.km).toFixed(1)}" cy="${y(a.prezzo).toFixed(1)}" r="${v ? 5.5 : 3.6}" ${v ? `fill="none" stroke="${VAL_COLORI[a.portale]}" stroke-width="2"` : `fill="${VAL_COLORI[a.portale]}"`}><title>${valEsc(a.titolo)} · ${valEuro(a.prezzo)} · ${valKm(a.km)}${v ? ' · annuncio non più presente' : ''}</title></circle>`;
    return `<div class="val-graf"><div class="val-lab">Le auto simili, per km e prezzo</div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafico km e prezzo delle auto simili">
        <line x1="${L}" y1="${H - B}" x2="${W - R}" y2="${H - B}" class="val-asse"/><line x1="${L}" y1="${T}" x2="${L}" y2="${H - B}" class="val-asse"/>
        <text x="${L}" y="${H - 6}" class="val-t">${valKm(k0)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end" class="val-t">${valKm(k1)}</text>
        <text x="${L - 4}" y="${T + 8}" text-anchor="end" class="val-t">${Math.round(p1 / 1000)}k</text><text x="${L - 4}" y="${H - B}" text-anchor="end" class="val-t">${Math.round(p0 / 1000)}k</text>
        ${tua}${pts.map(a => punto(a, false)).join('')}${vend.map(a => punto(a, true)).join('')}
      </svg>
      <div class="val-leg">${Object.keys(VAL_PORTALI).map(p => `<span><i style="background:${VAL_COLORI[p]}"></i>${VAL_PORTALI[p]}</span>`).join('')}<span><i class="anello"></i>${vend.length ? 'annunci non più presenti (di solito vendute)' : 'annunci non più presenti: compaiono rifacendo la stessa ricerca nei prossimi giorni'}</span></div></div>`;
  }

  function elenco() {
    const xs = (st.r.simili || []).slice().sort((a, b) => a.prezzo - b.prezzo);
    if (!st.lista) return `<button type="button" class="val-link" data-v="lista">Vedi le ${xs.length} auto simili ›</button>`;
    return `<button type="button" class="val-link" data-v="lista">Nascondi le auto simili</button><ol class="val-lista">${xs.map(a => `<li>${valLink(a.url) ? `<a href="${valEsc(valLink(a.url))}" target="_blank" rel="noopener">${valEsc(a.titolo)}</a>` : `<span>${valEsc(a.titolo)}</span>`}
      <span>${valNum(a.anno) || ''} · ${valNum(a.km) ? valKm(valNum(a.km)) : 'km n.d.'} · ${valEsc(VAL_PORTALI[a.portale] || '')} · ${a.venditore === 'concessionario' ? 'concessionario' : 'privato'}${a.citta ? ' ' + valEsc(a.citta) : ''}${a.giorni != null && !isNaN(Number(a.giorni)) ? ` · online da ${Number(a.giorni)} giorni` : ''}</span><b>${valEuro(valNum(a.prezzo))}</b></li>`).join('')}</ol>`;
  }

  function disegna() {
    const r = st.r;
    out.innerHTML = `<div class="val-capito">Ho capito così (tocca per correggere):</div><div class="val-chips">${chips()}</div>
      ${r.ok ? `<div class="val-big"><div class="val-lab">Valore di mercato</div><div class="val-valore">${valEuro(r.mercato)}</div><div class="val-fonti">${fonti()}</div></div>` : `<div class="val-big"><div class="val-fonti">${fonti()}</div></div>`}
      <div class="val-note"><div class="val-lab">Note</div><div class="val-note-testo">${note()}</div>
        <label class="val-riga">Ripristino <input type="number" inputmode="numeric" class="val-rip" value="${st.rip == null ? '' : valEsc(st.rip)}" placeholder="${st.cfg.ripristino} (standard)"> €</label></div>
      ${eurotax()}${grafico()}<div class="val-el">${elenco()}</div>
      <div class="val-salva"><input type="text" class="val-targa" maxlength="10" placeholder="Targa (facoltativa)" value="${valEsc(st.targa)}"><button type="button" class="btn btn-ghost btn-sm" data-v="salva">${st.id ? 'Aggiorna' : 'Salva'}</button></div>`;
  }

  // solo le parti che cambiano, cosi' il campo dove si scrive non perde il cursore
  const ridisegnaConto = () => { calcola(); q('.val-note-testo').innerHTML = note(); const v = q('.val-valore'); if (v && st.r.ok) v.textContent = valEuro(st.r.mercato); const e = q('.val-scarto'); if (e) e.innerHTML = scarto(); };

  q('.val-in').onsubmit = e => { e.preventDefault(); st.frase = q('.val-in input').value.trim(); st.rip = null; st.et = { giallo: '', blu: '' }; st.targa = ''; if (st.frase) valutaOra(null); };

  el.addEventListener('input', e => {
    const t = e.target;
    if (t.classList.contains('val-rip')) { st.rip = t.value === '' ? null : Number(t.value); ridisegnaConto(); }
    else if (t.classList.contains('val-etg')) { st.et.giallo = t.value; ridisegnaConto(); }
    else if (t.classList.contains('val-etb')) st.et.blu = t.value;
    else if (t.classList.contains('val-targa')) st.targa = t.value;
  });

  el.addEventListener('click', async e => {
    const c = e.target.closest('.val-chip');
    if (c) {
      const k = c.dataset.campo, num = ['anno', 'km'].includes(k);
      const att = k === 'modello' ? st.auto.modello : st.auto[k];
      const v = prompt(`Correggi ${k}${k === 'alimentazione' ? ' (Benzina, Diesel, GPL, Metano, Elettrica, Ibrida)' : ''}`, att || '');
      if (v == null) return;
      const auto = Object.assign({}, st.auto, { [k]: num ? Number(String(v).replace(/\D/g, '')) || 0 : v.trim() });
      if (k === 'marca' || k === 'modello') auto.slug = null;
      return valutaOra(auto);
    }
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const v = b.dataset.v;
    if (v === 'lista') { st.lista = !st.lista; q('.val-el').innerHTML = elenco(); }
    else if (v === 'eurotax') {
      const a = st.auto, testo = [a.marca, a.modello, a.versione].filter(Boolean).join(' ') + `, ${a.anno || ''}, ${a.km ? valKm(a.km) : ''}, ${a.alimentazione || ''}`;
      try { await navigator.clipboard.writeText(testo); } catch (er) {}
      window.open(VAL_EUROTAX, '_blank', 'noopener');
    } else if (v === 'salva') {
      b.disabled = true;
      try {
        const j = await chiama('salvaValutazione', { id: st.id, frase: st.frase, targa: st.targa, auto: st.auto, risultato: Object.assign({}, st.r, { simili: undefined }), eurotax: st.et, ripristino: st.rip, annunci: st.annunci, venduti: st.venduti });
        st.id = j.id; b.textContent = 'Salvata ✓';
      } catch (er) { b.textContent = 'Non salvata, riprova'; }
      b.disabled = false;
    } else if (v === 'ultime') ultime();
    else if (v === 'margini') margini();
    else if (v === 'chiudi') extra.innerHTML = '';
  });

  async function ultime() {
    extra.innerHTML = '<p class="val-attesa"><span class="spin" aria-hidden="true"></span>Carico le ultime valutazioni…</p>';
    try {
      const j = await chiama('ultime', {});
      extra.innerHTML = `<div class="val-box"><div class="val-lab">Ultime valutazioni</div>${j.valutazioni.length ? `<ol class="val-lista">${j.valutazioni.map(x => `<li><button type="button" class="val-link" data-apri="${valEsc(x.id)}">${valEsc(x.frase)}</button><span>${new Date(x.data).toLocaleDateString('it-IT')}${x.targa ? ' · ' + valEsc(x.targa) : ''}</span><b>${x.mercato ? valEuro(x.mercato) : '—'}</b></li>`).join('')}</ol>` : '<p>Nessuna valutazione salvata.</p>'}<button type="button" class="val-link" data-v="chiudi">Chiudi</button></div>`;
      extra.querySelectorAll('[data-apri]').forEach(x => { x.onclick = () => apri(x.dataset.apri); });
    } catch (e) { extra.innerHTML = `<p class="val-err">${valEsc(e.message)}</p>`; }
  }

  async function apri(id) {
    attesa('Apro la valutazione…'); extra.innerHTML = '';
    try {
      const j = await chiama('apri', { id });
      if (!st.cfg) st.cfg = (await chiama('margini', {})).cfg;
      Object.assign(st, { id: j.id, frase: j.frase, targa: j.targa || '', auto: j.auto, annunci: j.annunci || [], venduti: j.venduti || [], portali: {}, et: j.eurotax || { giallo: '', blu: '' }, rip: j.ripristino == null ? null : j.ripristino, lista: false });
      q('.val-in input').value = j.frase;
      calcola(); disegna();
    } catch (e) { errore(e.message); }
  }

  async function margini() {
    extra.innerHTML = '<p class="val-attesa"><span class="spin" aria-hidden="true"></span>Carico i margini…</p>';
    let cfg;
    try { cfg = (await chiama('margini', {})).cfg || { passaggio: 0, ripristino: 0, nostro: [{ fino: null, euro: 0 }], commerciante: [{ fino: null, euro: 0 }] }; } catch (e) { extra.innerHTML = `<p class="val-err">${valEsc(e.message)}</p>`; return; }
    const righe = (k, fasce) => fasce.map((f, i) => `<tr><td>${f.fino == null ? 'oltre' : 'fino a'} <input type="number" data-k="${k}" data-i="${i}" data-c="fino" value="${f.fino == null ? '' : f.fino}" ${f.fino == null ? 'hidden' : ''}> €</td><td><input type="number" data-k="${k}" data-i="${i}" data-c="${f.perc != null ? 'perc' : 'euro'}" value="${f.perc != null ? f.perc : f.euro}"> ${f.perc != null ? '%' : '€'}</td></tr>`).join('');
    let chiave = null;
    try { chiave = localStorage.getItem('su.chiaveCodici') || null; } catch (e) {}
    extra.innerHTML = `<div class="val-box val-margini"><div class="val-lab">Margini e costi</div>
      <label class="val-riga">Passaggio <input type="number" data-c="passaggio" value="${cfg.passaggio}"> €</label>
      <label class="val-riga">Ripristino standard <input type="number" data-c="ripristino" value="${cfg.ripristino}"> €</label>
      <table><caption>Nostro margine (per prezzo di rivendita)</caption>${righe('nostro', cfg.nostro)}</table>
      <table><caption>Margine del commerciante (per valore di mercato)</caption>${righe('commerciante', cfg.commerciante)}</table>
      ${chiave ? '<button type="button" class="btn btn-primary btn-sm" data-m="salva">Salva i margini</button>' : '<p class="val-come">Per cambiarli serve la chiave di Giuseppe su questo telefono.</p>'}
      <button type="button" class="val-link" data-v="chiudi">Chiudi</button></div>`;
    extra.querySelectorAll('.val-margini input').forEach(i => { i.disabled = !chiave; });
    const s = extra.querySelector('[data-m="salva"]');
    if (s) s.onclick = async () => {
      const nuova = JSON.parse(JSON.stringify(cfg));
      extra.querySelectorAll('.val-margini input').forEach(i => {
        const val = i.value === '' ? null : Number(i.value);
        if (i.dataset.k) nuova[i.dataset.k][i.dataset.i][i.dataset.c] = i.dataset.c === 'fino' && nuova[i.dataset.k][i.dataset.i].fino == null ? null : val;
        else nuova[i.dataset.c] = val;
      });
      s.disabled = true;
      try { st.cfg = (await chiama('margini', { chiave, cfg: nuova })).cfg; s.textContent = 'Salvati ✓'; if (st.r) { calcola(); disegna(); } }
      catch (e) { s.textContent = e.message; }
      s.disabled = false;
    };
  }
}
