# Istruzioni per gli assistenti (Claude, ChatGPT, Codex…)

Questo file è il punto di partenza per qualunque assistente lavori al progetto. Panoramica del progetto: [README.md](README.md).

## Chi è l'utente

Giuseppe Cavalli, venditore dell'usato da Valentino Automobili (Roma). Scrive in italiano e vuole risposte in italiano semplice, senza gergo tecnico. Non è il responsabile degli altri venditori.

## Regole fisse

- **Il repo è pubblico.** Mai committare:
  - stampe PDF dello stock e nomi dei clienti (nei dati pubblici viaggiano cifrati, la chiave resta sul PC);
  - indirizzi email privati;
  - dati e classifiche dei venditori, giudizi sulle sedi o sui loro responsabili;
  - prezzi di acquisto, costi di carrozzeria, provvigioni, margini del valutatore (solo nella proprietà VAL_CONFIG del servizio Google).
- I file locali e riservati sono elencati in `.gitignore`: tenerli lì.
- **Rapporti e classifiche dei venditori vanno solo a Giuseppe.** Agli altri si manda qualcosa solo se lo chiede lui esplicitamente, e senza testo nel corpo della mail.
- **Elenchi, controlli e rapporti si consegnano sempre in PDF** (`agente/stampa-pdf.js`), salvati in `agente/rapporti/` (non pubblicata).
- **Finanziamenti:**
  - mai inventare tassi, durate, anticipi o maxirate: vanno chiesti;
  - ogni simulazione mostra TAN, TAEG e "simulazione indicativa, non vincolante";
  - i tassi dell'app devono coincidere con il simulatore (lo controlla `npm test`).
- **Prezzi:**
  - l'app mostra il totale (veicolo + passaggio), il sito il prezzo del veicolo;
  - se il totale non torna, l'auto è "Prezzo da verificare" e il prezzo barrato non si mostra;
  - ogni mattina parte il controllo prezzi (`posta.js prezzi`).
- **Esclusioni dai numeri dei venditori:**
  - le vendite dei responsabili (cessioni a commercianti, vendite particolari) non contano;
  - l'elenco è in `agente/vendite-escluse.json`, locale.
- **Non toccare `data/mercato.json`** a mano.

## CROSS Sales (gestionale della casa)

- **Solo lettura.** Prima di salvare o modificare qualcosa si chiede sempre a Giuseppe.
- **Come leggere una pratica:**
  - non aprire una nuova istanza dell'app (chiede un nuovo login): portare in primo piano la finestra già aperta;
  - premere F6, scrivere il numero di pratica e premere Invio;
  - i numeri di pratica si ricavano dall'export della lista pratiche VU (F8, "Esport.", file `c:\cross2\temp\export.txt`).
- **Cosa c'è nella pratica:**
  - prezzo di ingresso: "Accordo di ritiro" (netto);
  - per VTI ed estero, la "Vettura-Fattura d'entrata" comprende l'IVA;
  - ripristino carrozzeria: righe "OFF-Fattura d'entrata" di Croce Autogroup, Corvaglia, Autocentri Tiburtina e altre carrozzerie, IVA compresa (1.220 = 1.000 + IVA);
  - le fatture dell'officina interna (Valentino) non hanno IVA.
- **Come presentare i prezzi di acquisto:** sempre IVA compresa, perché gli acquisti sono misti (privati e permute senza IVA, VTI con IVA).
- **Prezzo speciale:** le auto a prezzo speciale (colonna della stampa, campo `spec`) si vendono così come sono e non vanno in carrozzeria. Per loro l'assenza di fatture di carrozzeria è normale.
- **Attenzione agli avvisi:**
  - dopo l'apertura di una pratica compare spesso un popup "Avviso Lista";
  - mai premere tasti senza aver guardato lo schermo, perché "Dettagli" apre un modulo modificabile e Invio salva;
  - nell'accordo di ritiro non premere "Eseguire", perché accanto c'è l'azione "Cancella".
- Nell'elenco pratiche le colonne dei prezzi di acquisto escono "*" per l'utenza di Giuseppe: i dati si leggono pratica per pratica.
- **Prezzi di vendita veri:** il "PV-lordo" invece si vede. F8, nei criteri lasciare solo lo stato "Concluso" e una data di consegna "da"; OK, "Leggere tutto"; da "Configuraz." aggiungere Targa e Data consegna e premere "Applicare" (non "Salvare la selezione"); "Esport.". Il file va copiato in `agente/cross-vendute.txt` (escluso dal repo) e lo usa `prezzi-consigliati.js`. Il PV-lordo è il prezzo veicolo senza passaggio; valori fuori dal 70-110% del prezzo esposto sono errori di registrazione.

## Come si lavora

- Dopo ogni modifica a `sorgenti/`: `npm run build`, poi `npm test`, che deve dire "Tutto in ordine".
- Commit piccoli con messaggi in italiano che dicono cosa cambia per chi usa l'app.
- La copia di sicurezza su Google Drive la aggiorna l'agente da solo ogni 10 minuti (`agente/backup-drive.ps1`). Dopo un lavoro importante si può lanciare anche a mano.
- **Tenere aggiornati README.md e questo file** con quello che si fa, così ogni assistente sa a che punto è il progetto. Le informazioni riservate restano fuori.

## Diario delle novità

- **18/11/2026:**
  - prezzi consigliati per le libere senza prezzo (`agente/prezzi-consigliati.js`, PDF): vendite simili dalle stampe, prezzo adeguato ad anno e km (circa 5% all'anno e 2,5% ogni 10.000 km, calcolato modello per modello), prezzo veicolo arrotondato a 450/950. Il prezzo delle vendite è quello in stampa alla prenotazione: lo sconto finale non c'è;
  - l'archivio delle stampe ha dei buchi (circa 100 giorni feriali su 1.150, il più lungo dal 23/07 al 05/08/2026): gli arrivi si contano sulla data di ingresso scritta nella stampa (campo `ingr`), non sul primo giorno in cui l'auto compare;
  - cartelli da cambiare: ogni mattina un PDF per Giuseppe con le auto a cui è cambiato il prezzo, divise per sede, e i cartelli salone già compilati (alle sedi solo se lo chiede lui);
  - analisi dello stock 2022-2026 (squadre e piazzali per sede, libere senza prezzo). Il codice con i giudizi sulle sedi resta locale (`agente/analisi-stock.js` in `.gitignore`), mentre è pubblica solo la raccolta dati generica;
  - copia di sicurezza di tutto il progetto su Google Drive, aggiornata a ogni giro dell'agente;
  - controllo prezzi automatico ogni mattina;
  - "Prezzo da verificare" anche per i totali che non tornano (es. GW745CE);
  - tassi allineati al simulatore;
  - elenco delle libere senza prezzo e prezzi di ingresso da CROSS, in PDF, con il ripristino carrozzeria e il prezzo speciale.
- **Novembre 2026:**
  - scheda Storico con grafici dal 2022 (archivio stampe su Drive);
  - giorni di pubblicazione AutoScout;
  - cambio dedotto dai listini VW;
  - rapporti dei venditori solo per Giuseppe;
  - mail promo senza sconto.
