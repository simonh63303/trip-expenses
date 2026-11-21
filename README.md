# Trip Expenses

A small app for tracking spending on trips, especially abroad. It works offline, converts foreign currencies to your home currency, tracks ATM fees, totals spend by week, trip and category, and exports reports as CSV.

All data stays on your device. There are no accounts, and nothing you enter leaves the phone.

## Use it on your phone

The app is live at **https://simonh63303.github.io/trip-expenses/**

1. Open that address in Safari (iPhone) or Chrome (Android).
2. Tap **Share**, then **Add to Home Screen** (on Android: menu, then **Install app**).
3. Open it from the home screen. After the first visit it works offline.

GitHub Pages publishes whatever is on the `main` branch. Merge a change into `main` and the site updates within a minute or two; the app fetches the new files the next time it opens with a connection.

Each device keeps its own data. To move it, use **Settings → Export backup** on one and **Import backup** on the other.

## Run it on this computer

From the `Apps` folder:

```bash
python -m http.server 8765 --directory trip-expenses
```

Then open http://localhost:8765.

## How it works

- **Trips tab**: create a trip and pick its local currency (e.g. JPY). The active trip is shown at the top. A built-in **Everyday** trip holds daily, non-trip spending; you can rename it but not delete it.
- **Add tab**: enter the amount, currency, category and trip. The dollar (home currency) equivalent appears as you type. Choosing **Cash withdrawal** shows an ATM fee field. To move an expense to another trip or category, open it from the Trips tab and change either one. The edit form also has **Delete expense**. The keyboard's arrow key moves to the next box; only **Save** saves.
- **Summary tab**: total, per day, ATM fees, cash withdrawn, plus bars by week and by category. Switch between "This trip" and "All trips".
- **Report tab**: pick a trip (or all trips), or a date range (optionally one trip). Tap category buttons to limit the report to those categories; **All** clears the filter. It shows totals, spend by category, by trip and by currency, then every expense. Two buttons export it as CSV for a spreadsheet:
  - **Export details**: one row per expense (date, trip, category, note, amount and currency, rate, home amount, ATM fee, statement amount, bank markup, cost) and a total row.
  - **Export summary**: the totals and the category, trip and currency tables.
- **Settings tab**: home currency, refresh rates, add, rename or remove categories, and export or import a backup. Tap a category to rename it; every expense in it changes too. Renaming to another category's name merges the two. **Cash withdrawal** and **Uncategorized** are built in and can't be renamed.

### Backups
Your expenses live only on the device, so back them up. **Settings** shows when you last did. The **Add** tab reminds you when the last backup is 30 or more days old, or when you have 10 or more expenses and have never backed up. **Later** hides the reminder for 7 days.

In the home-screen app, **Export backup** (and the CSV exports) open the Share sheet, because home-screen apps on phones often ignore downloads. Choose **Save to Files**, AirDrop or Mail. In a browser tab, the file downloads as usual. Cancelling the Share sheet doesn't count as a backup.

### Scanning receipts
Tap **Scan receipt** on the Add tab to open the camera, or **From photos** to use a picture you already took. The phone reads it with Tesseract (no server, nothing leaves the device) and fills in the total, date and shop name. Check them, fix anything it misread, and tap **Save**. **What the scanner read** shows the raw text if you want to see where a number came from.

- Scans go to the **Everyday** trip, in the **Uncategorized** category. A **"3 to sort"** button then appears on the Add tab; it opens **To sort**, where one tap files each receipt under a category, a picker moves it to a trip, and **Delete** removes a bad scan.
- The total comes from a line like "Total" or "Amount due", never "Subtotal", "Tax" or "Change". With no such line, the largest amount is used.
- Dates like 03/04/2026 are read month-first (US), unless that gives an impossible or future date.
- The first scan downloads the reader (about 7 MB). After that, scanning works offline. The photo itself is not kept.

### Cash and ATM fees
The withdrawn cash is **not** counted as spending, because you log what you buy with it. The ATM fee **is** counted. This avoids counting the same money twice.

### Exchange rates
When online, the app downloads daily rates from open.er-api.com (free, no key) and saves them on the device. Offline, it uses the last saved rates.

For an expense dated in the past, the app fetches that day's rate instead, from the free [fawazahmed0 currency API](https://github.com/fawazahmed0/exchange-api) (340 currencies, daily back to 2 March 2024). The note under the amount says which day's rate is used, e.g. "rate for Nov 12". Each day is downloaded once and kept on the device. Offline, or for a date before March 2024, today's rate is used and the note says so. A rate you type yourself is never replaced. When you edit a saved expense, changing its date keeps its rate; tap **Use market rate for this date** under Exchange rate to switch. Each expense keeps the rate it was logged with, so old totals don't shift. You can type your own rate under "Exchange rate", for example to match a card statement.

### Checking your bank's conversion
Each foreign expense saves the original amount and currency, the app's market-rate conversion, and (optionally) the **amount on your statement**. Once the trip is over, go to **Summary → Reconcile with statement** and type in what each charge cost on your statement. Each amount saves as you type, so you can do it in more than one sitting. The difference is shown as **bank markup**, per charge and in the Summary, and is counted in your total spend.

### Running the tests
The tests open the app in a headless Chromium at phone size and check what a person would see: reading receipts, the backup reminder, renaming categories, report filters, exchange rates for past dates, and offline scanning.

```bash
npm install                      # first time: installs Playwright
npx playwright install chromium  # first time: downloads the browser
npm test                         # all tests, about 10 seconds
npm test -- rates                # only test files whose name contains "rates"
```

The browser's clock is frozen at 19 Nov 2026 so date checks give the same answer on any day, and the exchange-rate services are answered from `tests/fixtures/` (a real 12 Nov 2026 rate file), so no internet is needed. The run ends with a count and exits with an error if any check fails.

| File | Checks |
|---|---|
| `tests/run.js` | Starts a local server, runs every `*.test.js`, prints a summary |
| `tests/helpers.js` | Shared setup: frozen clock, sample data, a drawn receipt photo |
| `parser.test.js` | Finding the total, date and shop name in receipt text |
| `scan.test.js` | Upgrading old data, a real OCR scan, To sort, scanning offline |
| `camera.test.js` | Scan receipt opens the camera; From photos opens the picker |
| `backup.test.js` | When the reminder shows, Later, the Share sheet |
| `categories.test.js` | Rename, merge, built-in names, Report category filter, CSVs |
| `rates.test.js` | Past-date rates, the backup address, typed rates, offline fallback |

### Updating the code
When you change `styles.css`, `app.js` or `rates.js`, bump the `?v=` number on its link in `index.html` so phones download the new version instead of an old cached copy.

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout: the five tabs and their forms |
| `styles.css` | Look and feel, phone-first, light and dark mode |
| `app.js` | Everything the app does: saving, totals, screens |
| `rates.js` | Downloading and caching exchange rates |
| `sw.js` | Service worker: saves the app files so it opens offline |
| `manifest.json`, `icon.svg` | Let the phone install it like an app |
| `ocr/` | Receipt reader (Tesseract), loaded on the first scan; see `ocr/README.md` |
| `tests/`, `package.json` | Automated tests; see Running the tests |

