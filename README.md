# Gestore stock

Ricerca veloce nello stock dell'usato a partire dalla stampa PDF giornaliera "Situazione stock autoveicoli usato".

## Come si usa

Apri `index.html` nel browser e trascina dentro il PDF del giorno. Il file viene letto solo nel browser: nessun dato viene inviato a un server. Lo stock resta salvato in quel browser fino al caricamento successivo, e caricando il PDF del giorno dopo l'app mostra cosa è cambiato.

Serve la connessione a internet per scaricare il lettore PDF (pdf.js) e i caratteri.

## File

- `index.html`: l'app completa, pronta per GitHub Pages o per il doppio clic.
- `stock-usato.html`: la stessa app nel formato usato per la pagina su claude.ai.
- `sorgenti/`: i pezzi da cui i due file vengono generati.
  - `parser.js` legge le righe della tabella dal PDF
  - `norm.js` ricava marca, modello, alimentazione, cambio, potenza, anzianità
  - `query.js` interpreta la ricerca scritta a parole
  - `ui.js` e `page.html` sono interfaccia e stile

Dopo una modifica ai sorgenti:

```bash
node sorgenti/build.js
```

## Attenzione

Non caricare mai in questo repository i PDF dello stock: contengono nomi di clienti e venditori. Il `.gitignore` li esclude già.
