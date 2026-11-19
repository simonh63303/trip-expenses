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
  check('no page errors', !page.errors.length, page.errors);
  await context.close();
};
