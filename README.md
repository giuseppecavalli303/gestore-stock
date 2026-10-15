# Gestore stock

Ricerca veloce nello stock dell'usato di Valentino Automobili, aggiornata ogni giorno dalla stampa PDF del gestionale.

Sito: https://giuseppecavalli303.github.io/gestore-stock/ (dal telefono si può installare come app).

## Cosa fa l'app

- ricerca scritta a parole ("golf diesel automatica sotto 25000 libera a Tiburtina") e filtri completi
- foto, link all'annuncio, giro a 360° e dati in più presi da valentinoautomobili.it
- scheda veicolo con la storia nelle stampe (cambi di prezzo e di stato) e testo pronto da mandare al cliente
- vista Statistiche: entrate e uscite, velocità di prenotazione per modello, prezzi ritoccati, auto ferme
- link diretti: `…/#TARGA` apre un'auto, `…/?q=golf diesel` apre una ricerca, `…/#statistiche` le statistiche
- Excel della lista filtrata

## L'agente (gira su questo PC)

Un'operazione pianificata di Windows ("Gestore stock - aggiorna dal PDF") lancia `agente\avvia-nascosto.vbs` ogni 10 minuti dalle 8 alle 20. Lo script `agente\aggiorna-stock.ps1`:

1. legge in Outlook le richieste di avviso dei colleghi (oggetto `AVVISO STOCK: la ricerca`, per fermarle `STOP AVVISO`)
2. quando arriva la stampa da Muschitiello o Quartieri: scarica gli annunci del sito, converte il PDF (solo se i conteggi tornano con il report, e senza i nomi dei clienti), aggiorna lo storico, pubblica, manda il riepilogo e gli avvisi
3. ogni 6 ore riallinea foto e annunci dal sito
4. dalle 13, se la stampa del giorno non è arrivata, avvisa una volta

Comandi utili:

```bash
npm test
```

```powershell
powershell -ExecutionPolicy Bypass -File agente\aggiorna-stock.ps1 -NonPubblicare -NonInviare
```

```powershell
powershell -ExecutionPolicy Bypass -File agente\aggiorna-stock.ps1 -Riepilogo
```

Il registro è in `agente\agente.log`. I destinatari del riepilogo stanno in `agente\destinatari.txt` (uno per riga; se manca, va solo a giuseppe.cavalli@valentinoautomobili.it).

## File

- `index.html`: l'app completa per il sito; `stock-usato.html`: la stessa per la pagina su claude.ai
- `sorgenti/`: lettore del PDF (`parser.js`), dati ricavati (`norm.js`), ricerca a parole (`query.js`), interfaccia (`ui.js`, `page.html`); dopo una modifica `node sorgenti/build.js`
- `agente/`: conversione, annunci, abbinamento, storico, posta, controlli automatici
- `data/`: stock pubblicato, giorno precedente, storico, annunci del sito

## Attenzione

Non caricare mai in questo repository i PDF dello stock né gli indirizzi dei colleghi: il `.gitignore` li esclude già.
