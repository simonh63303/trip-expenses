# Receipt reading (OCR) files

These files let the app read receipts on the phone, with no server. They load only when you first scan a receipt, and the service worker then keeps them for offline use.

| File | From npm package | Licence |
|---|---|---|
| `tesseract.min.js`, `worker.min.js` | `tesseract.js@6.0.1` (`dist/`) | Apache-2.0, see `LICENSE-tesseract.js.md` |
| `core/tesseract-core-simd-lstm.wasm.js`, `core/tesseract-core-lstm.wasm.js` | `tesseract.js-core@6.1.2` | Apache-2.0, see `LICENSE-tesseract.js-core` |
| `lang/eng.traineddata.gz` | `@tesseract.js-data/eng@1.0.0` (`4.0.0_best_int/`) | Apache-2.0, from the Tesseract OCR project |

The app reads in LSTM-only mode, so tesseract.js only ever loads one of the two `core` files: the `simd` one on newer phones, the plain one on older phones.

To update: install newer versions with npm, copy the same files over these, and bump `VERSION` in `sw.js`.
