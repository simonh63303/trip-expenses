// Exchange rates: fetched when online, saved on the device for offline use.
// Rates are stored as "units of currency X per 1 home currency".
// Today's rates come from open.er-api.com. Rates for a past date come from the free
// fawazahmed0 currency API (daily files from 2024-03-02, 340 currencies, no key).

const Rates = (() => {
  const KEY = 'tripExpenses.rates';
  const API = 'https://open.er-api.com/v6/latest/';

  // Used before the first successful fetch so the currency pickers aren't empty.
  const COMMON = ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW', 'THB', 'VND', 'SGD', 'HKD',
    'TWD', 'IDR', 'MYR', 'PHP', 'INR', 'AUD', 'NZD', 'CAD', 'MXN', 'BRL', 'ARS', 'CHF',
    'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'AED', 'ZAR', 'EGP', 'MAD', 'ISK'];

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
  }

  let cache = load(); // { base, date, rates: { JPY: 150.2, ... } }

  // Past rates already fetched, so a date is only downloaded once:
  // { "USD|2026-11-12": { JPY: 159.86, EUR: 0.9028, ... } }
  const PAST_KEY = 'tripExpenses.pastRates';
  const HISTORY_START = '2024-03-02';
  let past = (() => { try { return JSON.parse(localStorage.getItem(PAST_KEY)) || {}; } catch { return {}; } })();

  // Requests still on their way, so asking twice for one day downloads it once.
  const inflight = new Map();

  // How many `cur` you got for 1 `base` on `date` (YYYY-MM-DD), or null if unknown.
  function forDate(date, cur, base) {
    const id = `${base}|${date}|${cur}`;
    if (!inflight.has(id)) inflight.set(id, fetchForDate(date, cur, base).finally(() => inflight.delete(id)));
    return inflight.get(id);
  }

  async function fetchForDate(date, cur, base) {
    if (cur === base) return 1;
    if (date < HISTORY_START) return null;
    const key = `${base}|${date}`;
    if (past[key]?.[cur]) return past[key][cur];
    if (!navigator.onLine) return null;
    const b = base.toLowerCase();
    const urls = [ // main address, then the project's backup
      `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/${b}.min.json`,
      `https://${date}.currency-api.pages.dev/v1/currencies/${b}.min.json`,
    ];
    for (const url of urls) {
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 8000);
        const res = await fetch(url, { signal: ctl.signal });
        clearTimeout(timer);
        if (!res.ok) continue;
        const table = (await res.json())[b];
        if (!table) continue;
        // Keep the common currencies plus this one, not all 340, to save space.
        const keep = {};
        for (const c of new Set([...COMMON, cur])) { const v = table[c.toLowerCase()]; if (v > 0) keep[c] = v; }
        past[key] = { ...past[key], ...keep };
        try { localStorage.setItem(PAST_KEY, JSON.stringify(past)); } catch {}
        return keep[cur] || null;
      } catch {}
    }
    return null;
  }

  async function refresh(base) {
    const res = await fetch(API + encodeURIComponent(base), { cache: 'no-store' });
    if (!res.ok) throw new Error('Rate request failed');
    const data = await res.json();
    if (data.result !== 'success') throw new Error('Rate service error');
    cache = { base: data.base_code, date: new Date().toISOString(), rates: data.rates };
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
    return cache;
  }

  // How many `cur` you get for 1 `base`. Returns null if unknown.
  function get(cur, base) {
    if (cur === base) return 1;
    if (!cache || !cache.rates) return null;
    const r = cache.rates;
    // Cached base may differ from the current home currency; convert through it.
    const toCur = cache.base === cur ? 1 : r[cur];
    const toBase = cache.base === base ? 1 : r[base];
    if (!toCur || !toBase) return null;
    return toCur / toBase;
  }

  function currencies() {
    const set = new Set(COMMON);
    if (cache && cache.rates) Object.keys(cache.rates).forEach(c => set.add(c));
    return [...set].sort();
  }

  return {
    refresh, get, forDate, currencies, HISTORY_START,
    get info() { return cache ? { base: cache.base, date: cache.date } : null; },
  };
})();
