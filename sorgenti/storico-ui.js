/* ---------- Storico lungo: i grafici sugli anni di stampe (dati in data/storico-lungo.json, preparati da agente/storico-lungo.js) ---------- */
function montaStoricoLungo(el, D) {
  const n = v => (v == null ? '—' : Math.round(v).toLocaleString('it-IT'));
  const eur = v => (v == null ? '—' : n(v) + ' €');
  const es = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  const meseIt = m => MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(2, 4);
  const dIt = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const passo = (span, k) => { const raw = span / k, p = Math.pow(10, Math.floor(Math.log10(raw || 1))), m = raw / p; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p; };
  const largo = () => Math.max(300, Math.min(el.clientWidth || 900, 1400));
  const legenda = serie => (serie.length > 1 ? `<div class="legend">${serie.map(s => `<span><i class="${s.c}"></i>${es(s.nome)}</span>`).join('')}</div>` : '');

  // linee: una o piu' serie con la stessa unita' di misura, un solo asse. etichette = testi sull'asse x, tip = intestazione del riquadro
  function linee(o) {
    const W = Math.max(300, o.larg), H = 220, ml = 46, mr = 16, mt = 12, mb = 28, L = o.etichette.length;
    const tutti = o.serie.flatMap(s => s.v).filter(v => v != null);
    if (!tutti.length) return '<p class="hint">Dati non ancora disponibili.</p>';
    const hi0 = Math.max(...tutti), lo0 = o.daZero ? 0 : Math.min(...tutti), st = passo(Math.max(1, hi0 - lo0), 4);
    const lo = o.daZero ? 0 : Math.max(0, Math.floor(lo0 / st) * st), hi = Math.ceil(hi0 / st) * st || st;
    const x = i => ml + (L === 1 ? (W - ml - mr) / 2 : i * (W - ml - mr) / (L - 1)), y = v => mt + (hi - v) * (H - mt - mb) / (hi - lo);
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${es(o.titolo)}">`;
    for (let t = lo; t <= hi + 1e-9; t += st) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${ml - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${n(t)}${o.unita || ''}</text>`;
    const ogni = Math.max(1, Math.ceil(L / Math.floor((W - ml - mr) / 58)));
    o.etichette.forEach((e, i) => { if (i % ogni === 0) s += `<text x="${x(i)}" y="${H - 8}" class="ax" text-anchor="middle">${es(e)}</text>`; });
    for (const z of o.serie) {
      let d = '', su = false;
      z.v.forEach((v, i) => { if (v == null) { su = false; return; } d += (su ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); su = true; });
      s += `<path d="${d}" class="ln ${z.c}"/>`;
      if (L <= 14) z.v.forEach((v, i) => { if (v != null) s += `<circle cx="${x(i)}" cy="${y(v)}" r="4" class="dot ${z.c}"/>`; });
    }
    const colW = (W - ml - mr) / Math.max(1, L - 1 || 1);
    o.etichette.forEach((e, i) => {
      const tip = `${(o.tip || o.etichette)[i]}: ` + o.serie.filter(z => z.v[i] != null).map(z => `${o.serie.length > 1 ? z.nome + ' ' : ''}${n(z.v[i])}${o.unita || ''}`).join(' · ');
      s += `<rect x="${x(i) - colW / 2}" y="${mt}" width="${colW}" height="${H - mt - mb}" class="hit" data-tip="${es(tip)}"/>`;
    });
    return `<div class="chartbox">${s}</svg></div>${legenda(o.serie)}`;
  }

  // colonne: quantita' per periodo, asse da zero
  function colonne(o) {
    const W = Math.max(300, o.larg), H = 220, ml = 40, mr = 10, mt = 12, mb = 28, L = o.valori.length;
    const hi0 = Math.max(1, ...o.valori.map(v => v || 0)), st = passo(hi0, 4), hi = Math.ceil(hi0 / st) * st;
    const y = v => mt + (hi - v) * (H - mt - mb) / hi, colW = (W - ml - mr) / L, bw = Math.max(3, Math.min(34, colW - 2));
    let s = `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${es(o.titolo)}">`;
    for (let t = 0; t <= hi + 1e-9; t += st) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${ml - 8}" y="${y(t) + 4}" class="ax" text-anchor="end">${n(t)}</text>`;
    const ogni = Math.max(1, Math.ceil(L / Math.floor((W - ml - mr) / 58)));
    o.valori.forEach((v, i) => {
      const cx = ml + colW * i + colW / 2, x0 = cx - bw / 2;
      if (v) { const h = y(0) - y(v), r = Math.min(4, h, bw / 2); s += `<path class="bar ${o.c || 'c1'}" d="M${x0} ${y(0)} V${y(v) + r} Q${x0} ${y(v)} ${x0 + r} ${y(v)} H${x0 + bw - r} Q${x0 + bw} ${y(v)} ${x0 + bw} ${y(v) + r} V${y(0)} Z"/>`; }
      if (i % ogni === 0) s += `<text x="${cx}" y="${H - 8}" class="ax" text-anchor="middle">${es(o.etichette[i])}</text>`;
      if (L <= 12 && v) s += `<text x="${cx}" y="${y(v) - 5}" class="ax" text-anchor="middle">${n(v)}</text>`;
      s += `<rect x="${cx - colW / 2}" y="${mt}" width="${colW}" height="${H - mt - mb}" class="hit" data-tip="${es((o.tip || o.etichette)[i])}: ${n(v)}${o.unita ? ' ' + o.unita : ''}"/>`;
    });
    return `<div class="chartbox">${s}</svg></div>`;
  }

  // barre orizzontali: una riga per voce, con il valore scritto e il numero di vendite su cui e' calcolato
  function righe(lista, val, testo, nota) {
    const max = Math.max(1, ...lista.map(val));
    return `<div class="hb">${lista.map(r => `<div class="hbr" data-tip="${es(r.k)}: ${es(nota(r))}"><span class="hbk">${es(r.k)}</span><span class="hbt"><i style="width:${Math.max(1.5, val(r) / max * 100).toFixed(1)}%"></i></span><b>${testo(r)}</b></div>`).join('')}</div>`;
  }
  const notaV = r => `venduta in ${n(r.gg)} giorni (valore centrale) · ${n(r.entro30)}% entro 30 giorni · ${n(r.n)} vendite · prezzo medio ${eur(r.prezzo)}`;
  const perGiorni = l => righe(l, r => r.gg, r => n(r.gg) + ' gg', notaV);
  const riquadro = (titolo, sotto, corpo, wide) => `<div class="panel glass${wide ? ' wide' : ''}"><h3>${titolo}</h3>${sotto ? `<p class="hint">${sotto}</p>` : ''}${corpo}</div>`;
  const tessera = (v, t) => `<div class="kpi glass"><span class="v num">${v}</span><span class="l">${t}</span></div>`;

  function disegna() {
    const M = D.mesi, W = largo() - 58, mezzo = innerWidth >= 900 ? (largo() - 14) / 2 - 58 : W;
    const et = M.map(m => meseIt(m.m)), tip = M.map(m => MESI[+m.m.slice(5, 7) - 1] + ' ' + m.m.slice(0, 4));
    const pieni = M.slice(1, -1);                       // primo e ultimo mese sono a meta'
    const top = [...pieni].sort((a, b) => b.vendite - a.vendite)[0], lenti = [...D.perModello].sort((a, b) => b.gg - a.gg), veloci = [...D.perModello].sort((a, b) => a.gg - b.gg);
    const SER = ['c1', 'c2', 'c3', 'c4', 'c5'];
    const totV = D.velocita.reduce((s, v) => s + v.n, 0) || 1, giorniSett = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
    el.innerHTML = `
      <div class="panel glass wide"><h3>Storico dal ${dIt(D.dal)} al ${dIt(D.al)}</h3><p class="hint">Ricostruito da ${n(D.stampe)} stampe dello stock: ${n(D.auto)} auto diverse passate in stock. Una vendita è un'auto prenotata che poi è uscita (o è ancora prenotata); i giorni per vendere vanno dall'ingresso in stock alla prenotazione. Tocca i grafici per i numeri.</p></div>
      <div class="kpis wide">${tessera(n(D.vendute), 'Vendite ricostruite')}${tessera(n(D.ggMediana) + '<small> gg</small>', 'Metà delle auto si vende entro questi giorni')}${tessera(n(D.entro30) + '<small>%</small>', 'Vendute entro 30 giorni dall’ingresso')}${tessera(top ? MESI[+top.m.slice(5, 7) - 1] + ' ' + top.m.slice(0, 4) : '—', top ? `Mese record: ${n(top.vendite)} vendite` : 'Mese record')}</div>
      ${riquadro('Quante auto in stock', 'Media del mese: tutte le auto e quelle libere.', linee({ titolo: 'Auto in stock per mese', larg: W, etichette: et, tip, daZero: true, serie: [{ nome: 'In stock', c: 'c1', v: M.map(m => m.tot) }, { nome: 'Libere', c: 'c2', v: M.map(m => m.lib) }] }), true)}
      ${riquadro('Vendite per mese', 'Per data di prenotazione. Il primo e l’ultimo mese non sono completi.', colonne({ titolo: 'Vendite per mese', larg: W, etichette: et, tip, valori: M.map(m => m.vendite), unita: 'vendite' }), true)}
      ${riquadro('In che mesi si vende di più', 'Un anno per linea: si vede se la stagione si ripete. Il mese in corso non è completo.', linee({ titolo: 'Vendite per mese dell’anno', larg: mezzo, etichette: MESI, daZero: true, serie: D.stagione.map((a, i) => ({ nome: a.anno, c: SER[i % 5], v: a.mesi })) }))}
      ${riquadro('In che giorno si prenota', 'Vendite per giorno della settimana, su tutto il periodo.', colonne({ titolo: 'Vendite per giorno della settimana', larg: mezzo, etichette: giorniSett, valori: D.perGiorno, unita: 'vendite' }))}
      ${riquadro('Quanto ci vuole a vendere', 'Giorni dall’ingresso alla prenotazione, valore centrale del mese.', linee({ titolo: 'Giorni per vendere, mese per mese', larg: mezzo, etichette: et, tip, daZero: true, unita: ' gg', serie: [{ nome: 'Giorni per vendere', c: 'c1', v: M.map(m => m.ggVendita) }] }))}
      ${riquadro('In quanti giorni si vendono', `Su ${n(totV)} vendite.`, righe(D.velocita, r => r.n, r => Math.round(r.n / totV * 100) + '%', r => `${n(r.n)} vendite`))}
      ${riquadro('Giorni per vendere, per modello', `I modelli più venduti. Il più rapido è ${es(veloci[0] ? veloci[0].k : '—')}, il più lento ${es(lenti[0] ? lenti[0].k : '—')}.`, perGiorni(veloci))}
      ${riquadro('Modelli più venduti', 'Numero di vendite nel periodo.', righe(D.perModello, r => r.n, r => n(r.n), notaV))}
      ${riquadro('Per alimentazione', 'Giorni per vendere.', perGiorni(D.perFuel))}
      ${riquadro('Per fascia di prezzo', 'Giorni per vendere.', perGiorni(D.perPrezzo))}
      ${riquadro('Per cambio', 'Giorni per vendere.', perGiorni(D.perCambio))}
      ${riquadro('Per marca', 'Giorni per vendere.', perGiorni(D.perMarca))}
      ${riquadro('Ribassi prima della vendita', `Su ${n(D.ribassiSu)} vendite di auto entrate dopo l’inizio dell’archivio. Più ribassi vuol dire auto rimasta più a lungo, non che il ribasso rallenta.`, righe(D.perRibassi, r => r.n, r => Math.round(r.n / (D.ribassiSu || 1) * 100) + '%', r => `${n(r.n)} vendite · vendute in ${n(r.gg)} giorni (valore centrale)${r.calo ? ` · ribasso medio ${String(r.calo).replace('.', ',')}%` : ''}`))}
      ${riquadro('Anno per anno', 'Vendite e giorni per vendere.', `<div class="tablewrap"><table class="vel"><thead><tr><th>Anno</th><th class="r">Vendite</th><th class="r">Giorni</th><th class="r">Entro 30 gg</th><th class="r">Con ribasso</th><th class="r">Prezzo medio</th></tr></thead><tbody>${D.perAnno.map(a => `<tr><td>${es(a.k)}</td><td class="r">${n(a.n)}</td><td class="r">${n(a.gg)}</td><td class="r">${n(a.entro30)}%</td><td class="r">${n(a.ribassate)}%</td><td class="r">${eur(a.prezzo)}</td></tr>`).join('')}</tbody></table></div>`)}
      ${riquadro('Com’è cambiato lo stock', 'Quota di ogni alimentazione sul totale delle auto in stock.', linee({ titolo: 'Alimentazioni in stock', larg: W, etichette: et, tip, daZero: true, unita: '%', serie: [['Benzina', 'benzina'], ['Diesel', 'diesel'], ['Ibride e plug-in', 'ibrida'], ['Elettriche', 'elettrica'], ['Metano e GPL', 'gas']].map(([nome, k], i) => ({ nome, c: SER[i], v: M.map(m => m.mix[k]) })) }), true)}
      ${riquadro('Prezzo medio delle auto libere', 'Media del mese.', linee({ titolo: 'Prezzo medio delle libere', larg: mezzo, etichette: et, tip, unita: ' €', serie: [{ nome: 'Prezzo medio', c: 'c1', v: M.map(m => m.prezzo) }] }))}
      ${riquadro('Auto ferme da oltre 90 giorni', 'Quota sulle auto libere.', linee({ titolo: 'Libere da oltre 90 giorni', larg: mezzo, etichette: et, tip, daZero: true, unita: '%', serie: [{ nome: 'Oltre 90 giorni', c: 'c1', v: M.map(m => m.vecchie) }] }))}`;
  }
  disegna();
  let t; addEventListener('resize', () => { if (el.hidden || !el.firstChild) return; clearTimeout(t); t = setTimeout(disegna, 200); });
}
