// Exchange rates for past dates, from the fawazahmed0 currency API (answered here from a
// real 2026-11-12 file), with today's rate as the fallback.
const { openApp, appData, expense, RATES_2026_11_12 } = require('./helpers');

module.exports = async ({ browser, baseURL, check }) => {
  const { context, page: p } = await openApp(browser, baseURL);
  const hits = [];
  let delay = 0;
  await p.route(/cdn\.jsdelivr\.net\/npm\/@fawazahmed0/, async r => {
    const u = r.request().url();
    hits.push('main ' + u.match(/@([\d-]+)/)[1]);
    if (!/2026-11-12/.test(u)) return r.abort();
    if (delay) await new Promise(res => setTimeout(res, delay));
    return r.fulfill({ body: RATES_2026_11_12, contentType: 'application/json' });
  });
  await p.route(/currency-api\.pages\.dev/, r => {
    const u = r.request().url();
    hits.push('backup ' + u.match(/\/\/([\d-]+)\./)[1]);
    if (!/2026-11-05/.test(u)) return r.abort();
    return r.fulfill({ body: RATES_2026_11_12.replace('2026-11-12', '2026-11-05').replace('"jpy":159.86165614', '"jpy":157.5'), contentType: 'application/json' });
  });
  await p.evaluate(s => localStorage.setItem('tripExpenses.data', s), JSON.stringify(appData({
    lastBackup: '2026-11-18', activeTripId: 't1', trips: [{ id: 't1', name: 'Japan', start: '', end: '', currency: 'JPY' }],
    expenses: [expense({ id: 'old', tripId: 't1', date: '2026-11-10', amount: 2000, currency: 'JPY', note: 'Sushi', rate: 155, homeAmount: 12.9 })],
  })));
  await p.reload();
  await p.waitForFunction(() => Rates.get('JPY', 'USD') === 150);
  await p.evaluate(() => setRateField());

  const conv = () => p.textContent('#converted');
  const rate = () => p.inputValue('#rate');
  const setDate = async d => { await p.fill('#date', d); await p.dispatchEvent('#date', 'change'); };
  const settle = () => p.waitForFunction(() => !/getting the rate/.test($('converted').textContent));

  await p.fill('#amount', '1000');
  await p.dispatchEvent('#amount', 'input');
  check("today's date: today's rate, no note", await rate() === '150' && await conv() === '≈ $6.67', [await rate(), await conv()]);
  await setDate('2026-11-12'); await settle();
  check("Nov 12: that day's rate, with a note", await rate() === '159.862' && await conv() === '≈ $6.26 · rate for Nov 12', [await rate(), await conv()]);
  await p.click('#saveBtn');
  let saved = await p.evaluate(() => state.expenses.at(-1));
  check("saved with Nov 12's rate", saved.rate === 159.862 && saved.homeAmount === 6.26 && saved.date === '2026-11-12', saved);

  await p.fill('#amount', '500');
  await p.dispatchEvent('#amount', 'input');
  await p.evaluate(() => { $('rateDetails').open = true; });
  await p.fill('#rate', '161');
  await p.dispatchEvent('#rate', 'input');
  await setDate('2026-11-05');
  await p.waitForTimeout(300);
  await p.evaluate(() => updateRates(true));
  await p.waitForTimeout(300);
  check('a typed rate survives a date change and a refresh', await rate() === '161', await rate());

  await p.click('#rateForDate'); await settle();
  check('main address fails: backup used', await rate() === '157.5' && hits.includes('main 2026-11-05') && hits.includes('backup 2026-11-05'), [await rate(), hits]);
  await setDate('2026-11-03'); await settle();
  check("both fail: today's rate, and the note says so", await rate() === '150' && /couldn't get the rate for Nov 3, so today's rate is used/.test(await conv()), [await rate(), await conv()]);
  const before = hits.length;
  await setDate('2023-06-01'); await settle();
  check('before March 2024: note says so, no request', /no rates before March 2024/.test(await conv()) && hits.length === before, [await conv(), hits.slice(before)]);
  await setDate('2026-11-12'); await settle();
  check('a date already fetched is not fetched again', await rate() === '159.862' && hits.filter(h => h === 'main 2026-11-12').length === 1, hits);

  await p.click('.tabs button[data-view=trips]');
  await p.click('[data-edit="old"]');
  await setDate('2026-11-12');
  await p.waitForTimeout(300);
  check('editing: a date change keeps the saved rate', await rate() === '155', await rate());
  await p.evaluate(() => { $('rateDetails').open = true; });
  await p.click('#rateForDate'); await settle();
  check("editing: the button applies the date's rate", await rate() === '159.862', await rate());
  await p.click('#cancelEdit');

  await p.click('.tabs button[data-view=add]');
  await p.evaluate(() => localStorage.removeItem('tripExpenses.pastRates'));
  await p.reload();
  await p.waitForFunction(() => Rates.get('JPY', 'USD') === 150);
  delay = 1500;
  await p.fill('#amount', '3000');
  await p.dispatchEvent('#amount', 'input');
  await setDate('2026-11-12');
  await p.click('#saveBtn');
  await p.waitForFunction(() => state.expenses.some(e => e.amount === 3000), null, { timeout: 5000 });
  saved = await p.evaluate(() => state.expenses.find(e => e.amount === 3000));
  check('Save waits for a rate still loading', saved.rate === 159.862, saved);
  check('no page errors', !p.errors.length, p.errors);
  await context.close();
};
