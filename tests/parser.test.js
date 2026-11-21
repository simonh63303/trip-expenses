// Reading receipt text: total, date and shop name.
const { openApp, TODAY } = require('./helpers');

const CASES = [
  ['US grocery', "TRADER JOE'S\n123 Main St\nTel 555-123-4567\nBANANAS 1.29\nMILK 3.49\nSUBTOTAL 4.78\nTAX 0.38\nTOTAL $5.16\nVISA 5.16\n11/14/2026 18:22",
    { amount: 5.16, date: '2026-11-14', merchant: "Trader Joe's" }],
  ['cafe, total on the next line', 'Blue Bottle Coffee\nWelcome!\nLatte 5.50\nCroissant 4.25\nSubtotal 9.75\nTip 2.00\nTotal\n11.75\nNov 18, 2026',
    { amount: 11.75, date: '2026-11-18', merchant: 'Blue Bottle Coffee' }],
  ['OCR noise "T0TAL", cash and change skipped', 'SHELL STATION\nREG UNLEADED 42.10\nT0TAL 42.10\nCASH 50.00\nCHANGE 7.90\n2026-11-02',
    { amount: 42.10, date: '2026-11-02', merchant: 'Shell Station' }],
  ['European commas; month-first would be in the future, so day-first', 'Boulangerie Paul\n12/11/2026\nBaguette 1,20\nTarte 3,80\nTOTAL EUR 5,00',
    { amount: 5.00, date: '2026-11-12', merchant: 'Boulangerie Paul' }],
  ['day-first when the first number is over 12', 'Hotel Bar\n19/11/2026\nAmount due 1.234,50',
    { amount: 1234.50, date: '2026-11-19', merchant: 'Hotel Bar' }],
  ['grand total beats total', 'Diner\nTotal 20.00\nGratuity 4.00\nGrand Total 24.00\n19 Nov 2026',
    { amount: 24.00, date: '2026-11-19', merchant: 'Diner' }],
  ['no labels: largest amount', 'Market stall\n3.00\n4.50\n12.25',
    { amount: 12.25, date: null, merchant: 'Market stall' }],
  ['future date ignored', 'Store\n12/25/2030\nTotal 9.99',
    { amount: 9.99, date: null, merchant: 'Store' }],
  ['garbage', '~~~ ## ..\n',
    { amount: null, date: null, merchant: '' }],
];

module.exports = async ({ browser, baseURL, check }) => {
  const { context, page } = await openApp(browser, baseURL);
  for (const [name, text, want] of CASES) {
    const got = await page.evaluate(([t, today]) => parseReceipt(t, today), [text, TODAY]);
    check(name, Object.keys(want).every(k => got[k] === want[k]), got);
  }
  check('no page errors', !page.errors.length, page.errors);
  await context.close();
};
