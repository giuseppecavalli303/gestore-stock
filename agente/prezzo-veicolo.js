// Prezzo del veicolo (senza passaggio) dal totale scritto nella stampa. Lo usano i prezzi consigliati e il valutatore.
// I prezzi si mettono sul veicolo e finiscono sempre in 450 o 950; la stampa mostra il totale con il passaggio
// (500, 650, 700, 750, 800 o 1000). Dal totale si ricava il prezzo veicolo: giusto per 811 auto su 816 del 18/11/2026.
const kwDa = (m, kw) => { if (kw) return kw; const k = /(\d{2,3})\s*KW/i.exec(m); if (k) return +k[1]; const c = /(\d{2,3})\s*CV/i.exec(m); return c ? Math.round(c[1] / 1.36) : 0; };

// cars = auto dello stock di oggi (data/stock.json): da quelle prezzate si impara il passaggio tipico per potenza
function creaVeicolo(cars) {
  const perKw = {};
  (cars || []).filter(c => c.prezzo && c.kw && c.pp).forEach(c => { (perKw[c.kw] = perKw[c.kw] || {})[c.pp] = (perKw[c.kw][c.pp] || 0) + 1; });
  const kws = Object.keys(perKw).map(Number);
  function passaggio(kw) {
    if (!kw || !kws.length) return 700;
    const vicino = kws.slice().sort((a, b) => Math.abs(a - kw) - Math.abs(b - kw))[0];
    return +Object.entries(perKw[vicino]).sort((a, b) => b[1] - a[1])[0][0];
  }
  function veicolo(tot, kw) {
    const r = ((tot % 500) + 500) % 500, perResto = { 100: 650, 150: 700, 200: 750, 250: 800 };
    const pass = perResto[r] || (r === 450 ? (kw >= 100 ? 1000 : 500) : passaggio(kw));
    return tot - pass;
  }
  return { veicolo, passaggio };
}

module.exports = { kwDa, creaVeicolo };
