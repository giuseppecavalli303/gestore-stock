# Gestore stock

Ricerca veloce nello stock dell'usato di Valentino Automobili, aggiornata ogni giorno dalla stampa PDF del gestionale.

Sito: https://giuseppecavalli303.github.io/gestore-stock/ (dal telefono si può installare come app).

Chi lavora al progetto con un assistente (Claude, ChatGPT o altri) legga prima [AGENTS.md](AGENTS.md): regole, riservatezza e come è organizzato il lavoro.

## Cosa fa l'app

- ricerca scritta a parole ("golf diesel automatica sotto 25000 libera a Tiburtina") e filtri completi
- foto, link all'annuncio, giro a 360° e dati in più presi da valentinoautomobili.it (cambio, dotazioni, telecamera e tetto confermati dalle foto)
- giorni in stock e giorni di pubblicazione su AutoScout, giudizio di AutoScout sul prezzo
- scheda veicolo con la storia nelle stampe (cambi di prezzo e di stato) e testo pronto da mandare al cliente
- **Prezzo da verificare**: auto con prezzo sul sito diverso dal gestionale, oppure con totale diverso da veicolo + passaggio (lì il prezzo barrato non si mostra)
- promo (Black Friday): prezzo barrato secondo la regola Omnibus
- Km 0, prezzo speciale (campo "prezzo speciale" della stampa), cartello salone in PDF al clic
- vista **Statistiche** e scheda **Storico** con grafici dal 2022 (solo numeri aggregati)
- modalità cliente (`cliente.html`): preventivo senza dati interni; simulazioni di finanziamento sempre con TAN, TAEG e "simulazione indicativa, non vincolante"
- simulatore finanziamenti (`simulatore.html`, tassi allineati al simulatore della casa: PVV G56, Multimake 11,49% MMPCP28) e valutatore permute (`valutatore.html`, servizio Google in `assistente/`; margini solo nella proprietà VAL_CONFIG, mai nel repo)
- link diretti: `…/#TARGA` apre un'auto, `…/?q=golf diesel` apre una ricerca, `…/#statistiche` le statistiche
- Excel della lista filtrata

## L'agente (gira su questo PC)

Un'operazione pianificata di Windows lancia `agente\avvia-nascosto.vbs` ogni 10 minuti dalle 8 alle 20. Lo script `agente\aggiorna-stock.ps1`:

1. legge in Outlook le richieste di avviso dei colleghi (oggetto `AVVISO STOCK: la ricerca`, per fermarle `STOP AVVISO`)
2. quando arriva la stampa da Muschitiello o Quartieri: copia il PDF nell'archivio su Drive, scarica gli annunci del sito, converte il PDF (solo se i conteggi tornano con il report; i nomi dei clienti viaggiano cifrati), conferma telecamera/tetto dalle foto, legge i codici modello e il cambio dai listini VW, aggiorna lo storico e lo storico lungo, calcola i prezzi barrati delle promo, pubblica
3. con la stampa pubblicata manda le mail della giornata (una volta sola per tipo, stato in `agente/stato.json`): riepilogo e avvisi ai colleghi, mail promo senza sconto, **controllo prezzi** a Giuseppe (solo se ci sono totali che non tornano, prezzi diversi dal sito o libere senza prezzo), presentazione giornaliera per Giuseppe (il lunedì anche la settimanale), rapporto mensile sui venditori solo a Giuseppe
4. ogni 6 ore riallinea foto e annunci dal sito e il giudizio di AutoScout
5. dalle 13, se la stampa del giorno non è arrivata, avvisa una volta

Le mail passano da una coda (`agente/posta-da-inviare.json`): restano lì finché non partono davvero. Esiste anche un agente online di prova (`agente/cloud.js`, GitHub Actions), che però non ha ancora sostituito quello del PC.

Comandi utili:

```bash
npm test
```

```bash
npm run build
```

```powershell
powershell -ExecutionPolicy Bypass -File agente\aggiorna-stock.ps1 -NonPubblicare -NonInviare
```

```powershell
powershell -ExecutionPolicy Bypass -File agente\aggiorna-stock.ps1 -Riepilogo
```

Il registro è in `agente\agente.log`.

## Rapporti per Giuseppe (restano sul PC, in `agente/rapporti/`)

Elenchi, controlli e rapporti si consegnano sempre in **PDF** (`agente/stampa-pdf.js`, Chrome via puppeteer-core).

- `node agente/libere-senza-prezzo.js`: auto libere senza prezzo, divise in stock Valentino / remarketing / VTI, dalle più vecchie
- `node agente/prezzi-ingresso.js`: prezzo di acquisto, ripristino carrozzeria e altri lavori delle libere senza prezzo, IVA compresa, con la casella delle auto passate in carrozzeria. I dati si leggono a mano da CROSS Sales e stanno in `agente/cross-ingresso.json` (escluso dal repo)
- `node agente/rapporto.js`, `agente/venditori.js`, `agente/rapporto-venditore.js`: presentazione giornaliera, rapporto mensile e rapporti personali dei venditori (solo per Giuseppe)
- `node agente/posta.js prezzi`: controllo prezzi del mattino

## File

- `index.html`: l'app completa per il sito; `stock-usato.html`, `cliente.html`, `simulatore.html`, `valutatore.html`: generati da `sorgenti/` con `npm run build`
- `sorgenti/`: lettore del PDF (`parser.js`), dati ricavati (`norm.js`), ricerca a parole e controlli prezzo (`query.js`), interfaccia (`ui.js`, `page.html`), storico (`storico-ui.js`), finanziamenti (`finanza.js`, `simulatore.js`)
- `agente/`: agente, conversione, annunci, abbinamento, storico, posta, rapporti, prove automatiche (`test.js`, `prova-*.js`)
- `data/`: stock pubblicato, giorno precedente, storico, storico lungo (aggregati), annunci del sito, promo
- `assistente/`: servizio Google Apps Script del valutatore permute
- `cartelli/`: moduli vuoti dei cartelli salone

## Attenzione

Il repository è **pubblico**. Non caricare mai i PDF dello stock, nomi di clienti, indirizzi dei colleghi, dati dei venditori, prezzi di acquisto o costi, margini: il `.gitignore` esclude già i file che li contengono.
