// Coda delle mail (agente/posta-da-inviare.json): ogni mail resta nel file finche' non e' partita davvero.
// Se l'invio fallisce si riprova al giro successivo, al massimo 5 volte; poi si abbandona e lo si scrive nel registro.
// Dopo ogni mail il file viene riscritto, cosi' un'interruzione a meta' non fa ripartire quelle gia' spedite.
// La stessa regola e' in aggiorna-stock.ps1 (funzione InviaPosta) per l'agente del PC.
const fs = require('fs');
const MAX_TENTATIVI = 5;

async function svuotaCoda(file, invia, scrivi) {
  if (!fs.existsSync(file)) return { inviate: 0, restano: 0 };
  let lista;
  try { lista = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); }
  catch (e) { scrivi('Coda mail illeggibile, la scarto.'); fs.rmSync(file, { force: true }); return { inviate: 0, restano: 0 }; }
  const resto = (Array.isArray(lista) ? lista : [lista]).filter(m => m && m.to);
  const salva = () => (resto.length ? fs.writeFileSync(file, JSON.stringify(resto, null, 1)) : fs.rmSync(file, { force: true }));
  let inviate = 0;
  for (const m of resto.slice()) {
    try {
      await invia(m);
      inviate++;
      resto.splice(resto.indexOf(m), 1);
    } catch (e) {
      m.tentativi = (m.tentativi || 0) + 1;
      if (m.tentativi >= MAX_TENTATIVI) {
        resto.splice(resto.indexOf(m), 1);
        scrivi(`Mail NON inviata a ${m.to} dopo ${MAX_TENTATIVI} tentativi, la abbandono: ${m.subject} (${e.message})`);
      } else scrivi(`Mail non inviata a ${m.to} (tentativo ${m.tentativi} di ${MAX_TENTATIVI}, la riprovo al prossimo giro): ${e.message}`);
    }
    salva();
  }
  salva();
  return { inviate, restano: resto.length };
}

module.exports = { svuotaCoda, MAX_TENTATIVI };
