// Runs every tests/*.test.js in a headless browser against the app.
//   npm test               all tests
//   npm test -- rates      only files whose name contains "rates"
// Exits with code 1 if any check fails.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.gz': 'application/gzip', '.md': 'text/plain',
};

// A plain static file server for the repo, like GitHub Pages.
function serve() {
  const server = http.createServer((req, res) => {
    let file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(body);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

(async () => {
  const only = process.argv[2] || '';
  const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js') && f.includes(only)).sort();
  const server = await serve();
  const baseURL = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  let fails = 0, passes = 0;
  const started = Date.now();
  for (const f of files) {
    console.log(`\n== ${f}`);
    const t = { fails: 0, passes: 0 };
    const check = (label, ok, got) => {
      ok ? t.passes++ : t.fails++;
      console.log(`${ok ? '  ok  ' : '  FAIL'} ${label}${ok ? '' : `\n         got: ${JSON.stringify(got)}`}`);
    };
    try {
      await require(path.join(__dirname, f))({ browser, baseURL, check });
    } catch (err) {
      t.fails++;
      console.log(`  FAIL ${f} stopped: ${err.message}`);
    }
    fails += t.fails; passes += t.passes;
  }
  await browser.close();
  server.close();
  console.log(`\n${passes} passed, ${fails} failed (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  process.exit(fails ? 1 : 0);
})();
