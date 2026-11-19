// The backup reminder, the Settings status line, and saving through the Share sheet.
const { openApp, appData, expense } = require('./helpers');

const many = n => Array.from({ length: n }, (_, i) => expense({ id: 'e' + i, date: '2026-11-01', amount: 5, note: 'x' + i }));
const data = (n, extra) => appData({ expenses: many(n), ...extra });

// Pretends to be the home-screen app with a Share sheet that succeeds or is cancelled.
const fakeShareSheet = outcome => `(() => {
  const mm = window.matchMedia.bind(window);
  window.matchMedia = q => q.includes('standalone') ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm(q);
  navigator.canShare = () => true;
  navigator.share = async d => { window.__shared = d.files[0].name; if (${JSON.stringify(outcome)} === 'cancel') throw new DOMException('cancelled', 'AbortError'); };
})()`;

module.exports = async ({ browser, baseURL, check }) => {
  const nudge = page => page.isVisible('#backupNudge');
  const settingsLine = async page => {
    await page.click('.tabs button[data-view=settings]');
    const r = { text: await page.textContent('#backupInfo'), due: await page.evaluate(() => $('backupInfo').classList.contains('due')) };
    await page.click('.tabs button[data-view=add]');
    return r;
  };
  const open = async (d, init) => (await openApp(browser, baseURL, { data: d, init })).page;
  const pages = [];
  const track = p => (pages.push(p), p);

  let p = track(await open(data(3)));
  check('3 expenses, never backed up: no reminder', !(await nudge(p)));
  let s = await settingsLine(p);
  check('Settings says never, not in red', /Never backed up\. 3 expenses/.test(s.text) && !s.due, s);

  p = track(await open(data(12)));
  check('12 expenses, never backed up: reminder shown', await nudge(p));
  check('reminder text', /haven't backed up yet, and your 12 expenses/.test(await p.textContent('#backupNudgeText')), await p.textContent('#backupNudgeText'));
  s = await settingsLine(p);
  check('Settings in red', s.due, s);
  await p.click('#nudgeLater');
  check('Later hides it', !(await nudge(p)));
  await p.reload();
  check('still hidden after a reload', !(await nudge(p)), await p.evaluate(() => state.backupSnoozeUntil));
  await p.click('.tabs button[data-view=settings]');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#exportBtn')]);
  check('Export backup downloads a .json in a browser tab', dl.suggestedFilename().endsWith('.json'), dl.suggestedFilename());
  check('Settings: last backup today', /Last backup today/.test(await p.textContent('#backupInfo')), await p.textContent('#backupInfo'));
  check('backup date stored, snooze cleared', await p.evaluate(() => !state.backupSnoozeUntil && state.lastBackup === todayStr()));

  p = track(await open(data(12, { lastBackup: '2026-10-01' })));
  check('49-day-old backup: reminder shown', await nudge(p) && /49 days ago/.test(await p.textContent('#backupNudgeText')), await p.textContent('#backupNudgeText'));
  s = await settingsLine(p);
  check('Settings in red with the days', s.due && /49 days ago/.test(s.text), s);
  p = track(await open(data(12, { lastBackup: '2026-11-10' })));
  check('9-day-old backup: no reminder', !(await nudge(p)));

  p = track(await open(data(12), fakeShareSheet('ok')));
  await p.click('#nudgeBackup');
  await p.waitForFunction(() => state.lastBackup);
  check('home-screen app: Share sheet used and backup recorded', await p.evaluate(() => !!window.__shared && state.lastBackup === todayStr()));
  check('reminder gone after sharing', !(await nudge(p)));
  p = track(await open(data(12), fakeShareSheet('cancel')));
  await p.click('#nudgeBackup');
  await p.waitForTimeout(200);
  check('cancelled Share sheet: not recorded, reminder stays', await p.evaluate(() => !!window.__shared && !state.lastBackup) && await nudge(p));

  check('no page errors', pages.every(x => !x.errors.length), pages.flatMap(x => x.errors));
  for (const x of pages) await x.context().close();
};
