// Real receipts, from the reader's saved text output (tests/fixtures/receipts). The photos
// are not kept, and private numbers and places in the text are blanked or swapped for
// made-up ones. Each case replays the app's steps: parse the first read, take the second
// read only if the app would, merge, and check the shop name, total and date.
const fs = require('fs');
const path = require('path');
const { openApp } = require('./helpers');

const DIR = path.join(__dirname, 'fixtures', 'receipts');

module.exports = async ({ browser, baseURL, check }) => {
  const { context, page } = await openApp(browser, baseURL);
  for (const f of fs.readdirSync(DIR).filter(f => f.endsWith('.json')).sort()) {
    const fx = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const got = await page.evaluate(fx => {
      const first = parseReceipt(fx.first.text, fx.today, fx.first.lines);
      const again = needsSecondRead(first);
      const r = again && fx.second ? mergeReads(first, parseReceipt(fx.second.text, fx.today, fx.second.lines)) : first;
      return { merchant: r.merchant, amount: r.amount, date: r.date, again };
    }, fx);
    const e = fx.expected;
    check(`${fx.receipt}: second read only when needed`, got.again === !!fx.second, got.again);
    check(`${fx.receipt}: name ${JSON.stringify(e.merchant)}`, got.merchant === e.merchant, got.merchant);
    check(`${fx.receipt}: total ${e.amount}`, got.amount === e.amount, got.amount);
    check(`${fx.receipt}: date ${e.date}`, got.date === e.date, got.date);
  }
  check('no page errors', !page.errors.length, page.errors);
  await context.close();
};
