// Esporta l'icona disegnata in icona.html nei formati che servono a telefoni e browser.
// Uso: node icone/esporta.js   (usa Chrome e gli strumenti della cartella video/)
const path = require('path'), { execFileSync } = require('child_process');
const puppeteer = require('../video/node_modules/puppeteer-core');
const FFMPEG = require('../video/node_modules/ffmpeg-static');
const DIR = __dirname;

(async () => {
  const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const p = await b.newPage();
  await p.setViewport({ width: 1024, height: 1024 });
  await p.goto('file:///' + path.join(DIR, 'icona.html').replace(/\\/g, '/'));
  const ico = await p.$('#ico');
  // con gli angoli arrotondati e trasparenti (browser, Android "any")
  await ico.screenshot({ path: path.join(DIR, 'grande-tonda.png'), omitBackground: true });
  // a tutto quadrato: iPhone e Android arrotondano da soli
  await p.evaluate(() => document.querySelector('#sfondo').removeAttribute('clip-path'));
  await ico.screenshot({ path: path.join(DIR, 'grande-piena.png') });
  await b.close();
  const scala = (src, lato, out) => execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', path.join(DIR, src), '-vf', `scale=${lato}:${lato}:flags=lanczos`, path.join(DIR, out)]);
  scala('grande-tonda.png', 192, 'icona-192.png');
  scala('grande-tonda.png', 512, 'icona-512.png');
  scala('grande-piena.png', 512, 'icona-maskable-512.png');
  scala('grande-piena.png', 180, 'apple-touch-icon.png');
  console.log('icone esportate');
})();
