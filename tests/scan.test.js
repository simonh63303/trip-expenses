// Upgrading old data, scanning a receipt with the real OCR, sorting it, and scanning offline.
const { openApp, appData, expense, receiptPhoto, scanDone } = require('./helpers');

module.exports = async ({ browser, baseURL, check }) => {
  const photo = await receiptPhoto(browser);
  // Data saved by a version before the Everyday trip and Uncategorized category existed.
  const { context, page } = await openApp(browser, baseURL, { data: appData({
    activeTripId: 't1', lastBackup: '2026-11-18',
    trips: [{ id: 't1', name: 'Japan spring', start: '2026-04-01', end: '2026-04-10', currency: 'JPY' }],
    expenses: [expense({ id: 'a', tripId: 't1', date: '2026-04-01', amount: 1500, currency: 'JPY', note: 'Ramen', rate: 150, homeAmount: 10 })],
  }) });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // now the service worker controls the page, as on a phone

  const m = await page.evaluate(() => ({ trips: state.trips.map(t => t.name), active: state.activeTripId, cats: state.categories, n: state.expenses.length }));
  check('upgrade adds Everyday first and keeps the trip', m.trips.join() === 'Everyday,Japan spring' && m.active === 't1', m);
  check('upgrade adds Uncategorized and keeps the expense', m.cats.includes('Uncategorized') && m.n === 1, m);

  await page.setInputFiles('#scanFile', photo);
  await scanDone(page);
  const f = await page.evaluate(() => ({ amount: $('amount').value, date: $('date').value, note: $('note').value, cat: $('category').value, trip: $('expTrip').value }));
  check('scan reads total (not subtotal), date and shop', f.amount === '24.61' && f.date === '2026-11-17' && f.note === 'Corner Market', f);
  check('scan lands in Everyday as Uncategorized', f.cat === 'Uncategorized' && f.trip === 'everyday', f);

  await page.click('#saveBtn');
  check('"1 to sort" button appears', (await page.textContent('#sortBanner')).startsWith('1 to sort'));
  check('form goes back to the active trip', await page.inputValue('#expTrip') === 't1');

  await page.click('#sortBanner');
  await page.selectOption('[data-move]', 't1');
  await page.click('[data-cat="Food"]');
  const s = await page.evaluate(() => { const x = state.expenses.find(e => e.note === 'Corner Market'); return { cat: x.category, trip: x.tripId, banner: $('sortBanner').hidden }; });
  check('To sort moves it to a trip and files it', s.cat === 'Food' && s.trip === 't1' && s.banner, s);

  await context.setOffline(true);
  await page.reload();
  await page.click('.tabs button[data-view=add]');
  await page.setInputFiles('#scanFile', photo);
  await scanDone(page);
  check('scanning works offline after the first scan', /Found \$24\.61/.test(await page.textContent('#scanStatus')), await page.textContent('#scanStatus'));
  check('no page errors', !page.errors.length, page.errors);
  await context.close();
};
