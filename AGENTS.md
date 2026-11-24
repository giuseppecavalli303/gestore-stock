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
- **Riportare in primo piano CROSS:** non usare l'avvio dell'app (nge/xstart), perché apre una seconda istanza che dà "C2 Client Initialization Error": portare in primo piano la finestra del processo `nge` già aperto. Se il server CROSS è stato aggiornato, al primo comando chiede di chiudere e rientrare: il login lo fa Giuseppe. Il PC si blocca quando Giuseppe chiude TeamViewer: va sbloccato e lasciato collegato durante il lavoro.
- **Vendite di un venditore con i dati dei clienti:** F8, scheda "Prop.d'acq.": "Prop.d'acq. esistente" = Sì, stato firmato e concluso, data prop. d'acq. "da", venditore dal tasto "…". Le colonne del cliente sono "CL della prop.d'acq. - …" (Intest.riga1, Cognome, Nome, Agg.al nome, Contatto 1 e 2 = telefono ed email; per l'indirizzo nel file contatti anche Strada, Strada numero, C.A.P., Località, Provincia). La colonna "Acquirente" è chi ha comprato l'auto per lo stock, non il venditore: il venditore è la colonna "Venditore da prop.d'acq.". Un venditore può avere più codici (i vecchi sono "-- CANCELLATO --"), quindi si raggruppa per nome. Le poche vendite registrate con un altro venditore si ritrovano per targa dalle stampe (campo `vend`). Lo script che fa l'elenco resta locale.
- **Prezzi di vendita veri:** il "PV-lordo" invece si vede. F8, nei criteri lasciare solo lo stato "Concluso" e una data di consegna "da"; OK, "Leggere tutto"; da "Configuraz." aggiungere Targa e Data consegna e premere "Applicare" (non "Salvare la selezione"); "Esport.". Il file va copiato in `agente/cross-vendute.txt` (escluso dal repo) e lo usa `prezzi-consigliati.js`. Il PV-lordo è il prezzo veicolo senza passaggio; valori fuori dal 70-110% del prezzo esposto sono errori di registrazione.

## Come si lavora

- Dopo ogni modifica a `sorgenti/`: `npm run build`, poi `npm test`, che deve dire "Tutto in ordine".
- Commit piccoli con messaggi in italiano che dicono cosa cambia per chi usa l'app.
- La copia di sicurezza su Google Drive la aggiorna l'agente da solo ogni 10 minuti (`agente/backup-drive.ps1`). Dopo un lavoro importante si può lanciare anche a mano.
- **Tenere aggiornati README.md e questo file** con quello che si fa, così ogni assistente sa a che punto è il progetto. Le informazioni riservate restano fuori.

## Diario delle novità

- **20/11/2026:** elenchi dei clienti di Giuseppe e dei colleghi di Tiburtina dal 2022 (`agente/clienti-venduti.js`, PDF ed Excel, raggruppati per cliente). I colleghi sono i destinatari della mail del riepilogo (Sfregola e Valentino esclusi); `--tutti` li fa per ogni venditore. Dati da CROSS (export in `agente/cross-clienti-tutte.txt`) e dalle stampe. Gli elenchi restano sul PC e nel Drive privato di Giuseppe, mai nel repo né mandati ad altri. Giuseppe vuole poi una lista broadcast WhatsApp con i suoi clienti, dopo aver tolto quelli con cui non è andata bene: le liste si creano solo dal telefono (massimo 256 contatti), si può preparare un file contatti da importare in rubrica.
- **24/11/2026:** ricerca per telaio nell'app: il telaio intero diventa le sue ultime 8 cifre (la "targa" delle auto non targate, es. TW258184), 6 cifre da sole che chiudono un telaio in stock cercano l'auto invece di fare da budget, e il telaio dell'annuncio del sito entra nella ricerca.
- **21/11/2026:** la lista clienti di Giuseppe si aggiorna da sola ogni sera dalle 19 (`clienti-venduti.js --mio`, passo 3c dell'agente): le prenotazioni nuove arrivano dalla stampa (nome cliente decifrato con la chiave dei nomi, memoria in `agente/clienti-stampe.json`, locale), i telefoni dall'ultima esportazione CROSS. Insieme al PDF e all'Excel esce `I miei clienti.vcf`, il file contatti per l'iPhone (si importa da icloud.com › Contatti › Importa contatto, oppure aprendolo sull'iPhone). Nei nomi si tolgono i titoli (Signor, Signora, Ditta…). Il giro serale in CROSS non è automatico: serve il PC sbloccato e consuma i limiti di Claude; l'esportazione si rifà quando Giuseppe lo chiede (o la fa lui: F8 con le colonne già descritte, "Esport."), lo script la prende da sola. Il codice modello delle auto è nella scheda vettura di CROSS (lente accanto a "Vettura" nella pratica, campo "Cod.modello"): la scheda è modificabile, si chiude con "Interrompere", mai "Salvare".

- **19/11/2026:**
  - valutatore permute più vicino ad Autorola, senza toccare il servizio Google:
    - le nostre vendite degli ultimi 2 anni entrano nel valutatore (`agente/valutatore-dati.js` → `data/valutatore-vendite.json`). Sono compresse e cifrate con la chiave dei nomi clienti; niente targhe, venditori o costi; da CROSS solo il rapporto medio di incasso. Con almeno 3 vendite simili (stessa marca, modello e carburante, età alla vendita entro 1 anno e mezzo) la rivendita "se la teniamo" viene dal nostro prezzo veicolo alla prenotazione, adeguato ad anno e km. I giorni di vendita si contano dal primo prezzo, non dall'ingresso;
    - il mercato letto dal PC una volta al giorno dalle 14 (`agente/valutatore-mercato.js` → `data/valutatore-mercato.json`): 25 modelli più entrati, fino a 5 anni ciascuno, AutoScout e Subito. Il valutatore aggiunge gli annunci di Subito quando il servizio Google non li legge e mostra le auto in vendita e il prezzo dell'ultimo mese (serve almeno un mese di dati);
    - Automobile.it risponde 404 per i modelli con il trattino (T-Roc, T-Cross): va sistemato l'indirizzo nel servizio Google (`urlPortali` in `assistente/Valutatore.gs`).
  - prezzi consigliati: prima pagina con il grafico delle auto da prezzare per prime. Sono "pronte" quelle con fattura di carrozzeria in CROSS o con prezzo speciale; oltre i 45 giorni in casa (campo `giorni` della stampa) l'auto comincia a essere un problema. La tabella è divisa in tre gruppi, ognuno dalla più vecchia.
  - cartelli da cambiare solo per Prenestina e Tuscolana: lì il cartello va anche sulle auto fuori dal salone (piazzale esterno a Prenestina, secondo piano a Tuscolana). A Tiburtina c'è solo sulle poche auto del salone e lo curano i venditori, quindi la sede non è più nell'elenco (nemmeno i depositi Tiburtina 2 e 1128).
- **18/11/2026:**
  - i cartelli da cambiare escono con le dotazioni: per ogni auto con annuncio sul sito lo script chiede nome e righe al servizio Google, come il tasto "Cartello salone", una richiesta alla volta (insieme vengono rifiutate); le scelte restano in `agente/cartelli-dotazioni.json` (locale). Senza annuncio, o se l'annuncio non elenca le dotazioni (es. 500 km0), le righe restano vuote e il PDF elenca le targhe;
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
