// Shared setup for the tests.
const fs = require('fs');
const path = require('path');

// The browser's clock is frozen here, so date-based checks ("9 days since the last
// backup") give the same answer whenever the tests run.
const TODAY = '2026-11-19';

// Stand-in for today's rates from open.er-api.com. 150 JPY per USD on purpose, so it
// differs from the real 2026-11-12 rate (159.86) in the fixture.
const TODAY_RATES = { result: 'success', base_code: 'USD', rates: { USD: 1, JPY: 150, EUR: 0.95 } };

// The real fawazahmed0 currency API file for 2026-11-12 (from its npm package).
const RATES_2026_11_12 = fs.readFileSync(path.join(__dirname, 'fixtures', 'usd-2026-11-12.min.json'), 'utf8');

// One expense, with sensible defaults.
function expense(fields) {
  return { tripId: 'everyday', date: '2026-11-12', currency: 'USD', category: 'Food', note: '', atmFee: 0, rate: 1, homeFee: 0, statementAmount: null, ...fields, homeAmount: fields.homeAmount ?? fields.amount };
}

// Saved data as the app stores it.
function appData(fields = {}) {
  return { version: 1, home: 'USD', trips: [], expenses: [], categories: ['Food', 'Transport', 'Cash withdrawal', 'Other'], ...fields };
}

// Opens the app on a phone-sized page. `data` is loaded as the saved data; `init` runs
// before the app's own scripts on every load (for faking browser features).
async function openApp(browser, baseURL, { data, init, viewport = { width: 390, height: 844 } } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  await context.clock.setFixedTime(new Date(`${TODAY}T12:00:00`));
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(e.message));
  await page.route(/open\.er-api\.com/, r => r.fulfill({ json: TODAY_RATES }));
  await page.goto(baseURL);
  if (data) {
    await page.evaluate(s => localStorage.setItem('tripExpenses.data', s), JSON.stringify(data));
    await page.reload();
  }
  return { context, page };
}

// Draws a receipt photo: tilted, on a grey background, like a phone picture.
// Returns a PNG ready for setInputFiles.
async function receiptPhoto(browser) {
  const page = await browser.newPage({ viewport: { width: 520, height: 760 } });
  const row = (a, b, bold) => `<div style="display:flex;justify-content:space-between${bold ? ';font-weight:bold' : ''}"><span>${a}</span><span>${b}</span></div>`;
  await page.setContent(`<body style="margin:0;background:#8a8f94;display:grid;place-items:center;height:760px">
    <div style="transform:rotate(-2deg);background:#fbfaf6;width:340px;padding:24px 22px;font:17px/1.5 'DejaVu Sans Mono',monospace;color:#222;box-shadow:0 4px 18px #0006">
      <div style="text-align:center;font-weight:bold;font-size:21px">CORNER MARKET</div>
      <div style="text-align:center">88 Elm Street</div>
      <div style="text-align:center">Tel 314-555-0199</div><br>
      <div>11/17/2026 &nbsp; 09:41</div><br>
      ${row('COFFEE BEANS', '12.99')}${row('OAT MILK', '4.49')}${row('BAGELS 6PK', '5.25')}<br>
      ${row('SUBTOTAL', '22.73')}${row('TAX', '1.88')}${row('TOTAL', '$24.61', true)}<br>
      <div style="text-align:center">THANK YOU!</div>
    </div></body>`);
  const buffer = await page.screenshot();
  await page.close();
  return { name: 'receipt.png', mimeType: 'image/png', buffer };
}

// Waits until a scan has finished and the status says how it went.
const scanDone = page => page.waitForFunction(() => /Found|Couldn't|Could not/.test(document.getElementById('scanStatus').textContent), null, { timeout: 120000 });

module.exports = { TODAY, TODAY_RATES, RATES_2026_11_12, expense, appData, openApp, receiptPhoto, scanDone };
