// Renaming and merging categories, and filtering the Report by category.
const fs = require('fs');
const { openApp, appData, expense } = require('./helpers');

module.exports = async ({ browser, baseURL, check }) => {
  const { context, page: p } = await openApp(browser, baseURL, { data: appData({
    lastBackup: '2026-11-18', categories: ['Food', 'Transport', 'Shopping', 'Cash withdrawal', 'Other', 'Uncategorized'],
    expenses: [expense({ id: 'e1', date: '2026-11-11', category: 'Food', amount: 10 }), expense({ id: 'e2', date: '2026-11-12', category: 'Food', amount: 20 }),
      expense({ id: 'e3', date: '2026-11-13', category: 'Transport', amount: 5 }), expense({ id: 'e4', date: '2026-11-14', category: 'Shopping', amount: 40 }),
      expense({ id: 'e5', date: '2026-11-15', category: 'Uncategorized', amount: 7 })],
  }) });
  const st = () => p.evaluate(() => ({ cats: state.categories, by: Object.fromEntries(state.expenses.map(e => [e.id, e.category])) }));
  const total = () => p.evaluate(() => $('report').querySelector('.stat .value').textContent);
  const csvOf = async click => { const [d] = await Promise.all([p.waitForEvent('download'), p.click(click)]); return fs.readFileSync(await d.path(), 'utf8'); };

  // Report filter
  await p.click('.tabs button[data-view=report]');
  await p.selectOption('#reportTrip', '__all');
  check('filter: All = $82.00', await total() === '$82.00', await total());
  await p.click('[data-rcat="Food"]');
  check('filter: Food only = $30.00, named in the heading', await total() === '$30.00' && /Food · 2 expenses/.test(await p.textContent('.report-meta')), [await total(), await p.textContent('.report-meta')]);
  await p.click('[data-rcat="Transport"]');
  check('filter: Food + Transport = $35.00', await total() === '$35.00', await total());
  const rows = (await csvOf('#exportDetailsCsv')).trim().split('\r\n');
  check('details CSV holds only the 3 filtered rows', rows.length === 5 && rows.slice(1, 4).every(r => /,(Food|Transport),/.test(r)), rows);
  check('summary CSV names the categories', /Categories,"Food, Transport"/.test(await csvOf('#exportSummaryCsv')));
  await p.hover('[data-rcat="Transport"]');
  const c = await p.$eval('[data-rcat="Transport"]', el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  check('a selected button stays readable while hovered', c[0] !== c[1], c);
  await p.click('[data-rcat="Food"]');
  check('tapping Food again leaves Transport = $5.00', await total() === '$5.00', await total());
  await p.click('[data-rcat=""]');
  check('All resets = $82.00', await total() === '$82.00', await total());
  await p.click('[data-rcat="Food"]'); // left on, to check that a rename carries over

  // Rename and merge
  await p.click('.tabs button[data-view=settings]');
  check('Cash withdrawal and Uncategorized have no rename button', await p.locator('[data-rename-cat="Cash withdrawal"], [data-rename-cat="Uncategorized"]').count() === 0);
  await p.click('[data-rename-cat="Food"]');
  await p.fill('#renameTo', 'Meals');
  await p.click('#catRename button[type=submit]');
  let s = await st();
  check('rename Food to Meals updates the list and its expenses', s.cats[0] === 'Meals' && !s.cats.includes('Food') && s.by.e1 === 'Meals' && s.by.e2 === 'Meals', s);
  check('the Report filter follows the rename', JSON.stringify(await p.evaluate(() => report.cats)) === '["Meals"]', await p.evaluate(() => report.cats));

  await p.click('[data-rename-cat="Transport"]');
  await p.fill('#renameTo', 'meals');
  p.once('dialog', d => d.dismiss());
  await p.click('#catRename button[type=submit]');
  s = await st();
  check('declining a merge changes nothing', s.cats.includes('Transport') && s.by.e3 === 'Transport', s);
  let question = '';
  p.once('dialog', d => { question = d.message(); d.accept(); });
  await p.click('#catRename button[type=submit]');
  s = await st();
  check('accepting a merge moves Transport into Meals', !s.cats.includes('Transport') && s.by.e3 === 'Meals', s);
  check('the merge question names both and the count', question === 'Merge "Transport" into "Meals"? 1 expense will move to Meals.', question);

  await p.click('[data-rename-cat="Shopping"]');
  await p.fill('#renameTo', 'uncategorized');
  await p.click('#catRename button[type=submit]');
  s = await st();
  check('renaming to a built-in name is blocked', s.cats.includes('Shopping') && s.by.e4 === 'Shopping' && await p.isVisible('#catRename'), s);
  await p.click('#renameCancel');

  await p.click('.tabs button[data-view=report]');
  check('Report after the merge: Meals = $35.00', await total() === '$35.00', await total());
  await p.click('.tabs button[data-view=add]');
  const opts = await p.evaluate(() => [...$('category').options].map(o => o.value).join());
  check('Add form categories updated', opts === 'Meals,Shopping,Cash withdrawal,Other,Uncategorized', opts);
  check('no page errors', !p.errors.length, p.errors);
  await context.close();
};
