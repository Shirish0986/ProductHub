# ProductHub — Advanced JavaScript Product Management App

A responsive product inventory and shopping-cart application built with **HTML, CSS and Core JavaScript (ES6+)**. No React, Angular, jQuery, or JavaScript libraries are used.

## Features

- **Product CRUD:** Create, view, edit and delete products with field validation.
- **REST API:** Fetch products and categories from DummyJSON using `fetch`, `async/await`, and `Promise.all`.
- **Search:** Search title, brand and description with debouncing.
- **Filtering:** Filter by category and minimum/maximum price.
- **Sorting:** Name A–Z/Z–A, price ascending/descending and rating.
- **Cart:** Add/remove products, change quantity, stock limits, line totals, subtotal, 8% tax and grand total.
- **Persistence:** Cart and locally created/edited/deleted product changes are stored in LocalStorage. Changes are restored after refresh and layered over the demo API data.
- **Responsive UI:** Dashboard metrics, inventory cards, responsive layout, status indicator, dialog validation and toast notifications.
- **Error handling:** API timeout/retry, fallback sample products, validation, LocalStorage corruption recovery and graceful local changes when demo API mutations are unavailable.

## JavaScript concepts demonstrated

| Concept | Where / how it is used |
|---|---|
| ES6 modules | Separate files for API, stores, UI, validation and utilities |
| Classes | `ProductStore`, `CartStore`, `ApiError` |
| Private fields | Store internals use `#` private fields |
| Closures | Debounce, throttle, memoization and ID generator keep private state |
| Promises | API calls, dialog promise, sleep helper |
| `async/await` | Loading API data and product CRUD |
| `Promise.all()` | Loads products and categories in parallel |
| `Map` | Product records and cart records keyed by ID |
| `Set` | Unique categories and event listeners |
| Debouncing | Search waits until typing pauses |
| Throttling | Price input updates are rate-limited |
| Event delegation | Product grid and cart list use one listener each |
| Observer pattern | Stores notify subscribers after state changes |
| LocalStorage | Cart and local product modifications survive reloads |
| Input validation | Product fields and cart quantity are validated |
| Error handling | API, validation and persistence errors are handled |

## Project structure

```text
ProductHub/
├── index.html
├── README.md
├── css/
│   └── styles.css
└── js/
    ├── app.js
    ├── api.js
    ├── productStore.js
    ├── cartStore.js
    ├── ui.js
    ├── validation.js
    └── utils.js
```

## Run locally

### Option 1 — VS Code Live Server

1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` → **Open with Live Server**.

### Option 2 — Python

Open a terminal in this folder and run:

```bash
python -m http.server 8080
```

Then visit:

```text
http://localhost:8080
```

The app uses native ES modules, so do not open the HTML file directly with `file://`.

## API notes

The app reads from [DummyJSON Products](https://dummyjson.com/products) and its categories endpoint. DummyJSON is a demonstration API: remote create/update/delete endpoints do not persist changes permanently. Product edits and additions are therefore saved locally in this browser using LocalStorage and merged with the API data on the next load. If the API is unavailable, the app uses a small seed catalog and remains usable.

## Testing checklist

- [ ] Products load and the API status indicator reports connection.
- [ ] Search title, brand and description.
- [ ] Filter by category and price range.
- [ ] Sort by name, price and rating.
- [ ] Create, edit and delete a product.
- [ ] Refresh and confirm local product changes remain.
- [ ] Add a product to cart and update quantity.
- [ ] Try a quantity above available stock.
- [ ] Check subtotal, tax and total.
- [ ] Refresh and confirm cart remains.
- [ ] Clear filters and test mobile layout.

## GitHub submission

1. Create a new GitHub repository (for example, `producthub-advanced-js`).
2. Upload the project files/folders—not the ZIP itself.
3. Add the repository URL to your submission.
4. Record a short demo showing API loading, search/filter/sort, CRUD, cart and LocalStorage persistence.


## Adding product photos

The product form supports both an image URL and an image upload.

- Select **Upload photo** to choose an image from your device.
- A preview is shown before saving.
- Images are resized/compressed in the browser and saved in IndexedDB.
- Product records and image keys are stored locally, so uploaded images remain after refreshing the page.
- You can replace an image or remove it while editing a product.
- Image URL is available as an alternative to uploading.
- Accepted image files: browser-supported image formats; maximum original file size is 10 MB.

Uploaded images use IndexedDB (`producthub-images`) rather than LocalStorage so larger image data does not fill LocalStorage's quota.
