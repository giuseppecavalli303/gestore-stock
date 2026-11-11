// Rapporto personale di un venditore: un file HTML per persona, SOLO per Giuseppe (cartella agente/rapporti/venditori, non pubblicata).
// Usa la storia ricostruita dalle stampe (agente/storico-lungo-cache.json). I commenti sono costruiti dai numeri, con soglie fisse uguali per tutti.
// Uso: node agente/rapporto-venditore.js "Nome Cognome" ["Nome Cognome" ...]
const fs = require('fs'), path = require('path');
const { vendite } = require('./venditori.js');
const CACHE = path.join(__dirname, 'storico-lungo-cache.json'), OUT = path.join(__dirname, 'rapporti', 'venditori');
// note che vengono da Giuseppe, non dai dati
const NOTE = { 'Francesco Cannizzo': 'Secondo quanto mi hai detto, Francesco non aveva mai venduto un\'auto prima di entrare: i dati non dicono quanta esperienza avessero gli altri all\'ingresso.' };

const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const MESI_L = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const mediana = v => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const N = v => (v == null ? '—' : Math.round(v).toLocaleString('it-IT'));
const D1 = v => (v == null ? '—' : (Math.round(v * 10) / 10).toLocaleString('it-IT'));
const eur = v => (v ? N(Math.round(v / 10) * 10) + ' €' : '—');
const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const giorni = (a, b) => Math.round((Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 864e5);
const meseIt = m => MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const meseL = m => MESI_L[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
const segno = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + '%';
const addMesi = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

function contesto(S) {
  const al = S.giorni.reduce((m, g) => (g.d > m ? g.d : m), '');
  const tutte = vendite(S).filter(v => v.d >= '2022-05-05');
  // mese chiuso piu' recente e finestra degli ultimi 12 mesi chiusi
  const ultimo = addMesi(al.slice(0, 7), -1), da12 = addMesi(ultimo, -11);
  const in12 = v => v.d.slice(0, 7) >= da12 && v.d.slice(0, 7) <= ultimo;
  const per = new Map(); tutte.forEach(v => { if (!per.has(v.vend)) per.set(v.vend, []); per.get(v.vend).push(v); });
  // squadra di confronto: in forza (vendita negli ultimi 60 giorni) e con un'attivita' regolare (almeno 30 vendite in 12 mesi)
  const squadra = [...per].filter(([, l]) => l.some(v => giorni(al, v.d) <= 60) && l.filter(in12).length >= 30).map(([k]) => k);
  const sq = new Set(squadra);
  const anno = ultimo.slice(0, 4), meseFine = ultimo.slice(5, 7);
  const ytd = (l, y) => l.filter(v => v.d.slice(0, 4) === y && v.d.slice(5, 7) <= meseFine);
  return { al, ultimo, da12, in12, tutte, per, squadra, sq, anno, meseFine, ytd };
}

function profilo(l) {
  const cp = l.filter(v => v.prezzo > 0);
  return { n: l.length, prezzo: cp.length ? cp.reduce((s, v) => s + v.prezzo, 0) / cp.length : 0, alto: pct(l.filter(v => v.prezzo >= 30000).length, l.length),
    nonvw: pct(l.filter(v => !/^Volkswagen /.test(v.auto)).length, l.length), old: pct(l.filter(v => v.gg > 90).length, l.length), old180: pct(l.filter(v => v.gg > 180).length, l.length),
    rib: pct(l.filter(v => v.cali > 0).length, l.length), sab: pct(l.filter(v => new Date(v.d + 'T12:00:00Z').getUTCDay() === 6).length, l.length) };
}

function rapporto(nome, C) {
  const L = C.per.get(nome);
  if (!L) throw new Error('Venditore non trovato: ' + nome);
  const { ultimo, da12, in12, squadra, sq, anno, meseFine, ytd } = C;
  const primo = L.map(v => v.d).sort()[0], primoMese = primo.slice(0, 7), dallInizio = primo < '2022-06-01';
  const mio12 = L.filter(in12), team12 = C.tutte.filter(v => sq.has(v.vend) && in12(v));
  const P = profilo(mio12), T = profilo(team12);
  const mesiAttivo = Math.min(12, Math.max(1, (+ultimo.slice(0, 4) - +primoMese.slice(0, 4)) * 12 + +ultimo.slice(5, 7) - +primoMese.slice(5, 7) + 1));
  const alMese = mio12.length / mesiAttivo, teamMese = team12.length / squadra.length / 12;
  const classifica = squadra.map(k => [k, C.per.get(k).filter(in12).length]).sort((a, b) => b[1] - a[1]);
  const pos = classifica.findIndex(x => x[0] === nome) + 1;
  const testa = classifica.slice(0, 7).map(x => x[1] / 12), testaMin = Math.min(...testa), testaMax = Math.max(...testa);
  // confronto con lo stesso periodo dell'anno prima (gennaio - ultimo mese chiuso)
  const a1 = ytd(L, anno).length, a0 = ytd(L, String(+anno - 1)).length;
  const var1 = a0 >= 20 && primo < `${+anno - 1}-02-01` ? Math.round((a1 - a0) / a0 * 100) : null;
  const t1 = ytd(C.tutte.filter(v => sq.has(v.vend)), anno).length, t0 = ytd(C.tutte.filter(v => sq.has(v.vend)), String(+anno - 1)).length;

  // mese per mese: le sue vendite e il valore centrale della squadra (venditori in forza con almeno una vendita quel mese)
  const daM = primoMese > addMesi(ultimo, -24) ? primoMese : addMesi(ultimo, -24);
  const mesi = []; for (let m = daM; m <= ultimo; m = addMesi(m, 1)) mesi.push(m);
  const serie = mesi.map(m => {
    const l = C.tutte.filter(v => v.d.slice(0, 7) === m && sq.has(v.vend)), c = new Map(); l.forEach(v => c.set(v.vend, (c.get(v.vend) || 0) + 1));
    const io = c.get(nome) || 0, vals = [...c.values()].sort((a, b) => b - a);
    return { m, io, med: mediana(vals) || 0, pos: vals.filter(x => x > io).length + 1, di: c.size };
  });
  const s12 = serie.filter(s => s.m >= da12);
  const sopra = s12.filter(s => s.io > s.med).length, pari = s12.filter(s => s.io === s.med).length, sotto = s12.filter(s => s.io < s.med).length;
  const migliore = [...serie].sort((a, b) => b.io - a.io || a.pos - b.pos)[0], primi = serie.filter(s => s.pos <= 3);
  const vals12 = s12.map(s => s.io), media12 = vals12.reduce((a, b) => a + b, 0) / (vals12.length || 1);
  const cv = media12 ? Math.sqrt(vals12.reduce((a, v) => a + (v - media12) ** 2, 0) / vals12.length) / media12 : 0;
  const cvTeam = mediana(squadra.map(k => { const v = mesi.filter(m => m >= da12).map(m => C.per.get(k).filter(x => x.d.slice(0, 7) === m).length), mm = v.reduce((a, b) => a + b, 0) / v.length; return mm ? Math.sqrt(v.reduce((a, x) => a + (x - mm) ** 2, 0) / v.length) / mm : 0; }));

  // anno per anno: le sue vendite e la media a testa dei venditori di quell'anno (in forza o no) con almeno 30 vendite
  const anni = [...new Set(L.map(v => v.d.slice(0, 4)))].sort();
  const annoTab = anni.map(y => {
    const tot = C.tutte.filter(v => v.d.slice(0, 4) === y), c = new Map(); tot.forEach(v => c.set(v.vend, (c.get(v.vend) || 0) + 1));
    const reg = [...c.values()].filter(x => x >= 30), media = reg.reduce((a, b) => a + b, 0) / (reg.length || 1), io = c.get(nome) || 0;
    const posA = [...c.values()].filter(x => x > io).length + 1;
    return { y, io, media, indice: Math.round(io / media * 100), pos: posA, di: c.size };
  });

  // primi 12 mesi rispetto agli altri entrati dopo l'inizio dell'archivio
  let ingresso = null;
  if (!dallInizio) {
    const primi12 = (l, p) => { const m0 = p.slice(0, 7); const n = k => l.filter(v => v.d.slice(0, 7) < addMesi(m0, k)).length; return [n(3), n(6), n(12)]; };
    ingresso = squadra.map(k => { const l = C.per.get(k), p = l.map(v => v.d).sort()[0]; return p < '2022-06-01' ? null : { k, p, n: primi12(l, p) }; }).filter(Boolean).filter(x => addMesi(x.p.slice(0, 7), 11) <= ultimo || x.k === nome).sort((a, b) => b.n[2] - a.n[2]);
  }

  // cosa vende
  const conta = (l, f) => { const c = new Map(); l.forEach(v => c.set(f(v), (c.get(f(v)) || 0) + 1)); return [...c].sort((a, b) => b[1] - a[1]); };
  const modelli = conta(mio12, v => v.auto).slice(0, 6), alim = conta(mio12, v => v.fuel);
  const care = [...mio12].filter(v => v.prezzo >= 30000).sort((a, b) => b.prezzo - a.prezzo).slice(0, 4);

  // ---------- commenti dai numeri ----------
  const piu = [], meno = [], leve = [];
  const sopraMedia = Math.round((alMese / teamMese - 1) * 100);
  const volume = pos === 1 ? `è il primo della squadra per numero di vendite` : pos <= 3 ? `è tra i primi tre della squadra per numero di vendite` : pos <= 7 ? `è nel gruppo di testa della squadra` : alMese >= teamMese * 0.97 ? `è a metà classifica, ${sopraMedia > 2 ? 'sopra' : 'in linea con'} la media della squadra` : `è nella parte bassa della classifica per numero di vendite`;
  if (pos <= 7) piu.push(`<b>Volume:</b> ${volume} (${pos}° su ${squadra.length}), con ${D1(alMese)} vendite al mese contro una media di ${D1(teamMese)}.`);
  else (alMese >= teamMese * 0.97 ? piu : meno).push(`<b>Volume:</b> ${volume}: ${D1(alMese)} vendite al mese contro ${D1(teamMese)} di media e ${D1(testaMin)}–${D1(testaMax)} dei primi sette.`);
  const varTeam = t0 ? Math.round((t1 - t0) / t0 * 100) : 0;
  if (var1 != null) {
    const txt = `<b>Andamento:</b> da gennaio a ${MESI_L[+meseFine - 1]} ${a1} vendite contro ${a0} nello stesso periodo del ${+anno - 1} (${segno(var1)}; la squadra ${segno(varTeam)}).`;
    (var1 >= varTeam + 5 ? piu : var1 <= varTeam - 5 ? meno : piu).push(txt + (var1 >= varTeam + 5 ? ' Cresce più della squadra.' : var1 <= varTeam - 5 ? ' Cala più della squadra.' : ' In linea con la squadra.'));
  }
  if (cv && cvTeam && cv >= cvTeam * 1.2 && sotto <= 3) piu.push(`<b>Costanza:</b> quasi sempre sopra la squadra (${sopra} mesi su 12 sopra il valore centrale), anche se con più alti e bassi della media.`);
  else if (cv && cvTeam) (cv <= cvTeam * 0.85 ? piu : cv >= cvTeam * 1.2 ? meno : piu).push(cv <= cvTeam * 0.85 ? `<b>Costanza:</b> è tra i più regolari della squadra, senza mesi vuoti; negli ultimi 12 mesi ${sopra + pari} mesi su 12 alla pari o sopra il valore centrale.` : cv >= cvTeam * 1.2 ? `<b>Costanza:</b> alterna mesi molto buoni a mesi deboli più della media della squadra (${sopra} mesi sopra il valore centrale, ${sotto} sotto).` : `<b>Costanza:</b> regolare come la media della squadra (${sopra} mesi sopra il valore centrale, ${pari} alla pari, ${sotto} sotto).`);
  const dP = P.prezzo - T.prezzo, dA = P.alto - T.alto, dV = P.nonvw - T.nonvw, dO = P.old - T.old, dR = P.rib - T.rib;
  if (dA >= 3) piu.push(`<b>Fascia alta:</b> ${P.alto}% delle sue vendite sopra i 30.000 € (squadra ${T.alto}%), prezzo medio ${eur(P.prezzo)} contro ${eur(T.prezzo)}.`);
  else if (dP >= 1000) piu.push(`<b>Prezzo:</b> vende auto più care della media (prezzo medio ${eur(P.prezzo)} contro ${eur(T.prezzo)}), anche se la quota sopra i 30.000 € è nella media (${P.alto}%).`);
  else if (dA <= -3 || dP <= -1000) { meno.push(`<b>Fascia alta:</b> solo il ${P.alto}% delle sue vendite è sopra i 30.000 € (squadra ${T.alto}%), prezzo medio ${eur(P.prezzo)} contro ${eur(T.prezzo)}.`); leve.push(`Portare qualche vendita in più sopra i 30.000 €: oggi è al ${P.alto}%, la squadra al ${T.alto}% e i più forti in questa fascia oltre il 15%.`); }
  if (dV >= 4) piu.push(`<b>Altre marche:</b> il ${P.nonvw}% delle sue vendite non è Volkswagen (squadra ${T.nonvw}%): vende bene anche fuori dalla gamma principale.`);
  else if (dV <= -4) meno.push(`<b>Altre marche:</b> lavora poco fuori da Volkswagen (${P.nonvw}% contro ${T.nonvw}% della squadra).`);
  if (dO >= 5) piu.push(`<b>Auto ferme:</b> il ${P.old}% delle sue vendite è su auto in stock da oltre 90 giorni (squadra ${T.old}%): aiuta molto a smaltire il magazzino.`);
  else if (dO <= -5) meno.push(`<b>Auto ferme:</b> vende meno auto in stock da oltre 90 giorni della media (${P.old}% contro ${T.old}%): lavora soprattutto sulle auto fresche.`);
  if (dO <= -5) leve.push(`Prendersi qualche auto ferma da oltre 90 giorni in più (oggi il ${P.old}% delle sue vendite, squadra ${T.old}%): è quella che pesa di più sul magazzino.`);
  if (dR >= 4) { meno.push(`<b>Ribassi:</b> ${P.rib}% delle sue vendite arriva dopo almeno un ribasso (squadra ${T.rib}%). Può voler dire che si prende le auto difficili o che si appoggia di più al prezzo: dai dati non si distingue.`); leve.push(`Ridurre le vendite dopo un ribasso (${P.rib}% contro ${T.rib}% della squadra): a parità di volume porta più margine.`); }
  else if (dR <= -4) piu.push(`<b>Ribassi:</b> solo il ${P.rib}% delle sue vendite arriva dopo un ribasso (squadra ${T.rib}%): chiude più spesso al prezzo pieno.`);
  if (pos > 7 && alMese < testaMin) leve.unshift(`Volume: per entrare nel gruppo di testa servono circa ${D1(testaMin - alMese)} vendite in più al mese.`);
  if (var1 != null && var1 <= varTeam - 5) leve.push(`Capire il calo di quest'anno rispetto al ${+anno - 1}: è il dato da guardare per primo.`);
  if (!leve.length) leve.push(`Mantenere il livello: non ci sono punti deboli evidenti rispetto alla squadra.`);

  // ---------- sintesi ----------
  const sintesi = [];
  sintesi.push(`${nome.split(' ')[0]} ${volume}: ${pos}° su ${squadra.length} negli ultimi 12 mesi, con ${D1(alMese)} vendite al mese.`);
  if (var1 != null) sintesi.push(var1 >= varTeam + 5 ? `Quest'anno cresce più della squadra (${segno(var1)}).` : var1 <= varTeam - 5 ? `Quest'anno è sotto il ${+anno - 1} più della squadra (${segno(var1)}).` : `Quest'anno è in linea con il ${+anno - 1} (${segno(var1)}).`);
  if (ingresso) { const i = ingresso.findIndex(x => x.k === nome); if (i >= 0 && i <= 2 && addMesi(primoMese, 11) <= ultimo) sintesi.push(`Il suo primo anno (${ingresso[i].n[2]} vendite) è ${i === 0 ? 'il migliore' : i === 1 ? 'il secondo migliore' : i === 2 ? 'il terzo migliore' : `${i + 1}° su ${ingresso.length}`} tra i venditori entrati dal 2022.`); }
  const forte = piu.filter(x => !/^<b>(Volume|Andamento|Costanza)/.test(x))[0];
  if (forte) sintesi.push('Punto di forza: ' + forte.replace(/<b>[^<]*<\/b>\s*/, '').replace(/\.$/, '') + '.');

  // ---------- grafico mese per mese ----------
  const maxV = Math.max(4, ...serie.map(s => Math.max(s.io, s.med)));
  const col = serie.length;
  const barre = serie.map(s => `<div title="${meseIt(s.m)}: ${s.io} vendite (squadra ${D1(s.med)}, ${s.pos}° su ${s.di})"><s style="bottom:${(s.med / maxV * 100).toFixed(1)}%"></s><i style="height:${(s.io / maxV * 100).toFixed(1)}%"></i></div>`).join('');
  const etich = serie.map((s, i) => `<span>${i % 3 === 0 ? MESI[+s.m.slice(5, 7) - 1] + (s.m.slice(5, 7) === '01' || i === 0 ? '<br>' + s.m.slice(2, 4) : '') : ''}</span>`).join('');

  const tr = (k, a, b, cl) => `<tr><td class="l">${k}</td><td${cl ? ` class="${cl}"` : ''}><b>${a}</b></td><td>${b}</td></tr>`;
  const cls = (d, soglia, inverso) => (Math.abs(d) < soglia ? '' : (d > 0) !== !!inverso ? 'su' : 'giu');
  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(nome)}: rapporto personale</title>
<style>
:root{--ink:#0b2545;--ink2:#3d4a5c;--ink3:#6b7686;--line:#e3e7ed;--bg:#f4f6f9;--card:#fff;--blu:#2a78d6;--su:#1f8a5b;--giu:#c0392b}
*{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 "Segoe UI",Helvetica,Arial,sans-serif}
.pag{max-width:900px;margin:0 auto;padding:32px 18px 60px} .ris{font-size:12px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3)}
h1{font-size:28px;line-height:1.2;margin:6px 0 6px} .sotto{color:var(--ink2);margin:0 0 22px}
h2{font-size:20px;margin:36px 0 10px;padding-top:6px;border-top:2px solid var(--ink)} h3{font-size:16px;margin:22px 0 6px}
p{margin:0 0 12px} ul{margin:0 0 12px;padding-left:20px} li{margin-bottom:7px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px 20px;margin:14px 0} .sintesi{border-left:5px solid var(--blu);background:#eef4fc}
.kpi{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:14px 0} .kpi div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.kpi b{display:block;font-size:23px} .kpi span{font-size:13px;color:var(--ink2)}
.tw{overflow-x:auto;margin:10px 0} table{border-collapse:collapse;width:100%;font-size:13.5px;background:var(--card)}
th{text-align:right;font-size:12px;color:var(--ink3);font-weight:600;padding:8px 10px;border-bottom:2px solid var(--ink);white-space:nowrap}
td{text-align:right;padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap;font-variant-numeric:tabular-nums} th.l,td.l{text-align:left}
.su{color:var(--su)} .giu{color:var(--giu)} tr.io{background:#eef4fc}
.mesi{display:grid;grid-template-columns:repeat(${col},minmax(0,1fr));gap:3px;align-items:end;height:150px;margin:16px 0 4px;border-bottom:1px solid var(--line)}
.mesi div{position:relative;display:flex;flex-direction:column;justify-content:flex-end;height:100%} .mesi i{display:block;background:var(--blu);border-radius:3px 3px 0 0}
.mesi s{position:absolute;left:-1px;right:-1px;height:0;border-top:2px dashed #e0702e}
.et{display:grid;grid-template-columns:repeat(${col},minmax(0,1fr));gap:3px;font-size:10px;color:var(--ink3);text-align:center;line-height:1.3}
.leg{font-size:12.5px;color:var(--ink2);margin-top:6px} .leg i{display:inline-block;width:11px;height:11px;background:var(--blu);border-radius:2px;vertical-align:-1px;margin-right:5px}
.leg s{display:inline-block;width:16px;border-top:2px dashed #e0702e;vertical-align:3px;margin:0 5px 0 14px}
.nota{font-size:13px;color:var(--ink3)} .due{display:grid;grid-template-columns:1fr 1fr;gap:14px} @media (max-width:700px){.due{grid-template-columns:1fr}}
@media print{body{background:#fff}.pag{padding:0}.card{break-inside:avoid}}
</style></head><body><div class="pag">
<div class="ris">Riservato · solo per Giuseppe Cavalli</div>
<h1>${esc(nome)}</h1>
<p class="sotto">${dallInizio ? 'In squadra almeno da maggio 2022, quando comincia l\'archivio delle stampe' : `In squadra da ${meseL(primoMese)}`}. Vendite ricostruite dalle stampe dello stock fino a ${meseL(ultimo)}, a confronto con i ${squadra.length} venditori in forza.</p>
<div class="kpi">
<div><b>${N(L.length)}</b><span>vendite ${dallInizio ? 'da maggio 2022' : 'dal suo ingresso'}</span></div>
<div><b>${pos}° su ${squadra.length}</b><span>per vendite negli ultimi 12 mesi</span></div>
<div><b>${D1(alMese)}</b><span>vendite al mese (squadra ${D1(teamMese)})</span></div>
<div><b>${var1 == null ? '—' : segno(var1)}</b><span>${var1 == null ? 'confronto con l’anno scorso non disponibile' : `gennaio–${MESI_L[+meseFine - 1]} ${anno} sul ${+anno - 1}`}</span></div>
</div>
<div class="card sintesi"><p style="margin:0"><b>In breve.</b> ${sintesi.join(' ')}</p></div>
${NOTE[nome] ? `<p class="nota">${esc(NOTE[nome])}</p>` : ''}

<h2>1. Mese per mese</h2>
<p>Le sue vendite (barre) e il valore centrale della squadra nello stesso mese (linea tratteggiata). Passa sopra una barra per i numeri.</p>
<div class="mesi" role="img" aria-label="Vendite mese per mese">${barre}</div>
<div class="et">${etich}</div>
<p class="leg"><i></i>Vendite di ${esc(nome.split(' ')[0])} <s></s>Valore centrale della squadra</p>
<ul>
<li>Negli ultimi 12 mesi: <b>${sopra}</b> mesi sopra il valore centrale della squadra, <b>${pari}</b> alla pari, <b>${sotto}</b> sotto.</li>
<li>Mese migliore${serie.length < 25 ? '' : ' degli ultimi due anni'}: <b>${meseL(migliore.m)}, ${migliore.io} vendite</b> (${migliore.pos}° della squadra).${primi.length ? ` Tra i primi tre della squadra in ${primi.length} ${primi.length === 1 ? 'mese' : 'mesi'}${primi.filter(s => s.pos === 1).length ? `, primo in ${primi.filter(s => s.pos === 1).length}` : ''}.` : ''}</li>
</ul>

<h2>2. Anno per anno</h2>
<div class="tw"><table><thead><tr><th class="l">Anno</th><th>Vendite</th><th>Media a testa della squadra</th><th>Rispetto alla media</th><th>Posizione</th></tr></thead><tbody>
${annoTab.map(a => `<tr><td class="l">${a.y}${a.y === '2022' ? ' <span class="nota">(da maggio)</span>' : a.y === ultimo.slice(0, 4) ? ` <span class="nota">(fino a ${MESI[+meseFine - 1]})</span>` : ''}</td><td><b>${a.io}</b></td><td>${N(a.media)}</td><td class="${a.indice >= 110 ? 'su' : a.indice <= 90 ? 'giu' : ''}">${a.indice}%</td><td>${a.pos}° su ${a.di}</td></tr>`).join('')}
</tbody></table></div>
<p class="nota">"Media a testa" = vendite medie dei venditori con almeno 30 vendite in quell'anno. 100% vuol dire esattamente nella media. Il primo anno di chi entra a metà anno risulta basso per forza.</p>
${ingresso && ingresso.length > 1 ? `<h3>Il primo anno a confronto con gli altri nuovi ingressi</h3>
<div class="tw"><table><thead><tr><th class="l">Venditore</th><th class="l">Primo mese</th><th>Primi 3 mesi</th><th>Primi 6 mesi</th><th>Primi 12 mesi</th></tr></thead><tbody>
${ingresso.map(x => `<tr${x.k === nome ? ' class="io"' : ''}><td class="l">${x.k === nome ? '<b>' + esc(x.k) + '</b>' : esc(x.k)}</td><td class="l">${meseIt(x.p.slice(0, 7))}</td><td>${x.n[0]}</td><td>${x.n[1]}</td><td><b>${addMesi(x.p.slice(0, 7), 11) <= ultimo ? x.n[2] : '…'}</b></td></tr>`).join('')}
</tbody></table></div>
<p class="nota">Chi è entrato nel 2024–2025 ha trovato un reparto più grande e più vendite a testa (circa 100 all'anno contro 50 nel 2023): il confronto con chi è entrato prima lo favorisce.</p>` : ''}

<h2>3. Come vende</h2>
<p>Ultimi 12 mesi (${meseIt(da12)} – ${meseIt(ultimo)}), a confronto con la squadra in forza.</p>
<div class="tw"><table><thead><tr><th class="l"></th><th>${esc(nome.split(' ')[0])}</th><th>Squadra</th></tr></thead><tbody>
${tr('Vendite al mese', D1(alMese), D1(teamMese), cls(alMese - teamMese, 0.5))}
${tr('Prezzo medio', eur(P.prezzo), eur(T.prezzo), cls(dP, 1000))}
${tr('Auto ad alto valore (da 30.000 €)', P.alto + '%', T.alto + '%', cls(dA, 3))}
${tr('Auto non Volkswagen', P.nonvw + '%', T.nonvw + '%', cls(dV, 4))}
${tr('Auto ferme da oltre 90 giorni', P.old + '%', T.old + '%', cls(dO, 5))}
${tr('Auto ferme da oltre 180 giorni', P.old180 + '%', T.old180 + '%', cls(P.old180 - T.old180, 5))}
${tr('Vendute dopo almeno un ribasso', P.rib + '%', T.rib + '%', cls(dR, 4, true))}
${tr('Prenotate di sabato', P.sab + '%', T.sab + '%', '')}
</tbody></table></div>
<div class="due">
<div class="card"><h3 style="margin-top:0">Modelli più venduti</h3><ul style="margin:0">${modelli.map(([k, n]) => `<li>${esc(k)}: ${n}</li>`).join('')}</ul></div>
<div class="card"><h3 style="margin-top:0">Alimentazione</h3><ul style="margin:0">${alim.map(([k, n]) => `<li>${esc(k)}: ${n} (${pct(n, mio12.length)}%)</li>`).join('')}</ul>${care.length ? `<h3>Le più care</h3><ul style="margin:0">${care.map(v => `<li>${esc(v.auto)} · ${eur(v.prezzo)}</li>`).join('')}</ul>` : ''}</div>
</div>

<h2>4. Punti di forza</h2>
<ul>${piu.length ? piu.map(x => `<li>${x}</li>`).join('') : '<li>Nessun dato sopra la media della squadra in modo netto.</li>'}</ul>
<h2>5. Da migliorare</h2>
<ul>${meno.length ? meno.map(x => `<li>${x}</li>`).join('') : '<li>Nessun dato sotto la media della squadra in modo netto.</li>'}</ul>
<h3>Dove può crescere</h3>
<ul>${leve.map(x => `<li>${x}</li>`).join('')}</ul>

<p class="nota" style="margin-top:28px">Come leggere i numeri: una vendita è un'auto che nella stampa risulta prenotata con data di prenotazione, assegnata al venditore scritto nella stampa; le prenotazioni poi annullate non contano. Il prezzo è quello esposto, non quello del contratto. Le quote su auto ferme e ribassi dicono che tipo di auto vende, non quanto è veloce. Squadra = i ${squadra.length} venditori in forza con un'attività regolare; escluse le pratiche di Carlo Graus. Preparato dall'agente dello stock usato il ${new Date().toLocaleDateString('it-IT')}.</p>
</div></body></html>`;
  return { html, pos, alMese, var1, sintesi };
}

if (require.main === module) {
  const C = contesto(JSON.parse(fs.readFileSync(CACHE, 'utf8')));
  fs.mkdirSync(OUT, { recursive: true });
  for (const nome of process.argv.slice(2)) {
    const r = rapporto(nome, C), f = path.join(OUT, `Rapporto ${nome}.html`);
    fs.writeFileSync(f, r.html);
    console.log(`${nome}: ${r.pos}°, ${D1(r.alMese)} al mese, ${r.var1 == null ? 'n.d.' : segno(r.var1)} · ${r.sintesi.join(' ')}`);
  }
}
module.exports = { contesto, rapporto };
