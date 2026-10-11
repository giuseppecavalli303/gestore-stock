/* Parser stock usato: riceve le pagine come liste di item {s,x,y,w,fs} in ordine di stream */
const COLS = ['stato','marca','modello','dataIngr','targa','checkList','dImm','km','colore','prezzoSpec','autoscout','note','prezzoVeicolo','pp','prezzoTot','ingresso','ubicazione','anticipata','miniPP','acquirente','dataPren','caparra','modVen','fv','venditore'];
const HEAD_FIRST = ['stato','marca','modello','data','targa','check','d.imm','km','colore','prezzo','autoscout','note','prezzo','pp','prezzo','ingresso','ubicazione','anticipata','mini','acquirente','data','caparra','mod.','fv','venditore'];
const RE_STATO = /^\d -( |$)/;

function chW(ch) {
  if (ch >= '0' && ch <= '9') return 0.556;
  if (ch === ' ' || ch === '.' || ch === ',' || ch === ':' || ch === '/' || ch === '!' || ch === "'" || ch === 'I') return 0.278;
  if (ch === '-' || ch === '(' || ch === ')') return 0.333;
  if (ch === 'M' || ch === 'W') return 0.86;
  if (ch >= 'a' && ch <= 'z') return 0.5;
  return 0.68;
}
// spezza un item in parole stimando la x di ciascuna
function words(it) {
  const s = it.s;
  let tot = 0;
  for (const ch of s) tot += chW(ch);
  const k = tot ? it.w / tot : 0;
  const out = [];
  let pos = 0, cur = null;
  for (const ch of s) {
    const w = chW(ch) * k;
    if (ch === ' ') { if (cur) { out.push(cur); cur = null; } }
    else if (cur) { cur.s += ch; cur.x1 = it.x + pos + w; }
    else cur = { s: ch, x0: it.x + pos, x1: it.x + pos + w, y: it.y };
    pos += w;
  }
  if (cur) out.push(cur);
  return out;
}

function findHeader(items) {
  const i0 = items.findIndex(it => it.fs < 8.5 && it.s.trim() === 'Stato');
  if (i0 < 0) return null;
  const hy = items[i0].y;
  const ws = [];
  for (let i = i0; i < items.length && Math.abs(items[i].y - hy) <= 8; i++) ws.push(...words(items[i]));
  ws.sort((a, b) => a.x0 - b.x0 || a.y - b.y);
  const xs = [];
  let k = 0;
  for (const w of ws) {
    if (k < HEAD_FIRST.length && w.s.toLowerCase() === HEAD_FIRST[k] && (!xs.length || w.x0 - xs[xs.length - 1] > 4)) { xs.push(w.x0); k++; }
  }
  return xs.length === COLS.length ? { xs, y: hy } : null;
}

function colOf(xs, x) {
  let c = 0;
  for (let i = 1; i < xs.length; i++) { if (x >= xs[i] - 2.5) c = i; else break; }
  return c;
}

function extract(pages) {
  const rows = [], warnings = [], totals = {};
  let section = '', printDate = null, grand = null, done = false, lastHead = null;
  pages.forEach((pg, pi) => {
    if (done) return;
    const items = pg.items;
    if (!printDate) for (const it of items) {
      const m = it.s.match(/Stampa del (\d{2})\/(\d{2})\/(\d{4}) ore (\d{2}):(\d{2})/);
      if (m) { printDate = `${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}`; break; }
    }
    const own = findHeader(items);
    if (own) lastHead = own;
    const head = own || lastHead;                       // le pagine di continuazione non hanno intestazione
    const hasTop = items.some(it => it.y < 40 && /Stampa del/.test(it.s));
    let cur = null, totLine = null;
    const flushTot = () => {
      if (!totLine) return;
      const s = totLine.join(' ');
      const sm = s.match(/^(\d{2} - .+?) TOTALE:\s*(\d+)/);
      if (sm) totals[sm[1]] = +sm[2];
      else { const g = s.match(/^TOTALE:\s*(\d+)/); if (g) grand = +g[1]; }
      totLine = null;
    };
    for (const it of items) {
      const s = it.s.trim();
      if (!s) continue;
      if (/^Totale STOCK/.test(s)) { done = true; }
      if (done) { if (s === 'TOTALE:') grand = -1; else if (grand === -1 && /^\d+$/.test(s)) grand = +s; continue; }
      if (it.fs > 8.5 && it.fs < 10) {                 // riga totali di sezione
        cur = null;
        if (!totLine || Math.abs(totLine.y - it.y) > 3) { flushTot(); totLine = []; totLine.y = it.y; }
        totLine.push(s);
        continue;
      }
      if (hasTop && it.y < 40) continue;                // testata pagina
      if (it.fs >= 10) { if (/^\d{2}( [A-Z])? - /.test(s)) { section = s; cur = null; } continue; }
      if (!head) { warnings.push(`Pagina ${pi + 1}: intestazione colonne non riconosciuta`); break; }
      if (own && Math.abs(it.y - head.y) <= 8) continue;       // intestazione colonne
      for (const w of words(it)) {
        const c = colOf(head.xs, (w.x0 + w.x1) / 2);
        if (c === 0 && RE_STATO.test(s) && w.x0 === it.x) {
          cur = { page: pi + 1, section, cells: COLS.map(() => []) };
          rows.push(cur);
        }
        if (!cur) { warnings.push(`Pagina ${pi + 1}: testo fuori riga "${s}"`); break; }
        const cell = cur.cells[c];
        const last = cell[cell.length - 1];
        if (last && Math.abs(last.y - w.y) < 2) last.s += ' ' + w.s; else cell.push({ s: w.s, y: w.y });
      }
    }
    flushTot();
  });
  return { rows, warnings, totals, grand, printDate };
}
