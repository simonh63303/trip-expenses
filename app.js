// Trip Expenses — all data is stored on this device in localStorage.

const STORE_KEY = 'tripExpenses.data';
const CASH = 'Cash withdrawal';
const UNCAT = 'Uncategorized'; // where scanned receipts wait until you sort them
const EVERYDAY = 'everyday';   // id of the built-in trip for daily, non-trip spending
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Lodging', 'Activities', 'Shopping', 'eSIM / Phone', CASH, 'Other', UNCAT];

// ---------- Storage ----------

function freshState() {
  return { version: 1, home: 'USD', trips: [], expenses: [], categories: [...DEFAULT_CATEGORIES], activeTripId: null };
}

// Brings saved data up to date: adds the Everyday trip and the Uncategorized category
// if they're missing, so data from older versions keeps working.
function migrate(s) {
  if (!s.categories.includes(UNCAT)) s.categories.push(UNCAT);
  if (!s.trips.some(t => t.id === EVERYDAY)) {
    s.trips.unshift({ id: EVERYDAY, name: 'Everyday', start: '', end: '', currency: s.home, builtin: true });
  }
  if (!s.trips.some(t => t.id === s.activeTripId)) {
    s.activeTripId = (s.trips.find(t => t.id !== EVERYDAY) || s.trips[0]).id;
  }
  return s;
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.trips) && Array.isArray(s.expenses)) return migrate({ ...freshState(), ...s });
  } catch {}
  return migrate(freshState());
}

let state = loadState();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch { toast('Could not save — storage full?'); }
}

// ---------- Helpers ----------

const $ = id => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const round2 = n => Math.round(n * 100) / 100;

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }

function fmtDate(s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
  return parseDate(s).toLocaleDateString(undefined, opts);
}

// Monday of the week containing date string s, as YYYY-MM-DD.
function weekStart(s) {
  const d = parseDate(s);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function money(n, cur = state.home) {
  try { return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur }).format(n); }
  catch { return `${n.toFixed(2)} ${cur}`; }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

function fillSelect(sel, values, selected) {
  sel.innerHTML = values.map(v => `<option value="${esc(v)}"${v === selected ? ' selected' : ''}>${esc(v)}</option>`).join('');
}

const activeTrip = () => state.trips.find(t => t.id === state.activeTripId) || null;
const tripById = id => state.trips.find(t => t.id === id) || null;

function tripOptions(selected) {
  return state.trips.map(t =>
    `<option value="${t.id}"${t.id === selected ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
}

// Extra the bank charged beyond the market-rate estimate (only once a statement amount is entered).
function markup(e) {
  return e.statementAmount != null ? e.statementAmount - e.homeAmount - (e.homeFee || 0) : 0;
}

// What an expense costs you. Withdrawn cash itself isn't counted (you log what you buy
// with it separately), but ATM fees and bank markup are.
function cost(e) {
  return (e.category === CASH ? 0 : e.homeAmount) + (e.homeFee || 0) + markup(e);
}

function totals(expenses) {
  let spend = 0, fees = 0, cash = 0, bank = 0, checked = 0;
  for (const e of expenses) {
    spend += cost(e);
    fees += e.homeFee || 0;
    if (e.category === CASH) cash += e.homeAmount;
    if (e.statementAmount != null) { bank += markup(e); checked++; }
  }
  return { spend, fees, cash, bank, checked };
}

// ---------- Navigation ----------

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  const tab = { reconcile: 'summary', sort: 'add' }[name] || name; // sub-screens light up their parent tab
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === tab));
  if (name === 'trips') renderTrips();
  if (name === 'reconcile') renderReconcile();
  if (name === 'sort') renderSort();
  if (name === 'summary') renderSummary();
  if (name === 'settings') renderSettings();
  if (name === 'report') renderReport();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));

// ---------- Top bar ----------

function renderTopbar() {
  const sel = $('tripSelect');
  if (!state.trips.length) {
    sel.innerHTML = '<option value="">No trips yet</option>';
    sel.disabled = true;
  } else {
    sel.disabled = false;
    sel.innerHTML = state.trips.map(t =>
      `<option value="${t.id}"${t.id === state.activeTripId ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  }
  const info = Rates.info;
  let txt = 'No rates yet';
  if (info) {
    const d = new Date(info.date);
    const sameDay = d.toDateString() === new Date().toDateString();
    txt = sameDay ? 'Rates: today' : 'Rates: ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  $('rateStatus').textContent = (navigator.onLine ? '' : 'Offline · ') + txt;
}

$('tripSelect').addEventListener('change', e => {
  state.activeTripId = e.target.value;
  save();
  resetExpenseForm();
  renderAll();
});

// ---------- Add / edit expense ----------

let rateTouched = false; // the person typed their own rate, so leave it alone
let rateNote = '';       // e.g. "rate for Nov 12", shown after the converted amount
let rateJob = 0;         // ignores answers to older rate requests
let pendingRate = null;  // a past-date rate still on its way; Save waits for it

// Fills the rate field: today's rate at once, then, for a past date, that day's rate.
function setRateField() {
  const cur = $('currency').value;
  const r = Rates.get(cur, state.home);
  $('rate').value = r ? +r.toPrecision(6) : (cur === state.home ? 1 : '');
  $('rateCur').textContent = cur;
  document.querySelectorAll('.homeCode').forEach(el => el.textContent = state.home);
  $('rateDetails').hidden = cur === state.home;
  rateNote = '';
  rateJob++; // any request still running is now out of date
  pendingRate = null;
  updateConverted();
  const date = $('date').value;
  if (cur !== state.home && date && date < todayStr()) loadRateForDate(cur, date);
}

async function loadRateForDate(cur, date) {
  const job = ++rateJob;
  const day = fmtDate(date, { month: 'short', day: 'numeric' });
  rateNote = `getting the rate for ${day}…`;
  updateConverted();
  const request = Rates.forDate(date, cur, state.home).catch(() => null);
  pendingRate = request;
  const r = await request;
  if (job !== rateJob) return; // the currency or date changed meanwhile
  pendingRate = null;
  if (rateTouched) { rateNote = ''; updateConverted(); return; }
  if (r) {
    $('rate').value = +r.toPrecision(6);
    rateNote = `rate for ${day}`;
  } else {
    rateNote = date < Rates.HISTORY_START
      ? "no rates before March 2024, so today's rate is used"
      : `couldn't get the rate for ${day}, so today's rate is used`;
  }
  updateConverted();
}

function updateConverted() {
  const amt = parseFloat($('amount').value);
  const cur = $('currency').value;
  const rate = parseFloat($('rate').value);
  const fee = parseFloat($('atmFee').value) || 0;
  if (cur === state.home) { $('converted').textContent = ''; return; }
  if (!amt) { $('converted').textContent = rateNote ? rateNote[0].toUpperCase() + rateNote.slice(1) : ''; return; }
  if (!rate) { $('converted').textContent = 'No rate yet — enter one under Exchange rate'; return; }
  let txt = '≈ ' + money(amt / rate);
  if ($('category').value === CASH && fee) txt += ` + ${money(fee / rate)} fee`;
  if (rateNote) txt += ` · ${rateNote}`;
  $('converted').textContent = txt;
}

// e.g. "Bank charged $0.15 more (+1.6%) than the market rate"
function diffText(stmt, est) {
  const d = stmt - est;
  if (Math.abs(d) < 0.005) return 'Matches the market rate';
  const pct = est ? ` (${d > 0 ? '+' : ''}${(d / est * 100).toFixed(1)}%)` : '';
  return `Bank charged ${money(Math.abs(d))} ${d > 0 ? 'more' : 'less'}${pct} than the market rate`;
}

function toggleFee() { $('feeWrap').hidden = $('category').value !== CASH; updateConverted(); }

function resetExpenseForm() {
  const trip = activeTrip();
  $('expenseForm').reset();
  rateTouched = false;
  scanned = false;
  scanStatus('');
  $('scanDetails').hidden = true;
  $('scanDetails').open = false;
  $('expTrip').innerHTML = tripOptions(trip?.id);
  $('editId').value = '';
  $('addTitle').textContent = 'Add expense';
  $('saveBtn').textContent = 'Save expense';
  $('cancelEdit').hidden = true;
  fillSelect($('currency'), Rates.currencies(), trip ? trip.currency : state.home);
  fillSelect($('category'), state.categories, state.categories[0]);
  $('date').value = todayStr();
  toggleFee();
  setRateField();
}

function renderAddView() {
  const hasTrip = !!activeTrip();
  $('noTripHint').hidden = hasTrip;
  $('expenseForm').hidden = !hasTrip;
  renderBackupNudge();
  const n = state.expenses.filter(e => e.category === UNCAT).length;
  $('sortBanner').hidden = !n;
  $('sortBanner').textContent = `${n} to sort ›`;
}

$('amount').addEventListener('input', updateConverted);
$('atmFee').addEventListener('input', updateConverted);
$('rate').addEventListener('input', () => {
  rateTouched = true;
  rateJob++; // a typed rate beats any rate still being fetched
  pendingRate = null;
  rateNote = '';
  updateConverted();
});
// A new currency makes any typed rate meaningless, so start fresh.
$('currency').addEventListener('change', () => { rateTouched = false; setRateField(); });
// A new expense follows its date's rate. An edit keeps its saved rate (it may be one you typed);
// "Use market rate for this date" applies the date's rate on purpose.
$('date').addEventListener('change', () => {
  if (!$('editId').value && !rateTouched) setRateField();
});
$('rateForDate').addEventListener('click', () => { rateTouched = false; setRateField(); });
$('category').addEventListener('change', toggleFee);
// A new expense takes the chosen trip's currency; an edit keeps its own.
$('expTrip').addEventListener('change', () => {
  if ($('editId').value) return;
  const t = tripById($('expTrip').value);
  if (t) { $('currency').value = t.currency; rateTouched = false; setRateField(); }
});
$('cancelEdit').addEventListener('click', () => { resetExpenseForm(); showView('trips'); });

$('expenseForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (pendingRate) { // wait for the date's rate rather than save today's by mistake
    $('saveBtn').disabled = true;
    await pendingRate;
    await null; // let the rate land in the field first
    $('saveBtn').disabled = false;
  }
  const trip = tripById($('expTrip').value) || activeTrip();
  if (!trip) return;
  const amount = parseFloat($('amount').value);
  const currency = $('currency').value;
  const rate = currency === state.home ? 1 : parseFloat($('rate').value);
  if (!(amount > 0)) { toast('Enter an amount'); return; }
  if (!(rate > 0)) { $('rateDetails').open = true; $('rate').focus(); toast('Enter an exchange rate'); return; }
  const category = $('category').value;
  const atmFee = category === CASH ? (parseFloat($('atmFee').value) || 0) : 0;
  const editId = $('editId').value;
  const old = editId ? state.expenses.find(x => x.id === editId) : null;
  // Statement amounts are entered on the Reconcile screen; keep any existing one when editing.
  const statementAmount = old && currency !== state.home ? (old.statementAmount ?? null) : null;
  const expense = {
    id: editId || uid(),
    tripId: trip.id,
    date: $('date').value,
    amount, currency, category,
    note: $('note').value.trim(),
    atmFee, rate,
    homeAmount: round2(amount / rate),
    homeFee: round2(atmFee / rate),
    statementAmount, // what the bank actually charged, in home currency (null until entered)
  };

  if (editId) state.expenses = state.expenses.map(x => x.id === editId ? expense : x);
  else state.expenses.push(expense);
  save();

  const keepCur = currency, keepCat = category, keepDate = expense.date, wasScan = scanned;
  resetExpenseForm();
  if (!editId && !wasScan) { // keep choices for quick repeat entries
    $('currency').value = keepCur; $('category').value = keepCat; $('date').value = keepDate;
    toggleFee(); setRateField();
  }
  toast(editId ? 'Expense updated' : 'Saved · ' + money(expense.homeAmount + expense.homeFee));
  renderAddView();
  if (editId) showView('trips');
  else $('amount').focus();
});

function editExpense(id) {
  const x = state.expenses.find(e => e.id === id);
  if (!x) return;
  showView('add');
  scanned = false;
  scanStatus('');
  $('scanDetails').hidden = true;
  $('editId').value = x.id;
  $('addTitle').textContent = 'Edit expense';
  $('saveBtn').textContent = 'Update expense';
  $('cancelEdit').hidden = false;
  if (!state.categories.includes(x.category)) state.categories.push(x.category);
  fillSelect($('category'), state.categories, x.category);
  fillSelect($('currency'), Rates.currencies(), x.currency);
  $('expTrip').innerHTML = tripOptions(x.tripId);
  $('amount').value = x.amount;
  $('atmFee').value = x.atmFee || '';
  $('date').value = x.date;
  $('note').value = x.note;
  toggleFee();
  rateJob++;
  pendingRate = null;
  rateNote = '';
  rateTouched = false;
  $('rate').value = x.rate;
  $('rateCur').textContent = x.currency;
  $('rateDetails').hidden = x.currency === state.home;
  updateConverted();
}

function deleteExpense(id) {
  if (!confirm('Delete this expense?')) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  save();
  renderTrips();
  toast('Expense deleted');
}

// ---------- Receipt scanning ----------
// Reading happens on the phone with Tesseract (files in ocr/). They load on the first
// scan; the service worker then keeps them so later scans work offline.

let scanned = false;          // the form holds values from a scan, not yet saved
let ocrReady = null;          // promise of the Tesseract worker, created once
let onOcrProgress = () => {};

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(el);
  });
}

function getOcr() {
  ocrReady ||= (async () => {
    if (!window.Tesseract) await loadScript('ocr/tesseract.min.js');
    const base = new URL('ocr/', location.href).href;
    return Tesseract.createWorker('eng', 1, {
      workerPath: base + 'worker.min.js',
      corePath: base + 'core/',
      langPath: base + 'lang',
      workerBlobURL: false, // start the worker from our own file so the service worker can cache what it loads
      logger: m => onOcrProgress(m),
    });
  })().catch(err => { ocrReady = null; throw err; });
  return ocrReady;
}

// Shrinks the photo and boosts contrast in greyscale, which helps OCR on phone photos.
async function prepImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data, hist = new Uint32Array(256);
    for (let i = 0; i < px.length; i += 4) {
      const y = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000 | 0;
      px[i] = y; hist[y]++;
    }
    // Stretch so the darkest 2% become black and the lightest 2% white.
    const total = px.length / 4;
    let lo = 0, hi = 255, acc = 0;
    while (lo < 255 && (acc += hist[lo]) < total * 0.02) lo++;
    acc = 0;
    while (hi > 0 && (acc += hist[hi]) < total * 0.02) hi--;
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < px.length; i += 4) {
      const v = Math.max(0, Math.min(255, (px[i] - lo) * 255 / range));
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ----- Reading the receipt text -----

// Money amounts on a line, e.g. "$1,234.56", "12,50", "1.234,56". Needs two decimals.
function moneyIn(line) {
  const out = [], re = /(\d{1,3}(?:[.,\s]\d{3})+|\d+)\s?[.,]\s?(\d{2})(?!\d)/g;
  let m;
  while ((m = re.exec(line))) out.push(parseFloat(m[1].replace(/[.,\s]/g, '') + '.' + m[2]));
  return out.filter(n => n > 0);
}

function findTotal(lines) {
  const skip = /sub\s*-?\s*t[o0]tal|tax|tip|change|sav(ed|ings?)|discount|\bitems?\b|qty|\bcash\b|tender|points|rounding/i;
  const tiers = [
    /grand\s*t[o0]tal|amount\s*due|balance\s*due|t[o0]tal\s*due|to\s*pay|t[o0]tal\s*amount/i,
    /t[o0]ta[l1]/i,
    /amount|\bamt\b|balance|\bsum\b/i,
  ];
  for (const tier of tiers) {
    const found = [];
    lines.forEach((line, i) => {
      if (!tier.test(line) || skip.test(line)) return;
      const here = moneyIn(line);
      found.push(...(here.length ? here : moneyIn(lines[i + 1] || ''))); // label and amount can sit on separate lines
    });
    if (found.length) return Math.max(...found);
  }
  const all = lines.filter(l => !skip.test(l)).flatMap(moneyIn);
  return all.length ? Math.max(...all) : null;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function findDate(text, today = todayStr()) {
  const ok = (y, m, d) => {
    if (y < 100) y += 2000;
    const dt = new Date(y, m - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
    const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const t = parseDate(today);
    const oldest = new Date(t.getFullYear() - 2, t.getMonth(), t.getDate());
    return dt <= new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1) && dt >= oldest ? s : null;
  };
  const mon = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
  const rules = [
    [/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g, m => ok(+m[1], +m[2], +m[3])],
    // 1/2/2026 is read month-first (US); if that can't be right (13/2, or a future date), day-first.
    [/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/g, m => ok(+m[3], +m[1], +m[2]) || ok(+m[3], +m[2], +m[1])],
    [new RegExp(`\\b${mon}\\s+(\\d{1,2}),?\\s+(\\d{4}|\\d{2})\\b`, 'gi'), m => ok(+m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, +m[2])],
    [new RegExp(`\\b(\\d{1,2})\\s+${mon},?\\s+(\\d{4}|\\d{2})\\b`, 'gi'), m => ok(+m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, +m[1])],
  ];
  for (const [re, fn] of rules) {
    for (const m of text.matchAll(re)) { const d = fn(m); if (d) return d; }
  }
  return null;
}

function findMerchant(lines) {
  const noise = /receipt|welcome|thank|\btel\b|phone|www\.|http|\.com|date|time|invoice|order|cashier|server|table|guest|^\W*\d/i;
  for (const line of lines.slice(0, 6)) {
    const letters = (line.match(/[a-z]/gi) || []).length;
    if (letters < 3 || letters / line.length < 0.5 || noise.test(line)) continue;
    let name = line.replace(/[^\p{L}\p{N}&'. -]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!/[a-z]/.test(name)) name = name.toLowerCase().replace(/(^|[\s-])\p{L}/gu, c => c.toUpperCase()); // TRADER JOE'S -> Trader Joe's
    if (name.length >= 3) return name;
  }
  return '';
}

function parseReceipt(text, today) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return { amount: findTotal(lines), date: findDate(text, today), merchant: findMerchant(lines) };
}

// ----- Scan flow -----

function scanStatus(msg, isError = false) {
  const el = $('scanStatus');
  el.hidden = !msg;
  el.textContent = msg || '';
  el.classList.toggle('error', isError);
}

// On Android the keyboard keeps its own copy of the box being typed in. Changing a box's
// value while it has focus leaves that copy stale, and when the box loses focus the
// keyboard writes the stale copy back, blanking the scanned amount. So let go of focus
// before filling in anything.
function releaseFocus() {
  const el = document.activeElement;
  if (el && el !== document.body && el.blur) el.blur();
}

function fillFromScan(r, text) {
  releaseFocus();
  resetExpenseForm();
  const everyday = tripById(EVERYDAY);
  $('expTrip').value = EVERYDAY;
  fillSelect($('currency'), Rates.currencies(), everyday.currency);
  fillSelect($('category'), state.categories, UNCAT);
  $('amount').value = r.amount ?? '';
  $('date').value = r.date || todayStr();
  $('note').value = r.merchant;
  $('scanText').textContent = text.trim() || '(no text found)';
  $('scanDetails').hidden = false;
  toggleFee();
  setRateField();
  scanned = true;
  scanStatus(r.amount
    ? `Found ${money(r.amount, everyday.currency)}${r.date ? '' : ' (no date found, so today is used)'}. Check the details, then Save.`
    : "Couldn't find the total. Type it in, then Save.");
  if (r.amount == null) $('amount').focus(); // only when it needs typing; focusing after the value is set is safe
}

// Two ways in: the camera, or a photo already taken. Both run the same scan.
async function scanPicked(e) {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  releaseFocus();
  if (!$('view-add').classList.contains('active')) showView('add');
  $('scanCamera').disabled = $('scanFile').disabled = true;
  scanStatus('Getting the receipt reader ready…');
  onOcrProgress = m => {
    if (m.status === 'recognizing text') scanStatus(`Reading receipt… ${Math.round(m.progress * 100)}%`);
    else if (/^loading/.test(m.status || '')) scanStatus('Getting the receipt reader ready (slow the first time)…');
  };
  try {
    let worker;
    try { worker = await getOcr(); }
    catch { scanStatus('Could not load the receipt reader. Connect to the internet once so it can download, then try again.', true); return; }
    const canvas = await prepImage(file);
    scanStatus('Reading receipt…');
    const { data } = await worker.recognize(canvas);
    fillFromScan(parseReceipt(data.text), data.text);
  } catch {
    scanStatus('Could not read that photo. Try again in good light, or type the expense in.', true);
  } finally {
    $('scanCamera').disabled = $('scanFile').disabled = false;
    onOcrProgress = () => {};
  }
}
$('scanCamera').addEventListener('change', scanPicked);
$('scanFile').addEventListener('change', scanPicked);

// ---------- To sort ----------

function renderSort() {
  const items = state.expenses.filter(e => e.category === UNCAT).sort((a, b) => b.date.localeCompare(a.date));
  const cats = state.categories.filter(c => c !== UNCAT && c !== CASH);
  $('sortList').innerHTML = items.length ? items.map(e => `
    <div class="list-item sort-row">
      <div class="sort-top">
        <div class="main">
          <div class="title">${esc(e.note || 'Receipt')}</div>
          <div class="sub">${fmtDate(e.date)} · ${money(e.amount, e.currency)}</div>
        </div>
        <button type="button" class="icon-btn" data-sort-edit="${e.id}">Edit</button>
      </div>
      <div class="cat-chips" role="group" aria-label="Category for ${esc(e.note || 'receipt')}">
        ${cats.map(c => `<button type="button" data-file="${e.id}" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}
      </div>
      <label class="sort-trip">Trip <select data-move="${e.id}">${tripOptions(e.tripId)}</select></label>
    </div>`).join('')
    : '<p class="empty">All sorted. Scanned receipts wait here until you pick a category.</p>';
}

$('sortBanner').addEventListener('click', () => showView('sort'));
$('sortBack').addEventListener('click', () => { renderAddView(); showView('add'); });

$('sortList').addEventListener('click', ev => {
  const b = ev.target.closest('[data-file],[data-sort-edit]');
  if (!b) return;
  if (b.dataset.sortEdit) { editExpense(b.dataset.sortEdit); return; }
  const x = state.expenses.find(e => e.id === b.dataset.file);
  if (!x) return;
  x.category = b.dataset.cat;
  save();
  renderSort();
  renderAddView();
  toast(`Filed under ${x.category}`);
});

$('sortList').addEventListener('change', ev => {
  const id = ev.target.dataset.move;
  const x = id && state.expenses.find(e => e.id === id);
  if (!x) return;
  x.tripId = ev.target.value;
  save();
  toast(`Moved to ${tripById(x.tripId)?.name || 'trip'}`);
});

// ---------- Trips ----------

function resetTripForm() {
  $('tripForm').reset();
  $('tripEditId').value = '';
  $('tripSaveBtn').textContent = 'Add trip';
  $('tripCancel').hidden = true;
  fillSelect($('tripCurrency'), Rates.currencies(), state.home);
}

$('tripCancel').addEventListener('click', resetTripForm);

$('tripForm').addEventListener('submit', e => {
  e.preventDefault();
  const id = $('tripEditId').value;
  const data = {
    name: $('tripName').value.trim(),
    start: $('tripStart').value,
    end: $('tripEnd').value,
    currency: $('tripCurrency').value,
  };
  if (!data.name) return;
  if (id) {
    state.trips = state.trips.map(t => t.id === id ? { ...t, ...data } : t);
  } else {
    const trip = { id: uid(), ...data };
    state.trips.push(trip);
    state.activeTripId = trip.id;
  }
  save();
  resetTripForm();
  resetExpenseForm();
  renderAll();
  toast(id ? 'Trip updated' : 'Trip added — you can start logging');
});

function editTrip(id) {
  const t = state.trips.find(x => x.id === id);
  $('tripEditId').value = t.id;
  $('tripName').value = t.name;
  $('tripStart').value = t.start || '';
  $('tripEnd').value = t.end || '';
  fillSelect($('tripCurrency'), Rates.currencies(), t.currency);
  $('tripSaveBtn').textContent = 'Update trip';
  $('tripCancel').hidden = false;
  $('tripName').focus();
}

function deleteTrip(id) {
  const t = state.trips.find(x => x.id === id);
  if (!t || t.builtin) return;
  const n = state.expenses.filter(e => e.tripId === id).length;
  if (!confirm(`Delete "${t.name}" and its ${n} expense(s)? This can't be undone.`)) return;
  state.trips = state.trips.filter(x => x.id !== id);
  state.expenses = state.expenses.filter(e => e.tripId !== id);
  if (state.activeTripId === id) state.activeTripId = state.trips[0]?.id || null;
  save();
  resetExpenseForm();
  renderAll();
}

function renderTrips() {
  const list = $('tripList');
  list.innerHTML = state.trips.length ? state.trips.map(t => {
    const { spend } = totals(state.expenses.filter(e => e.tripId === t.id));
    const dates = [t.start && fmtDate(t.start, { month: 'short', day: 'numeric' }), t.end && fmtDate(t.end, { month: 'short', day: 'numeric' })].filter(Boolean).join(' – ');
    return `<div class="list-item ${t.id === state.activeTripId ? 'active-trip' : ''}">
      <div class="main" data-select="${t.id}" style="cursor:pointer">
        <div class="title">${esc(t.name)}${t.id === state.activeTripId ? ' ✓' : ''}</div>
        <div class="sub">${t.builtin ? 'Daily spending · ' : ''}${esc(t.currency)}${dates ? ' · ' + dates : ''}</div>
      </div>
      <div class="amt">${money(spend)}</div>
      <button class="icon-btn" data-edit-trip="${t.id}">Edit</button>
      ${t.builtin ? '' : `<button class="icon-btn danger" data-del-trip="${t.id}" aria-label="Delete trip">✕</button>`}
    </div>`;
  }).join('') : '<p class="empty">No trips yet. Add your first one above.</p>';

  const trip = activeTrip();
  $('expensesHeading').textContent = trip ? `Expenses — ${trip.name}` : 'Expenses';
  const exps = trip ? state.expenses.filter(e => e.tripId === trip.id) : [];
  exps.sort((a, b) => b.date.localeCompare(a.date));
  if (!exps.length) { $('expenseList').innerHTML = '<p class="empty">No expenses logged for this trip yet.</p>'; return; }

  const byDay = {};
  exps.forEach(e => (byDay[e.date] ||= []).push(e));
  $('expenseList').innerHTML = Object.keys(byDay).map(day => {
    const items = byDay[day];
    return `<div class="day-head"><span>${fmtDate(day)}</span><span>${money(totals(items).spend)}</span></div>` +
      items.map(e => {
        const foreign = e.currency !== state.home;
        let feeTxt = e.atmFee ? ` · fee ${money(e.atmFee, e.currency)}` : '';
        if (e.statementAmount != null) {
          const m = markup(e);
          feeTxt += ` · bank ${money(e.statementAmount)}` + (Math.abs(m) >= 0.005 ? ` (${m > 0 ? '+' : '−'}${money(Math.abs(m))})` : ' ✓');
        } else if (foreign) feeTxt += ' · not checked';
        return `<div class="list-item">
          <div class="main" data-edit="${e.id}" style="cursor:pointer">
            <div class="title">${esc(e.note || e.category)}</div>
            <div class="sub">${esc(e.category)}${feeTxt}</div>
          </div>
          <div class="amt">${money(e.amount, e.currency)}${foreign ? `<small>${money(e.homeAmount)}</small>` : ''}</div>
          <button class="icon-btn danger" data-del="${e.id}" aria-label="Delete expense">✕</button>
        </div>`;
      }).join('');
  }).join('');
}

document.getElementById('view-trips').addEventListener('click', e => {
  const t = e.target.closest('[data-select],[data-edit-trip],[data-del-trip],[data-edit],[data-del]');
  if (!t) return;
  const d = t.dataset;
  if (d.select) { state.activeTripId = d.select; save(); resetExpenseForm(); renderAll(); }
  else if (d.editTrip) editTrip(d.editTrip);
  else if (d.delTrip) deleteTrip(d.delTrip);
  else if (d.edit) editExpense(d.edit);
  else if (d.del) deleteExpense(d.del);
});

// ---------- Summary ----------

let summaryScope = 'trip';
document.querySelectorAll('.seg button').forEach(b => b.addEventListener('click', () => {
  summaryScope = b.dataset.scope;
  document.querySelectorAll('.seg button').forEach(x => x.classList.toggle('on', x === b));
  renderSummary();
}));

function bars(rows) {
  const max = Math.max(...rows.map(r => r.value), 0.01);
  return `<ul class="bars">${rows.map(r => `<li>
    <div class="bar-label"><span>${esc(r.label)}</span><span>${money(r.value)}</span></div>
    <div class="track"><div class="fill" style="width:${(r.value / max * 100).toFixed(1)}%"></div></div>
  </li>`).join('')}</ul>`;
}

const estimate = e => e.homeAmount + (e.homeFee || 0); // market-rate value incl. ATM fee

function markupPct(exps) {
  const checked = exps.filter(e => e.statementAmount != null);
  const est = checked.reduce((s, e) => s + estimate(e), 0);
  const bank = checked.reduce((s, e) => s + markup(e), 0);
  return est ? ` (${bank >= 0 ? '+' : ''}${(bank / est * 100).toFixed(2)}%)` : '';
}

// Bank-vs-market summary, with a link to the Reconcile screen for the active trip.
function bankSection(exps, t) {
  const foreign = exps.filter(e => e.currency !== state.home);
  if (!foreign.length) return '';
  const btn = summaryScope === 'trip'
    ? `<button type="button" class="primary" id="openReconcile" style="width:100%">${t.checked ? 'Continue reconciling' : 'Reconcile with statement'}</button>` : '';
  if (!t.checked) return `<p class="hint">Trip over? Compare each foreign charge with your card statement to see what your bank added on top of the market rate.</p>${btn}`;
  return `<div class="stats" style="margin-top:8px">
    <div class="stat"><div class="label">Bank markup${markupPct(foreign)}</div><div class="value">${money(t.bank)}</div></div>
    <div class="stat"><div class="label">Reconciled</div><div class="value">${t.checked} of ${foreign.length}</div></div>
  </div>${btn}`;
}

$('summary').addEventListener('click', e => { if (e.target.id === 'openReconcile') showView('reconcile'); });
$('reconcileBack').addEventListener('click', () => showView('summary'));

// ---------- Reconcile ----------

function reconcileExpenses() {
  const trip = activeTrip();
  return trip ? state.expenses
    .filter(e => e.tripId === trip.id && e.currency !== state.home)
    .sort((a, b) => a.date.localeCompare(b.date)) : [];
}

function renderReconcileTotals() {
  const exps = reconcileExpenses();
  const t = totals(exps);
  const checked = exps.filter(e => e.statementAmount != null);
  $('reconcileTotals').innerHTML = `<div class="stats">
    <div class="stat"><div class="label">Reconciled</div><div class="value">${t.checked} of ${exps.length}</div></div>
    <div class="stat"><div class="label">Bank markup${markupPct(exps)}</div><div class="value">${money(t.bank)}</div></div>
  </div>
  ${checked.length ? `<p class="hint">Statement total ${money(checked.reduce((s, e) => s + e.statementAmount, 0))} vs market rate ${money(checked.reduce((s, e) => s + estimate(e), 0))} for the reconciled charges.</p>` : ''}`;
}

function renderReconcile() {
  const trip = activeTrip();
  $('reconcileTitle').textContent = trip ? `Reconcile — ${trip.name}` : 'Reconcile';
  document.querySelectorAll('.homeCode').forEach(el => el.textContent = state.home);
  const exps = reconcileExpenses();
  renderReconcileTotals();
  $('reconcileList').innerHTML = exps.length ? exps.map(e => `
    <div class="list-item rec-row${e.statementAmount != null ? ' done' : ''}">
      <div class="main">
        <div class="title">${esc(e.note || e.category)}</div>
        <div class="sub">${fmtDate(e.date)} · ${money(e.amount, e.currency)}${e.atmFee ? ` + ${money(e.atmFee, e.currency)} fee` : ''} · market ≈ ${money(estimate(e))}</div>
        <div class="sub rec-diff" data-diff="${e.id}">${e.statementAmount != null ? diffText(e.statementAmount, estimate(e)) : ''}</div>
      </div>
      <label class="rec-input"><span class="sr-only">Statement amount for ${esc(e.note || e.category)}</span>
        <input type="number" inputmode="decimal" step="any" min="0" placeholder="${state.home}" data-stmt="${e.id}" value="${e.statementAmount ?? ''}">
      </label>
    </div>`).join('')
    : '<p class="empty">No foreign-currency charges on this trip.</p>';
}

// Save each statement amount as it's typed; update just that row and the totals.
$('reconcileList').addEventListener('input', ev => {
  const id = ev.target.dataset.stmt;
  if (!id) return;
  const x = state.expenses.find(e => e.id === id);
  const v = parseFloat(ev.target.value);
  x.statementAmount = v > 0 ? round2(v) : null;
  save();
  $('reconcileList').querySelector(`[data-diff="${id}"]`).textContent = x.statementAmount != null ? diffText(x.statementAmount, estimate(x)) : '';
  ev.target.closest('.rec-row').classList.toggle('done', x.statementAmount != null);
  renderReconcileTotals();
});

// Spend per category. Withdrawn cash is left out; ATM fees and bank markup get their own lines.
function categoryRows(exps, t = totals(exps)) {
  const cat = {};
  exps.forEach(e => { if (e.category !== CASH) cat[e.category] = (cat[e.category] || 0) + e.homeAmount; });
  if (t.fees) cat['ATM fees'] = t.fees;
  if (Math.abs(t.bank) > 0.005) cat['Bank markup'] = t.bank;
  return Object.entries(cat).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function renderSummary() {
  const trip = activeTrip();
  const exps = summaryScope === 'trip'
    ? (trip ? state.expenses.filter(e => e.tripId === trip.id) : [])
    : state.expenses;
  const el = $('summary');
  if (!exps.length) { el.innerHTML = '<p class="empty">Nothing to summarize yet.</p>'; return; }

  const t = totals(exps);
  const days = new Set(exps.map(e => e.date)).size;

  const catRows = categoryRows(exps, t);

  // Per week (Monday start)
  const wk = {};
  exps.forEach(e => {
    const w = weekStart(e.date);
    wk[w] = (wk[w] || 0) + cost(e);
  });
  const weekRows = Object.keys(wk).sort().map(w => ({ label: 'Week of ' + fmtDate(w, { month: 'short', day: 'numeric' }), value: wk[w] }));

  let html = `<div class="stats">
    <div class="stat"><div class="label">Total spent</div><div class="value">${money(t.spend)}</div></div>
    <div class="stat"><div class="label">Per day (${days} day${days > 1 ? 's' : ''})</div><div class="value">${money(t.spend / days)}</div></div>
    <div class="stat"><div class="label">ATM fees</div><div class="value">${money(t.fees)}</div></div>
    <div class="stat"><div class="label">Cash withdrawn</div><div class="value">${money(t.cash)}</div></div>
  </div>
  ${bankSection(exps, t)}
  <p class="hint">Cash withdrawn isn't added to the total — log what you buy with the cash instead. ATM fees and bank markup are included.</p>
  <h2>By week</h2>${bars(weekRows)}
  <h2>By category</h2>${bars(catRows)}`;

  if (summaryScope === 'all') {
    const tripRows = state.trips.map(tr => ({ label: tr.name, value: totals(state.expenses.filter(e => e.tripId === tr.id)).spend }))
      .sort((a, b) => b.value - a.value);
    html += `<h2>By trip</h2>${bars(tripRows)}`;
  }
  el.innerHTML = html;
}

// ---------- Report ----------

const ALL = '__all';
const report = { mode: 'trip', tripId: null, rangeTripId: ALL, from: '', to: '', cats: null }; // cats: null means all

const tripName = id => state.trips.find(t => t.id === id)?.name || '';

function fillTripOptions(sel, selected) {
  sel.innerHTML = `<option value="${ALL}">All trips</option>` + state.trips.map(t =>
    `<option value="${t.id}"${t.id === selected ? ' selected' : ''}>${esc(t.name)}</option>`).join('');
  if (selected === ALL || !state.trips.some(t => t.id === selected)) sel.value = ALL;
}

// The expenses the current report covers, oldest first, plus a title and a period label.
function reportData() {
  let exps = state.expenses, title, period;
  if (report.mode === 'trip') {
    const trip = state.trips.find(t => t.id === report.tripId);
    if (trip) {
      exps = exps.filter(e => e.tripId === trip.id);
      title = trip.name;
      period = [trip.start, trip.end].filter(Boolean).join(' to ');
    } else title = 'All trips';
  } else {
    let { from, to } = report;
    if (from && to && from > to) [from, to] = [to, from];
    if (from) exps = exps.filter(e => e.date >= from);
    if (to) exps = exps.filter(e => e.date <= to);
    if (report.rangeTripId !== ALL) exps = exps.filter(e => e.tripId === report.rangeTripId);
    title = report.rangeTripId === ALL ? 'All trips' : tripName(report.rangeTripId);
    period = from || to ? `${from || 'start'} to ${to || 'today'}` : 'All dates';
  }
  exps = [...exps].sort((a, b) => a.date.localeCompare(b.date));
  if (!period && exps.length) period = `${exps[0].date} to ${exps[exps.length - 1].date}`;
  // Categories found before filtering, in Settings order, so the buttons don't vanish as you pick.
  const found = new Set(exps.map(e => e.category));
  const order = [...state.categories, ...found];
  const cats = [...new Set(order)].filter(c => found.has(c) || report.cats?.includes(c));
  if (report.cats) exps = exps.filter(e => report.cats.includes(e.category));
  const catLabel = report.cats ? report.cats.join(', ') : 'All categories';
  return { exps, title, period: period || '', cats, catLabel };
}

// Totals grouped by trip and by original currency.
function groupRows(exps) {
  const byTrip = {}, byCur = {};
  for (const e of exps) {
    byTrip[e.tripId] = (byTrip[e.tripId] || 0) + cost(e);
    const c = (byCur[e.currency] ||= { local: 0, home: 0, n: 0 });
    c.local += e.amount + (e.atmFee || 0);
    c.home += e.homeAmount + (e.homeFee || 0);
    c.n++;
  }
  return {
    trips: Object.entries(byTrip).map(([id, value]) => ({ label: tripName(id) || '(deleted trip)', value })).sort((a, b) => b.value - a.value),
    currencies: Object.entries(byCur).map(([cur, v]) => ({ cur, ...v })).sort((a, b) => b.home - a.home),
  };
}

function table(head, rows, foot) {
  const cell = (c, i) => `<td${i ? ' class="num"' : ''}>${c}</td>`;
  return `<table class="report-table"><thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('')}</tbody>
    ${foot ? `<tfoot><tr>${foot.map(cell).join('')}</tr></tfoot>` : ''}</table>`;
}

function renderReport() {
  if (!report.tripId) report.tripId = state.activeTripId || ALL;
  fillTripOptions($('reportTrip'), report.tripId);
  fillTripOptions($('reportRangeTrip'), report.rangeTripId);
  $('reportFrom').value = report.from;
  $('reportTo').value = report.to;
  $('reportTripWrap').hidden = report.mode !== 'trip';
  $('reportRangeWrap').hidden = report.mode !== 'range';
  document.querySelectorAll('#reportMode button').forEach(b => b.classList.toggle('on', b.dataset.mode === report.mode));

  const { exps, title, period, cats, catLabel } = reportData();
  $('reportCats').innerHTML = [`<button type="button" data-rcat="" aria-pressed="${!report.cats}"${report.cats ? '' : ' class="on"'}>All</button>`,
    ...cats.map(c => { const on = !!report.cats?.includes(c); return `<button type="button" data-rcat="${esc(c)}" aria-pressed="${on}"${on ? ' class="on"' : ''}>${esc(c)}</button>`; })].join('');
  const el = $('report');
  $('exportDetailsCsv').disabled = $('exportSummaryCsv').disabled = !exps.length;
  if (!exps.length) { el.innerHTML = '<p class="empty">No expenses match this report.</p>'; return; }

  const t = totals(exps);
  const days = new Set(exps.map(e => e.date)).size;
  const multiTrip = new Set(exps.map(e => e.tripId)).size > 1;
  const g = groupRows(exps);

  let html = `<p class="report-meta"><b>${esc(title)}</b>${period ? ' · ' + esc(period) : ''}${report.cats ? ' · ' + esc(catLabel) : ''} · ${exps.length} expense${exps.length > 1 ? 's' : ''}</p>
  <div class="stats">
    <div class="stat"><div class="label">Total spent</div><div class="value">${money(t.spend)}</div></div>
    <div class="stat"><div class="label">Per day (${days} day${days > 1 ? 's' : ''})</div><div class="value">${money(t.spend / days)}</div></div>
    <div class="stat"><div class="label">ATM fees</div><div class="value">${money(t.fees)}</div></div>
    <div class="stat"><div class="label">Cash withdrawn</div><div class="value">${money(t.cash)}</div></div>
    ${t.checked ? `<div class="stat"><div class="label">Bank markup</div><div class="value">${money(t.bank)}</div></div>` : ''}
  </div>
  <h2>By category</h2>
  ${table(['Category', state.home], categoryRows(exps, t).map(r => [esc(r.label), money(r.value)]), ['Total', money(t.spend)])}`;
  if (multiTrip) html += `<h2>By trip</h2>${table(['Trip', state.home], g.trips.map(r => [esc(r.label), money(r.value)]))}`;
  if (g.currencies.length > 1 || g.currencies[0]?.cur !== state.home) {
    html += `<h2>By currency</h2><p class="hint">Includes cash withdrawals and ATM fees, at market rate.</p>
    ${table(['Currency', 'Paid', state.home], g.currencies.map(c => [esc(c.cur), money(c.local, c.cur), money(c.home)]))}`;
  }

  html += '<h2>Details</h2>';
  const byDay = {};
  exps.forEach(e => (byDay[e.date] ||= []).push(e));
  html += Object.keys(byDay).map(day => {
    const items = byDay[day];
    return `<div class="day-head"><span>${fmtDate(day)}</span><span>${money(totals(items).spend)}</span></div>` +
      items.map(e => {
        const foreign = e.currency !== state.home;
        const bits = [multiTrip && tripName(e.tripId), e.category, e.atmFee && `fee ${money(e.atmFee, e.currency)}`,
          e.statementAmount != null && `bank ${money(e.statementAmount)}`].filter(Boolean).map(esc);
        return `<div class="list-item"><div class="main">
            <div class="title">${esc(e.note || e.category)}</div>
            <div class="sub">${bits.join(' · ')}</div>
          </div>
          <div class="amt">${money(e.amount, e.currency)}${foreign ? `<small>${money(e.homeAmount)}</small>` : ''}</div>
        </div>`;
      }).join('');
  }).join('');
  el.innerHTML = html;
}

document.querySelectorAll('#reportMode button').forEach(b => b.addEventListener('click', () => {
  report.mode = b.dataset.mode;
  if (report.mode === 'range' && !report.from && !report.to) { // default to this month
    const today = todayStr();
    report.from = today.slice(0, 8) + '01';
    report.to = today;
  }
  renderReport();
}));
// Tap a category to add or remove it; "All" clears the filter.
$('reportCats').addEventListener('click', e => {
  const b = e.target.closest('[data-rcat]');
  if (!b) return;
  const c = b.dataset.rcat;
  if (!c) report.cats = null;
  else {
    const set = new Set(report.cats || []);
    set.has(c) ? set.delete(c) : set.add(c);
    report.cats = set.size ? [...set] : null;
  }
  renderReport();
});
$('reportTrip').addEventListener('change', e => { report.tripId = e.target.value; renderReport(); });
$('reportRangeTrip').addEventListener('change', e => { report.rangeTripId = e.target.value; renderReport(); });
$('reportFrom').addEventListener('change', e => { report.from = e.target.value; renderReport(); });
$('reportTo').addEventListener('change', e => { report.to = e.target.value; renderReport(); });

// ---------- CSV export ----------

function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t]/.test(s) && isNaN(s)) s = "'" + s; // stop spreadsheets running it as a formula
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const csv = rows => '\uFEFF' + rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'; // BOM so Excel reads UTF-8
const n2 = n => n == null ? '' : round2(n).toFixed(2);
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report';

// Saves a file. In the home-screen app, phones often ignore downloads, so it opens the
// Share sheet (Save to Files, AirDrop, Mail) instead. Resolves false if the person cancels.
async function download(text, name, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone && navigator.canShare) {
    const file = new File([blob], name, { type });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; }
      catch (err) { if (err.name === 'AbortError') return false; } // other errors: fall back to a download
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  return true;
}

function reportFileName(kind, title) {
  return `${slug(title)}-${kind}-${todayStr()}.csv`;
}

$('exportDetailsCsv').addEventListener('click', async () => {
  const { exps, title } = reportData();
  const H = state.home;
  const rows = [['Date', 'Trip', 'Category', 'Note', 'Amount', 'Currency', `Rate (per 1 ${H})`, `Amount (${H})`,
    'ATM fee', `ATM fee (${H})`, `Statement (${H})`, `Bank markup (${H})`, `Cost (${H})`]];
  for (const e of exps) {
    rows.push([e.date, tripName(e.tripId), e.category, e.note, e.amount, e.currency, +(+e.rate).toPrecision(8), n2(e.homeAmount),
      e.atmFee || '', e.homeFee ? n2(e.homeFee) : '', n2(e.statementAmount),
      e.statementAmount != null ? n2(markup(e)) : '', n2(cost(e))]);
  }
  rows.push(['Total', '', '', '', '', '', '', '', '', '', '', '', n2(totals(exps).spend)]);
  if (await download(csv(rows), reportFileName('details', title))) toast(`Exported ${exps.length} expenses`);
});

$('exportSummaryCsv').addEventListener('click', async () => {
  const { exps, title, period, catLabel } = reportData();
  const H = state.home;
  const t = totals(exps);
  const days = new Set(exps.map(e => e.date)).size;
  const g = groupRows(exps);
  const rows = [
    ['Report', title], ['Period', period], ['Categories', catLabel], ['Created', todayStr()], ['Home currency', H], [],
    ['Metric', H], ['Total spent', n2(t.spend)], [`Per day (${days} days)`, n2(t.spend / days)],
    ['ATM fees', n2(t.fees)], ['Cash withdrawn', n2(t.cash)], ['Bank markup', n2(t.bank)],
    ['Expenses', exps.length], [],
    ['Category', H], ...categoryRows(exps, t).map(r => [r.label, n2(r.value)]), ['Total', n2(t.spend)], [],
    ['Trip', H], ...g.trips.map(r => [r.label, n2(r.value)]), [],
    ['Currency', 'Paid', `${H} (market rate)`], ...g.currencies.map(c => [c.cur, n2(c.local), n2(c.home)]),
  ];
  if (await download(csv(rows), reportFileName('summary', title))) toast('Summary exported');
});

// ---------- Settings ----------

function renderSettings() {
  fillSelect($('homeCurrency'), Rates.currencies(), state.home);
  renderBackupInfo();
  const info = Rates.info;
  $('rateInfo').textContent = info
    ? `Last updated ${new Date(info.date).toLocaleString()} (source: open.er-api.com).`
    : 'No rates downloaded yet. Connect to the internet and tap refresh.';
  $('catList').innerHTML = state.categories.map(c =>
    c === CASH || c === UNCAT
      ? `<li><span class="cat-fixed" title="Built in, can't be renamed">${esc(c)}</span></li>`
      : `<li><button type="button" class="cat-name" data-rename-cat="${esc(c)}">${esc(c)}</button><button data-del-cat="${esc(c)}" aria-label="Remove ${esc(c)}">✕</button></li>`).join('');
}

$('homeCurrency').addEventListener('change', async e => {
  const newHome = e.target.value, oldHome = state.home;
  const factor = Rates.get(newHome, oldHome); // newHome per 1 oldHome
  if (state.expenses.length && !factor) {
    toast('Need exchange rates to switch — go online first');
    e.target.value = oldHome;
    return;
  }
  if (state.expenses.length && !confirm(`Convert all totals from ${oldHome} to ${newHome}?`)) { e.target.value = oldHome; return; }
  state.expenses.forEach(x => {
    x.homeAmount = round2(x.homeAmount * factor);
    x.homeFee = round2((x.homeFee || 0) * factor);
    if (x.statementAmount != null) x.statementAmount = round2(x.statementAmount * factor);
    x.rate = x.rate / factor;
  });
  state.trips.forEach(t => { if (t.builtin && t.currency === oldHome) t.currency = newHome; });
  state.home = newHome;
  save();
  resetExpenseForm();
  renderAll();
  updateRates(true);
});

// ----- Rename or merge a category -----

function openRename(c) {
  const n = state.expenses.filter(e => e.category === c).length;
  $('renameFrom').textContent = c;
  $('renameTo').value = c;
  $('renameHint').textContent = `${n} expense${n === 1 ? '' : 's'} use this category and will change too. Use another category's name to merge them.`;
  $('catRename').hidden = false;
  $('renameTo').focus();
  $('renameTo').select();
}

function renameCategory(from, to) {
  to = to.trim();
  if (!to || to === from) return true;
  const other = state.categories.find(c => c !== from && c.toLowerCase() === to.toLowerCase());
  if (other === CASH || other === UNCAT) { toast(`${other} is built in. Pick another name.`); return false; }
  const n = state.expenses.filter(e => e.category === from).length;
  const target = other || to;
  if (other && !confirm(`Merge "${from}" into "${other}"? ${n} expense${n === 1 ? '' : 's'} will move to ${other}.`)) return false;
  state.expenses.forEach(e => { if (e.category === from) e.category = target; });
  state.categories = other ? state.categories.filter(c => c !== from) : state.categories.map(c => c === from ? to : c);
  if (report.cats) report.cats = [...new Set(report.cats.map(c => c === from ? target : c))];
  save();
  toast(other ? `Merged into ${other}` : `Renamed to ${to}${n ? ` · ${n} expense${n === 1 ? '' : 's'} updated` : ''}`);
  return true;
}

$('catRename').addEventListener('submit', e => {
  e.preventDefault();
  if (!renameCategory($('renameFrom').textContent, $('renameTo').value)) return;
  $('catRename').hidden = true;
  renderSettings();
  resetExpenseForm();
  renderAddView();
});
$('renameCancel').addEventListener('click', () => { $('catRename').hidden = true; });

$('catList').addEventListener('click', e => {
  if (e.target.dataset.renameCat) { openRename(e.target.dataset.renameCat); return; }
  const c = e.target.dataset.delCat;
  if (!c || c === CASH || c === UNCAT) return;
  state.categories = state.categories.filter(x => x !== c);
  save(); renderSettings(); resetExpenseForm();
});

$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('catName').value.trim();
  if (!name) return;
  if (state.categories.some(c => c.toLowerCase() === name.toLowerCase())) { toast('Already exists'); return; }
  const at = state.categories.indexOf('Other'); // new categories go before "Other"
  state.categories.splice(at < 0 ? state.categories.length : at, 0, name);
  save(); $('catName').value = ''; renderSettings(); resetExpenseForm();
});

$('refreshRates').addEventListener('click', () => updateRates(true));

// ---------- Backup reminder ----------

const BACKUP_EVERY = 30;   // days between backups before the Add tab reminds you
const NEVER_MIN = 10;      // with no backup yet, remind once there are this many expenses
const SNOOZE_DAYS = 7;

const daysBetween = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);

function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Whether a backup is overdue, and a sentence saying so.
function backupStatus(today = todayStr()) {
  const n = state.expenses.length;
  if (!state.lastBackup) {
    return { due: n >= NEVER_MIN, text: n ? `Never backed up. ${n} expense${n > 1 ? 's' : ''} exist only on this device.` : 'Never backed up.' };
  }
  const days = daysBetween(state.lastBackup, today);
  const when = days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
  return { due: n > 0 && days >= BACKUP_EVERY, days, text: `Last backup ${when} (${fmtDate(state.lastBackup, { month: 'short', day: 'numeric', year: 'numeric' })}).` };
}

function renderBackupNudge() {
  const b = backupStatus();
  const snoozed = state.backupSnoozeUntil && todayStr() < state.backupSnoozeUntil;
  $('backupNudge').hidden = !b.due || snoozed;
  $('backupNudgeText').textContent = state.lastBackup
    ? `Your last backup was ${b.days} days ago. Your expenses live only on this phone.`
    : `You haven't backed up yet, and your ${state.expenses.length} expenses live only on this phone.`;
}

function renderBackupInfo() {
  const b = backupStatus();
  $('backupInfo').textContent = b.text;
  $('backupInfo').classList.toggle('due', b.due);
}

async function backup() {
  const ok = await download(JSON.stringify(state, null, 2), `trip-expenses-${todayStr()}.json`, 'application/json');
  if (!ok) return; // cancelled, so the reminder stays
  state.lastBackup = todayStr();
  delete state.backupSnoozeUntil;
  save();
  renderBackupNudge();
  renderBackupInfo();
  toast('Backup saved');
}

$('exportBtn').addEventListener('click', backup);
$('nudgeBackup').addEventListener('click', backup);
$('nudgeLater').addEventListener('click', () => {
  state.backupSnoozeUntil = addDays(todayStr(), SNOOZE_DAYS);
  save();
  renderBackupNudge();
});

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.trips) || !Array.isArray(data.expenses)) throw new Error();
    if (!confirm(`Replace current data with backup (${data.trips.length} trips, ${data.expenses.length} expenses)?`)) return;
    state = migrate({ ...freshState(), ...data });
    save(); resetTripForm(); resetExpenseForm(); renderAll(); renderSettings();
    toast('Backup restored');
  } catch { toast('That file is not a valid backup'); }
});

// ---------- Rates ----------

async function updateRates(force) {
  const info = Rates.info;
  const stale = !info || info.base !== state.home || Date.now() - new Date(info.date) > 6 * 3600 * 1000;
  if (!navigator.onLine || !(force || stale)) return;
  try {
    await Rates.refresh(state.home);
    if (force) toast('Rates updated');
    if (!$('editId').value && !rateTouched) setRateField(); // don't replace a rate you typed
    renderTopbar();
    if ($('view-settings').classList.contains('active')) renderSettings();
  } catch {
    if (force) toast('Could not reach the rate service');
  }
}

window.addEventListener('online', () => { renderTopbar(); updateRates(false); });
window.addEventListener('offline', renderTopbar);

// ---------- Start ----------

function renderAll() {
  renderTopbar();
  renderAddView();
  if ($('view-trips').classList.contains('active')) renderTrips();
  if ($('view-summary').classList.contains('active')) renderSummary();
  if ($('view-reconcile').classList.contains('active')) renderReconcile();
  if ($('view-sort').classList.contains('active')) renderSort();
  if ($('view-report').classList.contains('active')) renderReport();
}

resetTripForm();
resetExpenseForm();
renderAll();
updateRates(false);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
