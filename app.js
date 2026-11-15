// Trip Expenses — all data is stored on this device in localStorage.

const STORE_KEY = 'tripExpenses.data';
const CASH = 'Cash withdrawal';
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Lodging', 'Activities', 'Shopping', 'eSIM / Phone', CASH, 'Other'];

// ---------- Storage ----------

function freshState() {
  return { version: 1, home: 'USD', trips: [], expenses: [], categories: [...DEFAULT_CATEGORIES], activeTripId: null };
}

function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    if (s && Array.isArray(s.trips) && Array.isArray(s.expenses)) return { ...freshState(), ...s };
  } catch {}
  return freshState();
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
  const tab = name === 'reconcile' ? 'summary' : name; // Reconcile lives under Summary
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === tab));
  if (name === 'trips') renderTrips();
  if (name === 'reconcile') renderReconcile();
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

function setRateField() {
  const cur = $('currency').value;
  const r = Rates.get(cur, state.home);
  $('rate').value = r ? +r.toPrecision(6) : (cur === state.home ? 1 : '');
  $('rateCur').textContent = cur;
  document.querySelectorAll('.homeCode').forEach(el => el.textContent = state.home);
  $('rateDetails').hidden = cur === state.home;
  updateConverted();
}

function updateConverted() {
  const amt = parseFloat($('amount').value);
  const cur = $('currency').value;
  const rate = parseFloat($('rate').value);
  const fee = parseFloat($('atmFee').value) || 0;
  if (!amt || cur === state.home) { $('converted').textContent = ''; return; }
  if (!rate) { $('converted').textContent = 'No rate yet — enter one under Exchange rate'; return; }
  let txt = '≈ ' + money(amt / rate);
  if ($('category').value === CASH && fee) txt += ` + ${money(fee / rate)} fee`;
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
}

$('amount').addEventListener('input', updateConverted);
$('atmFee').addEventListener('input', updateConverted);
$('rate').addEventListener('input', updateConverted);
$('currency').addEventListener('change', setRateField);
$('category').addEventListener('change', toggleFee);
$('cancelEdit').addEventListener('click', () => { resetExpenseForm(); showView('trips'); });

$('expenseForm').addEventListener('submit', e => {
  e.preventDefault();
  const trip = activeTrip();
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
    tripId: old ? old.tripId : trip.id,
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

  const keepCur = currency, keepCat = category, keepDate = expense.date;
  resetExpenseForm();
  if (!editId) { // keep choices for quick repeat entries
    $('currency').value = keepCur; $('category').value = keepCat; $('date').value = keepDate;
    toggleFee(); setRateField();
  }
  toast(editId ? 'Expense updated' : 'Saved · ' + money(expense.homeAmount + expense.homeFee));
  if (editId) showView('trips');
  else $('amount').focus();
});

function editExpense(id) {
  const x = state.expenses.find(e => e.id === id);
  if (!x) return;
  showView('add');
  $('editId').value = x.id;
  $('addTitle').textContent = 'Edit expense';
  $('saveBtn').textContent = 'Update expense';
  $('cancelEdit').hidden = false;
  if (!state.categories.includes(x.category)) state.categories.push(x.category);
  fillSelect($('category'), state.categories, x.category);
  fillSelect($('currency'), Rates.currencies(), x.currency);
  $('amount').value = x.amount;
  $('atmFee').value = x.atmFee || '';
  $('date').value = x.date;
  $('note').value = x.note;
  toggleFee();
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
        <div class="sub">${esc(t.currency)}${dates ? ' · ' + dates : ''}</div>
      </div>
      <div class="amt">${money(spend)}</div>
      <button class="icon-btn" data-edit-trip="${t.id}">Edit</button>
      <button class="icon-btn danger" data-del-trip="${t.id}" aria-label="Delete trip">✕</button>
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
const report = { mode: 'trip', tripId: null, rangeTripId: ALL, from: '', to: '' };

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
  return { exps, title, period: period || '' };
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

  const { exps, title, period } = reportData();
  const el = $('report');
  $('exportDetailsCsv').disabled = $('exportSummaryCsv').disabled = !exps.length;
  if (!exps.length) { el.innerHTML = '<p class="empty">No expenses match this report.</p>'; return; }

  const t = totals(exps);
  const days = new Set(exps.map(e => e.date)).size;
  const multiTrip = new Set(exps.map(e => e.tripId)).size > 1;
  const g = groupRows(exps);

  let html = `<p class="report-meta"><b>${esc(title)}</b>${period ? ' · ' + esc(period) : ''} · ${exps.length} expense${exps.length > 1 ? 's' : ''}</p>
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

function download(text, name, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function reportFileName(kind, title) {
  return `${slug(title)}-${kind}-${todayStr()}.csv`;
}

$('exportDetailsCsv').addEventListener('click', () => {
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
  download(csv(rows), reportFileName('details', title));
  toast(`Exported ${exps.length} expenses`);
});

$('exportSummaryCsv').addEventListener('click', () => {
  const { exps, title, period } = reportData();
  const H = state.home;
  const t = totals(exps);
  const days = new Set(exps.map(e => e.date)).size;
  const g = groupRows(exps);
  const rows = [
    ['Report', title], ['Period', period], ['Created', todayStr()], ['Home currency', H], [],
    ['Metric', H], ['Total spent', n2(t.spend)], [`Per day (${days} days)`, n2(t.spend / days)],
    ['ATM fees', n2(t.fees)], ['Cash withdrawn', n2(t.cash)], ['Bank markup', n2(t.bank)],
    ['Expenses', exps.length], [],
    ['Category', H], ...categoryRows(exps, t).map(r => [r.label, n2(r.value)]), ['Total', n2(t.spend)], [],
    ['Trip', H], ...g.trips.map(r => [r.label, n2(r.value)]), [],
    ['Currency', 'Paid', `${H} (market rate)`], ...g.currencies.map(c => [c.cur, n2(c.local), n2(c.home)]),
  ];
  download(csv(rows), reportFileName('summary', title));
  toast('Summary exported');
});

// ---------- Settings ----------

function renderSettings() {
  fillSelect($('homeCurrency'), Rates.currencies(), state.home);
  const info = Rates.info;
  $('rateInfo').textContent = info
    ? `Last updated ${new Date(info.date).toLocaleString()} (source: open.er-api.com).`
    : 'No rates downloaded yet. Connect to the internet and tap refresh.';
  $('catList').innerHTML = state.categories.map(c =>
    `<li>${esc(c)}${c === CASH ? '' : `<button data-del-cat="${esc(c)}" aria-label="Remove ${esc(c)}">✕</button>`}</li>`).join('');
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
  state.home = newHome;
  save();
  resetExpenseForm();
  renderAll();
  updateRates(true);
});

$('catList').addEventListener('click', e => {
  const c = e.target.dataset.delCat;
  if (!c) return;
  state.categories = state.categories.filter(x => x !== c);
  save(); renderSettings(); resetExpenseForm();
});

$('catForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('catName').value.trim();
  if (!name) return;
  if (state.categories.some(c => c.toLowerCase() === name.toLowerCase())) { toast('Already exists'); return; }
  state.categories.splice(state.categories.length - 1, 0, name); // keep "Other" last
  save(); $('catName').value = ''; renderSettings(); resetExpenseForm();
});

$('refreshRates').addEventListener('click', () => updateRates(true));

$('exportBtn').addEventListener('click', () => {
  download(JSON.stringify(state, null, 2), `trip-expenses-${todayStr()}.json`, 'application/json');
});

$('importFile').addEventListener('change', async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.trips) || !Array.isArray(data.expenses)) throw new Error();
    if (!confirm(`Replace current data with backup (${data.trips.length} trips, ${data.expenses.length} expenses)?`)) return;
    state = { ...freshState(), ...data };
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
    if (!$('editId').value) setRateField();
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
  if ($('view-report').classList.contains('active')) renderReport();
}

if (!state.activeTripId && state.trips.length) state.activeTripId = state.trips[0].id;
resetTripForm();
resetExpenseForm();
renderAll();
if (!state.trips.length) showView('trips');
updateRates(false);

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
