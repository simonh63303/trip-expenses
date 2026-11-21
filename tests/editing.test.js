// The keyboard's Enter key moves between boxes instead of saving, and deleting expenses
// from To sort and from the edit form.
const { openApp, appData, expense } = require('./helpers');

module.exports = async ({ browser, baseURL, check }) => {
  const { context, page: p } = await openApp(browser, baseURL, { data: appData({
    lastBackup: '2026-11-18', categories: ['Food', 'Cash withdrawal', 'Other', 'Uncategorized'],
    expenses: [expense({ id: 'u1', category: 'Uncategorized', amount: 11, note: 'Corner Market' }),
      expense({ id: 'u2', category: 'Uncategorized', amount: 22, note: 'Gibberish scan' }),
      expense({ id: 'u3', category: 'Uncategorized', amount: 33, note: 'Bakery' })],
  }) });
  const count = () => p.evaluate(() => state.expenses.length);
  const focused = () => p.evaluate(() => document.activeElement.id || document.activeElement.tagName);

  // Enter key
  check('Amount, ATM fee and Note have next/done key labels', await p.evaluate(() => ['amount', 'atmFee', 'note'].map(id => $(id).enterKeyHint).join()) === 'next,next,done');
  await p.fill('#amount', '9.50');
  await p.press('#amount', 'Enter');
  check('Enter in Amount saves nothing', await count() === 3, await count());
  check('…and moves to Note', await focused() === 'note', await focused());
  await p.fill('#note', 'Lunch');
  await p.press('#note', 'Enter');
  check('Enter in Note saves nothing and leaves the box', await count() === 3 && await focused() === 'BODY', [await count(), await focused()]);
  await p.selectOption('#category', 'Cash withdrawal');
  await p.press('#amount', 'Enter');
  check('with Cash withdrawal, Enter in Amount goes to ATM fee', await focused() === 'atmFee', await focused());
  await p.selectOption('#category', 'Food');
  await p.click('#saveBtn');
  check('the Save button still saves', await count() === 4 && await p.evaluate(() => state.expenses.at(-1).note) === 'Lunch', await count());
  check('Delete is hidden when adding', await p.isHidden('#deleteRow'));

  // Delete on To sort
  await p.click('#sortBanner');
  p.once('dialog', d => d.dismiss());
  await p.click('[data-sort-del="u2"]');
  check('declining keeps it', await p.evaluate(() => state.expenses.some(e => e.id === 'u2')));
  let question = '';
  p.once('dialog', d => { question = d.message(); d.accept(); });
  await p.click('[data-sort-del="u2"]');
  check('accepting deletes it, and the question names it', !(await p.evaluate(() => state.expenses.some(e => e.id === 'u2'))) && question === 'Delete Gibberish scan ($22.00)?', question);
  check('the To sort list updates', await p.locator('[data-sort-del]').count() === 2);

  // Edit from To sort: Cancel returns there; Delete in the form removes and returns there
  await p.click('[data-sort-edit="u1"]');
  check('editing shows Delete', await p.isVisible('#deleteExpense'));
  check('editing hides Scan receipt and To sort', await p.isHidden('#scanBar'));
  await p.click('#cancelEdit');
  check('Cancel returns to To sort', await p.isVisible('#view-sort'));
  await p.click('[data-sort-edit="u3"]');
  p.once('dialog', d => d.accept());
  await p.click('#deleteExpense');
  check('Delete in the edit form removes it and returns to To sort',
    !(await p.evaluate(() => state.expenses.some(e => e.id === 'u3'))) && await p.isVisible('#view-sort'));

  // Edit from the Trips list still returns to Trips after saving
  await p.click('.tabs button[data-view=trips]');
  await p.evaluate(() => { state.activeTripId = 'everyday'; renderTrips(); });
  await p.click('[data-edit="u1"]');
  await p.selectOption('#category', 'Food');
  await p.click('#saveBtn');
  check('editing from Trips returns to Trips', await p.isVisible('#view-trips') && await p.evaluate(() => state.expenses.find(e => e.id === 'u1').category) === 'Food');
  await p.click('.tabs button[data-view=add]');
  check('Delete is hidden again on the Add tab', await p.isHidden('#deleteRow'));
  check('Scan receipt is back on the Add tab', await p.isVisible('#scanBtn'));
  check('no page errors', !p.errors.length, p.errors);
  await context.close();
};
