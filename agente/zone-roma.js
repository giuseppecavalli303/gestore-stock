// Zone di Roma e provincia per organizzare le visite ai clienti: Roma per C.A.P. lungo le consolari, partendo dalla sede
// di via Tiburtina e girando in senso orario; la provincia per comune; il resto per provincia.
// I quartieri accanto a ogni C.A.P. sono indicativi (un C.A.P. copre piu' zone). Nessun dato di clienti qui.

const ZONE_ROMA = [
  ['Roma · Tiburtina (vicino alla sede)', {
    '00131': 'Settecamini, Case Rosse', '00155': 'Colli Aniene, Tor Sapienza, La Rustica',
    '00156': 'Rebibbia, Ponte Mammolo, San Basilio', '00157': 'Pietralata, Monti Tiburtini',
    '00158': 'Tiburtino, Collatino', '00159': 'Casal Bertone, Portonaccio' }],
  ['Roma · Nomentana, Montesacro, Salario', {
    '00137': 'Talenti, Nuovo Salario', '00138': 'Fidene, Serpentara, Settebagni', '00139': 'Bufalotta, Porta di Roma',
    '00141': 'Montesacro, Città Giardino', '00161': 'Nomentano, Policlinico', '00162': 'Nomentano, Villa Torlonia',
    '00198': 'Salario, Trieste', '00199': 'Trieste, Africano' }],
  ['Roma · Nord: Flaminio, Parioli, Cassia', {
    '00123': 'La Storta, Cesano', '00188': 'Prima Porta, Labaro', '00189': 'Cassia, Tomba di Nerone, Grottarossa',
    '00191': 'Vigna Clara, Tor di Quinto', '00196': 'Flaminio', '00197': 'Parioli' }],
  ['Roma · Nord-Ovest: Prati, Aurelio, Boccea, Monte Mario', {
    '00135': 'Ottavia, Monte Mario Alto', '00136': 'Balduina, Trionfale', '00165': 'Aurelio, Gregorio VII',
    '00166': 'Boccea, Casalotti', '00167': 'Aurelio, Valle Aurelia', '00168': 'Primavalle, Torrevecchia',
    '00192': 'Prati', '00193': 'Borgo, Prati', '00195': 'Prati, Della Vittoria' }],
  ['Roma · Centro', {
    '00184': 'Monti, Esquilino', '00185': 'Esquilino, San Lorenzo', '00186': 'Centro storico', '00187': 'Centro, Via Veneto' }],
  ['Roma · Ovest: Monteverde, Portuense, Magliana', {
    '00146': 'Marconi, Ostiense', '00148': 'Magliana, Ponte Galeria', '00149': 'Portuense, Marconi',
    '00151': 'Monteverde Nuovo', '00152': 'Monteverde Vecchio', '00153': 'Trastevere, Testaccio' }],
  ['Roma · Litorale: Ostia, Acilia, Casal Palocco', {
    '00119': 'Ostia Antica', '00121': 'Ostia Ponente', '00122': 'Ostia Lido', '00124': 'Casal Palocco, Infernetto',
    '00125': 'Acilia', '00126': 'Dragona, Malafede', '00127': 'Vitinia, Mezzocammino' }],
  ['Roma · Sud: EUR, Laurentina, Garbatella', {
    '00128': 'Spinaceto, Trigoria', '00134': 'Cecchignola, Castel di Leva', '00142': 'EUR, Montagnola',
    '00143': 'Laurentino', '00144': 'EUR, Torrino', '00145': 'Garbatella, San Paolo', '00147': 'Navigatori, Tor Marancia',
    '00154': 'Ostiense, San Saba' }],
  ['Roma · Sud-Est: Appia, Tuscolana, Cinecittà', {
    '00118': 'Morena, Romanina', '00173': 'Cinecittà, Don Bosco', '00174': 'Tuscolano, Quadraro', '00175': 'Tuscolano',
    '00178': 'Appia Antica, Capannelle', '00179': 'Appio Latino, Furio Camillo', '00181': 'Appio, San Giovanni',
    '00182': 'Appio, Re di Roma', '00183': 'San Giovanni' }],
  ['Roma · Est: Prenestina, Casilina, Centocelle', {
    '00132': 'Lunghezza, Ponte di Nona', '00133': 'Torre Angela, Tor Vergata', '00169': 'Torre Maura, Alessandrino',
    '00171': 'Torpignattara, Casilino', '00172': 'Centocelle', '00176': 'Pigneto, Prenestino', '00177': 'Prenestino, Villa Gordiani' }],
];

const ZONE_PROVINCIA = [
  ['Provincia · Tiburtina, Nomentana, Valle dell\'Aniene', 'Guidonia Montecelio, Tivoli, Tivoli Terme, Fonte Nuova, Mentana, Monterotondo, Palombara Sabina, Marcellina, Montelibretti, Moricone, Sant\'Angelo Romano, San Polo dei Cavalieri, Castel Madama, Vicovaro, Subiaco, Ciciliano, Nerola, Montorio Romano, Monteflavio, Roviano, Arsoli, Agosta, Cerreto Laziale, Sambuci, Saracinesco, Anticoli Corrado, Licenza, Percile, Mandela, Gerano, Pisoniano, Rocca Canterano, Jenne, Affile, Arcinazzo Romano, Cineto Romano, Riofreddo, Vallinfreda, Vivaro Romano, Marano Equo, Rocca Santo Stefano, Canterano, Roiate'],
  ['Provincia · Flaminia, Cassia, Braccianese', 'Campagnano di Roma, Capena, Castelnuovo di Porto, Fiano Romano, Formello, Morlupo, Rignano Flaminio, Sacrofano, Sant\'Oreste, Riano, Magliano Romano, Mazzano Romano, Civitella San Paolo, Ponzano Romano, Filacciano, Torrita Tiberina, Nazzano, Bracciano, Anguillara Sabazia, Trevignano Romano, Manziana, Canale Monterano'],
  ['Provincia · Litorale nord, Aurelia', 'Fiumicino, Ladispoli, Cerveteri, Santa Marinella, Civitavecchia, Tolfa, Allumiere'],
  ['Provincia · Castelli Romani', 'Ciampino, Marino, Frascati, Grottaferrata, Rocca di Papa, Rocca Priora, Monte Porzio Catone, Monte Compatri, Albano Laziale, Castel Gandolfo, Ariccia, Genzano di Roma, Lanuvio, Nemi, Velletri, Lariano, Colonna'],
  ['Provincia · Pontina, Litorale sud', 'Pomezia, Ardea, Anzio, Nettuno'],
  ['Provincia · Prenestina, Casilina', 'San Cesareo, Zagarolo, Palestrina, Gallicano nel Lazio, Valmontone, Labico, Colleferro, Artena, Olevano Romano, Genazzano, Cave, Rocca di Cave, Capranica Prenestina, San Vito Romano, Bellegra, Segni, Gavignano, Montelanico, Carpineto Romano, Gorga, Castel San Pietro Romano, Poli, Casape, San Gregorio da Sassola'],
];

const LAZIO = { LT: 'Latina', RI: 'Rieti', VT: 'Viterbo', FR: 'Frosinone' };
const norm = s => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');
const comuneZona = new Map();
for (const [zona, comuni] of ZONE_PROVINCIA) for (const c of comuni.split(', ')) comuneZona.set(norm(c), zona);
const capZona = new Map();
for (const [zona, caps] of ZONE_ROMA) for (const [cap, q] of Object.entries(caps)) capZona.set(cap, { zona, quartiere: q });

// ordine delle zone nel PDF: prima Roma (dalla sede in senso orario), poi la provincia, poi il resto
const ORDINE = [...ZONE_ROMA.map(z => z[0]), 'Roma · C.A.P. da verificare', ...ZONE_PROVINCIA.map(z => z[0]),
  'Provincia di Roma · altri comuni', 'Lazio fuori provincia', 'Altre regioni', 'Senza indirizzo'];

// indirizzo { cap, loc, prov } -> { zona, gruppo } ; gruppo = quartiere (Roma) o comune
function zonaDi(a) {
  const titolo = s => String(s || '').toLowerCase().replace(/(^|[\s'])\S/g, m => m.toUpperCase());
  if (!a || (!a.cap && !a.loc)) return { zona: 'Senza indirizzo', gruppo: '' };
  const cap = String(a.cap || '').trim(), prov = String(a.prov || '').trim().toUpperCase(), loc = norm(a.loc);
  if (loc === 'ROMA' || (!loc && /^001\d\d$/.test(cap))) {
    const z = capZona.get(cap);
    return z ? { zona: z.zona, gruppo: `${cap} · ${z.quartiere}` } : { zona: 'Roma · C.A.P. da verificare', gruppo: cap || '?' };
  }
  if (comuneZona.has(loc)) return { zona: comuneZona.get(loc), gruppo: titolo(a.loc) };
  if (prov === 'RM') return { zona: 'Provincia di Roma · altri comuni', gruppo: titolo(a.loc) };
  if (LAZIO[prov]) return { zona: 'Lazio fuori provincia', gruppo: `${titolo(a.loc)} (${prov})` };
  return { zona: 'Altre regioni', gruppo: `${titolo(a.loc)} (${prov})` };
}

module.exports = { zonaDi, ORDINE, ZONE_ROMA, ZONE_PROVINCIA };
