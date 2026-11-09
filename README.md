# Trip Expenses

A small app for tracking spending on trips, especially abroad. It works offline, converts foreign currencies to your home currency, tracks ATM fees, and totals spend by week, by trip and by category.

All data stays on your device. There are no accounts and no server.

## Run it on this computer

From the `Apps` folder:

```bash
python -m http.server 8765 --directory trip-expenses
```

Then open http://localhost:8765.

## How it works

- **Trips tab**: create a trip and pick its local currency (e.g. JPY). The active trip is shown at the top.
- **Add tab**: enter the amount, currency and category. The dollar (home currency) equivalent appears as you type. Choosing **Cash withdrawal** shows an ATM fee field.
- **Summary tab**: total, per day, ATM fees, cash withdrawn, plus bars by week and by category. Switch between "This trip" and "All trips".
- **Settings tab**: home currency, refresh rates, add or remove categories, and export or import a backup.

### Cash and ATM fees
The withdrawn cash is **not** counted as spending, because you log what you buy with it. The ATM fee **is** counted. This avoids counting the same money twice.

### Exchange rates
When online, the app downloads daily rates from open.er-api.com (free, no key) and saves them on the device. Offline, it uses the last saved rates. Each expense keeps the rate it was logged with, so old totals don't shift. You can type your own rate under "Exchange rate", for example to match a card statement.

## Files

| File | What it does |
|---|---|
| `index.html` | The page layout: the four tabs and their forms |
| `styles.css` | Look and feel, phone-first, light and dark mode |
| `app.js` | Everything the app does: saving, totals, screens |
| `rates.js` | Downloading and caching exchange rates |
| `sw.js` | Service worker: saves the app files so it opens offline |
| `manifest.json`, `icon.svg` | Let the phone install it like an app |

## Putting it on your phone (later)

A phone can only install the app from an `https://` web address. Free options are GitHub Pages and Netlify (drag and drop the `trip-expenses` folder). Open the address on your phone once, then use "Add to Home Screen".
