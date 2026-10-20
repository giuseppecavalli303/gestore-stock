// Fa funzionare l'app installata anche senza rete, con l'ultimo stock visto.
// Pagina e dati: prima la rete (sempre il piu' aggiornato), la copia salvata solo se la rete manca.
// Caratteri e icone: prima la copia salvata, cambiano di rado.
const VERSIONE = 'stock-v3';
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'icone/icona-192.png', 'icone/icona-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSIONE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== VERSIONE).map(n => caches.delete(n)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const stesso = url.origin === self.location.origin;
  const caratteri = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);

  if (stesso && (req.mode === 'navigate' || /\/data\/[^/]+\.json$/.test(url.pathname) || url.pathname.endsWith('/index.html'))) {
    // i dati si chiedono con ?t=... per saltare la cache del browser: li salvo senza parametri
    const chiave = new Request(url.origin + url.pathname);
    // sempre chiesto al sito (non alla memoria del browser): cosi' una versione nuova si vede subito
    const daRete = req.mode === 'navigate' ? fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }) : fetch(req, { cache: 'no-cache' });
    e.respondWith(daRete.then(r => {
      if (r.ok) { const copia = r.clone(); caches.open(VERSIONE).then(c => c.put(chiave, copia)); }
      return r;
    }).catch(() => caches.match(chiave).then(r => r || caches.match('index.html'))));
    return;
  }
  if (caratteri || (stesso && /\/icone\//.test(url.pathname))) {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(n => { const copia = n.clone(); caches.open(VERSIONE).then(c => c.put(req, copia)); return n; })));
  }
});
