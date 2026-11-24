# Gestore stock

Ricerca veloce nello stock dell'usato di Valentino Automobili, aggiornata ogni giorno dalla stampa PDF del gestionale.

Sito: https://giuseppecavalli303.github.io/gestore-stock/ (dal telefono si può installare come app).

Chi lavora al progetto con un assistente (Claude, ChatGPT o altri) legga prima [AGENTS.md](AGENTS.md): regole, riservatezza e come è organizzato il lavoro.

## Cosa fa l'app

- ricerca scritta a parole ("golf diesel automatica sotto 25000 libera a Tiburtina") e filtri completi; si cerca anche per telaio, intero o con le ultime cifre (le auto non targate, es. estere, in stampa hanno come targa le ultime 8 cifre del telaio; per le altre il telaio viene dall'annuncio del sito)
- foto, link all'annuncio, giro a 360° e dati in più presi da valentinoautomobili.it (cambio, dotazioni, telecamera e tetto confermati dalle foto)
- giorni in stock e giorni di pubblicazione su AutoScout, giudizio di AutoScout sul prezzo
- scheda veicolo con la storia nelle stampe (cambi di prezzo e di stato) e testo pronto da mandare al cliente
- **Prezzo da verificare**: auto con prezzo sul sito diverso dal gestionale, oppure con totale diverso da veicolo + passaggio (lì il prezzo barrato non si mostra)
- promo (Black Friday): prezzo barrato secondo la regola Omnibus
- Km 0, prezzo speciale (campo "prezzo speciale" della stampa), cartello salone in PDF al clic
- vista **Statistiche** e scheda **Storico** con grafici dal 2022 (solo numeri aggregati)
- modalità cliente (`cliente.html`): preventivo senza dati interni; simulazioni di finanziamento sempre con TAN, TAEG e "simulazione indicativa, non vincolante"
- simulatore finanziamenti (`simulatore.html`, tassi allineati al simulatore della casa: PVV G56, Multimake 11,49% MMPCP28) e valutatore permute (`valutatore.html`, servizio Google in `assistente/`; margini solo nella proprietà VAL_CONFIG, mai nel repo). Oltre agli annunci letti al momento, il valutatore usa:
  - le **nostre vendite** degli ultimi 2 anni (`data/valutatore-vendite.json`, compresse e cifrate con la chiave dei nomi clienti, quindi solo sui telefoni che hanno aperto il link con la chiave): con almeno 3 vendite simili la rivendita "se la teniamo" viene dal nostro prezzo alla prenotazione, adeguato ad anno e km (5% all'anno, 3% ogni 10.000 km);
  - il **mercato letto dal PC** ogni giorno (`data/valutatore-mercato.json`): annunci di Subito (che dal servizio Google non si leggono), auto in vendita su AutoScout e andamento del prezzo nell'ultimo mese, per i modelli che entrano di più
- link diretti: `…/#TARGA` apre un'auto, `…/?q=golf diesel` apre una ricerca, `…/#statistiche` le statistiche
- Excel della lista filtrata

## L'agente (gira su questo PC)

Un'operazione pianificata di Windows lancia `agente\avvia-nascosto.vbs` ogni 10 minuti dalle 8 alle 20. Lo script `agente\aggiorna-stock.ps1`:

1. legge in Outlook le richieste di avviso dei colleghi (oggetto `AVVISO STOCK: la ricerca`, per fermarle `STOP AVVISO`)
2. quando arriva la stampa da Muschitiello o Quartieri: copia il PDF nell'archivio su Drive, scarica gli annunci del sito, converte il PDF (solo se i conteggi tornano con il report; i nomi dei clienti viaggiano cifrati), conferma telecamera/tetto dalle foto, legge i codici modello e il cambio dai listini VW, aggiorna lo storico e lo storico lungo, prepara le nostre vendite cifrate per il valutatore (`agente/valutatore-dati.js`), calcola i prezzi barrati delle promo, pubblica
3. con la stampa pubblicata manda le mail della giornata (una volta sola per tipo, stato in `agente/stato.json`): riepilogo e avvisi ai colleghi, mail promo senza sconto, **controllo prezzi** a Giuseppe (solo se ci sono totali che non tornano, prezzi diversi dal sito o libere senza prezzo), presentazione giornaliera per Giuseppe (il lunedì anche la settimanale), rapporto mensile sui venditori solo a Giuseppe
4. ogni 6 ore riallinea foto e annunci dal sito e il giudizio di AutoScout
4c. ogni sera dalle 19 rifà la lista clienti di Giuseppe (`agente/clienti-venduti.js --mio`): aggiunge le sue prenotazioni nuove prese dalla stampa (segnate "nuova", il telefono arriva con la prossima esportazione da CROSS, che lo script prende da solo se in `c:cross2	empexport.txt` ce n'è una con le colonne giuste) e la copia nel suo Drive (`lavoroClienti vendutiI miei clienti.pdf/.xlsx`). Solo per lui, mai pubblicata
4b. una volta al giorno dalle 14 legge AutoScout e Subito per i 25 modelli che entrano di più, anno per anno (`agente/valutatore-mercato.js`, circa 8 minuti, una pagina alla volta) e pubblica il mercato per il valutatore
5. dalle 13, se la stampa del giorno non è arrivata, avvisa una volta
6. a ogni giro aggiorna la **copia di sicurezza su Google Drive** (`agente\backup-drive.ps1`, cartella `Il mio Drive\lavoro\Gestore stock - copia di sicurezza`): tutti i file, anche quelli riservati che non vanno nel repo, la storia git in un unico file `repo-git.bundle` e le note dell'assistente. Copia solo quello che cambia e non cancella mai niente. Restano fuori `node_modules` e `video\out`, che si possono rigenerare.

Per rimettere in piedi il progetto dalla copia: copiare la cartella `progetto`, poi `npm install`; la storia git si recupera con `git clone repo-git.bundle`.

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

- `node agente/clienti-venduti.js [--drive <cartella>]`: elenco dei clienti di ogni collega di Tiburtina (i destinatari della mail del riepilogo, Giuseppe compreso) dal 05/05/2022, PDF ed Excel, raggruppato per cliente: chi ha comprato più auto le ha tutte sotto il suo nome, con data della proposta d'acquisto, modello e targa. Legge l'esportazione di CROSS `agente/cross-clienti-tutte.txt` (come farla in AGENTS.md) e le stampe per le vendite registrate con un altro venditore. I file restano in `agente/rapporti/` e nel Drive privato di Giuseppe (`lavoro\Clienti venduti`), mai nel repo né mandati ad altri
- `node agente/libere-senza-prezzo.js`: auto libere senza prezzo, divise in stock Valentino / remarketing / VTI, dalle più vecchie
- `node agente/prezzi-consigliati.js`: per ogni libera senza prezzo acquisto e carrozzeria (CROSS), le auto simili vendute da noi (stesso modello, allestimento, potenza e cambio, prezzo in stampa alla prenotazione) e un prezzo consigliato adeguato ad anno e km, con l'elenco delle vendite usate per ogni stima. La prima pagina è un grafico delle più urgenti (pronte e in casa da più di 45 giorni); la tabella è divisa in tre gruppi: pronte oltre 45 giorni, oltre 45 giorni senza fattura di carrozzeria, entrate da 45 giorni o meno
- `node agente/prezzi-ingresso.js`: prezzo di acquisto, ripristino carrozzeria e altri lavori delle libere senza prezzo, IVA compresa, con la casella delle auto passate in carrozzeria. I dati si leggono a mano da CROSS Sales e stanno in `agente/cross-ingresso.json` (escluso dal repo)
- `node agente/rapporto.js`, `agente/venditori.js`, `agente/rapporto-venditore.js`: presentazione giornaliera, rapporto mensile e rapporti personali dei venditori (solo per Giuseppe)
- `node agente/posta.js prezzi`: controllo prezzi del mattino
- `node agente/cartelli-da-cambiare.js [--giorni N] [--mail]`: auto con il prezzo cambiato o appena messo (rispetto a ieri, o negli ultimi N giorni), PDF con elenco per sede e cartelli salone già compilati. Solo Prenestina e Tuscolana, dove il cartello va anche sulle auto fuori dal salone; a Tiburtina i cartelli del salone li curano i venditori. Ogni mattina l'agente lo manda a Giuseppe (stato `cartelli`)
- `node agente/analisi-prezzi-raccogli.js`: rilegge tutte le stampe su Drive e ricostruisce per ogni auto sedi, prezzi, attese senza prezzo e prenotazioni (cache locale `agente/analisi-prezzi-cache.json`). Su questi dati lavora l'analisi interna delle sedi (`agente/analisi-stock.js`, solo sul PC e nella copia su Drive)

## File

- `index.html`: l'app completa per il sito; `stock-usato.html`, `cliente.html`, `simulatore.html`, `valutatore.html`: generati da `sorgenti/` con `npm run build`
- `sorgenti/`: lettore del PDF (`parser.js`), dati ricavati (`norm.js`), ricerca a parole e controlli prezzo (`query.js`), interfaccia (`ui.js`, `page.html`), storico (`storico-ui.js`), finanziamenti (`finanza.js`, `simulatore.js`)
- `agente/`: agente, conversione, annunci, abbinamento, storico, posta, rapporti, prove automatiche (`test.js`, `prova-*.js`)
- `data/`: stock pubblicato, giorno precedente, storico, storico lungo (aggregati), annunci del sito, promo
- `assistente/`: servizio Google Apps Script del valutatore permute
- `data/valutatore-vendite.json` (cifrato) e `data/valutatore-mercato.json`: dati del valutatore preparati dall'agente
- `cartelli/`: moduli vuoti dei cartelli salone

## Attenzione

Il repository è **pubblico**. Non caricare mai i PDF dello stock, nomi di clienti, indirizzi dei colleghi, dati dei venditori, prezzi di acquisto o costi, margini: il `.gitignore` esclude già i file che li contengono.
