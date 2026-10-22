// Prova dal PC sui portali veri: quanti annunci legge il valutatore permute da ogni sito.
// Uso: node agente/prova-portali.js            (Clio GPL 2013, 120.000 km)
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const P = new Function(fs.readFileSync(path.join(root, 'assistente', 'Valutatore.gs'), 'utf8') + '\nreturn { urlPortali, leggiAutoscout, leggiSubito, leggiAutomobile };')();
const { valuta } = new Function(fs.readFileSync(path.join(root, 'sorgenti', 'valuta.js'), 'utf8') + '\nreturn { valuta };')();
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', 'Accept-Language': 'it-IT' };
const auto = { marca: 'Renault', modello: 'Clio', alimentazione: 'GPL', anno: 2013, km: 120000, versione: 'Energy' };

(async () => {
  const u = P.urlPortali(auto), tutti = [];
  for (const [nome, leggi] of [['autoscout', h => P.leggiAutoscout(h)], ['subito', h => P.leggiSubito(h)], ['automobile', h => P.leggiAutomobile(h, auto)]]) {
    try {
      const r = await fetch(u[nome], { headers: H });
      const a = leggi(await r.text());
      console.log(`${nome}: HTTP ${r.status}, ${a.length} annunci  (${u[nome]})`);
      a.slice(0, 3).forEach(x => console.log(`   ${x.prezzo} € · ${x.anno} · ${x.km} km · ${x.alimentazione} · ${x.venditore} · ${x.titolo.slice(0, 50)}`));
      tutti.push(...a);
    } catch (e) { console.log(`${nome}: ERRORE ${e.message}`); }
  }
  // valori di prova inventati (i margini veri stanno solo nel servizio Google)
  const cfg = { passaggio: 222, ripristino: 333, nostro: [{ fino: 8000, euro: 1111 }, { fino: null, perc: 7 }], commerciante: [{ fino: 8000, euro: 1333 }, { fino: null, perc: 11 }] };
  const r = valuta(auto, tutti, cfg, null);
  console.log('\n' + (r.ok ? `Valore di mercato ${r.mercato} € da ${r.n} auto ${JSON.stringify(r.perPortale)}\n` + r.note.join('\n') : r.motivo));
})();
