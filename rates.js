// Exchange rates: fetched when online, saved on the device for offline use.
// Rates are stored as "units of currency X per 1 home currency".

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
    refresh, get, currencies,
    get info() { return cache ? { base: cache.base, date: cache.date } : null; },
  };
})();
