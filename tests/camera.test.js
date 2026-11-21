// Scan receipt opens the camera; From photos opens the picker. Both read the receipt.
const { openApp, appData, receiptPhoto, scanDone } = require('./helpers');

module.exports = async ({ browser, baseURL, check }) => {
  const photo = await receiptPhoto(browser);
  const { context, page } = await openApp(browser, baseURL, { data: appData({ lastBackup: '2026-11-18' }) });
  const a = await page.evaluate(() => ({ cam: $('scanCamera').getAttribute('capture'), pick: $('scanFile').getAttribute('capture') }));
  check('camera button asks for the back camera; From photos does not', a.cam === 'environment' && a.pick === null, a);
  for (const id of ['scanCamera', 'scanFile']) {
    await page.evaluate(() => resetExpenseForm());
    await page.setInputFiles('#' + id, photo);
    await scanDone(page);
    const f = await page.evaluate(() => [$('amount').value, $('note').value, $('scanCamera').disabled || $('scanFile').disabled]);
    check(`#${id} reads the receipt and re-enables the buttons`, f[0] === '24.61' && f[1] === 'Corner Market' && !f[2], f);
  }

  // Android bug: the scanned amount went blank on changing the category. A box that kept
  // focus while the scan filled it in left the keyboard's copy stale. Scanning must
  // release focus, and not focus Amount when the total was found.
  await page.evaluate(() => resetExpenseForm());
  await page.click('#amount');
  await page.keyboard.type('5');
  await page.setInputFiles('#scanCamera', photo);
  await scanDone(page);
  const focused = await page.evaluate(() => document.activeElement.id || document.activeElement.tagName);
  check('after a scan no text box has focus', !['amount', 'note', 'INPUT'].includes(focused), focused);
  await page.selectOption('#category', 'Food');
  check('amount survives changing the category', await page.inputValue('#amount') === '24.61', await page.inputValue('#amount'));
  await page.evaluate(() => fillFromScan({ amount: null, date: null, merchant: '' }, ''));
  check('no total found: Amount gets focus for typing', await page.evaluate(() => document.activeElement.id) === 'amount');

  check('no page errors', !page.errors.length, page.errors);
  await context.close();
};
