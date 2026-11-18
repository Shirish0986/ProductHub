import { validateQuantity } from './validation.js';

const STORAGE_KEY = 'pma.cart.v1';
export const TAX_RATE = 0.08;

const round2 = (n) => Math.round(n * 100) / 100;

const isValidItem = (i) =>
  i &&
  i.id !== undefined &&
  typeof i.title === 'string' &&
  Number.isFinite(i.price) &&
  Number.isInteger(i.quantity) &&
  i.quantity >= 1;

/** Returns localStorage, or null when storage is blocked (e.g. private mode). */
const getStorage = () => {
  try {
    const storage = window.localStorage;
    storage.setItem('__probe__', '1');
    storage.removeItem('__probe__');
    return storage;
  } catch {
    return null;
  }
};

/**
 * Shopping cart. Items are stored in a Map keyed by product id, and the cart
 * is persisted to localStorage after every change.
 */
export class CartStore {
  #items = new Map();
  #listeners = new Set();
  #storage;

  constructor(storage = getStorage()) {
    this.#storage = storage;
    this.#restore();

    // Keep cart in sync when another browser tab changes it.
    window.addEventListener('storage', (event) => {
      if (event.key === STORAGE_KEY) {
        this.#restore();
        this.#notify();
      }
    });
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify() {
    for (const listener of this.#listeners) listener(this);
  }

  #commit() {
    try {
      this.#storage?.setItem(STORAGE_KEY, JSON.stringify([...this.#items.values()]));
    } catch (err) {
      console.warn('Cart could not be saved to localStorage.', err);
    }
    this.#notify();
  }

  /** Loads the cart from localStorage. Corrupted data is discarded, not crashed on. */
  #restore() {
    if (!this.#storage) return;
    try {
      const raw = this.#storage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) throw new TypeError('Stored cart is not an array');
      this.#items = new Map(parsed.filter(isValidItem).map((item) => [item.id, item]));
    } catch (err) {
      console.warn('Discarding corrupted cart data.', err);
      this.#items = new Map();
      this.#storage.removeItem(STORAGE_KEY);
    }
  }

  /** Adds `quantity` units of a product, checking stock and limits. */
  add(product, quantity = 1) {
    const current = this.#items.get(product.id)?.quantity ?? 0;
    this.#setQuantity(product, current + Number(quantity));
  }

  setQuantity(id, quantity) {
    const item = this.#items.get(id);
    if (!item) throw new Error('This item is no longer in your cart.');
    if (Number(quantity) === 0) return this.remove(id);
    this.#setQuantity(item, Number(quantity));
  }

  #setQuantity(product, quantity) {
    const message = validateQuantity(quantity, { stock: product.stock ?? Infinity });
    if (message) throw new RangeError(message);

    this.#items.set(product.id, {
      id: product.id,
      title: product.title,
      price: product.price,
      category: product.category,
      stock: product.stock ?? null,
      imageKey: product.imageKey ?? null,
      thumbnail: product.thumbnail ?? '',
      quantity,
    });
    this.#commit();
  }

  /** Refreshes name, price and stock for an edited product, keeping its quantity. */
  syncProduct(product) {
    const item = this.#items.get(product.id);
    if (!item) return;
    this.#items.set(product.id, {
      ...item,
      title: product.title,
      price: product.price,
      category: product.category,
      stock: product.stock,
      imageKey: product.imageKey ?? null,
      thumbnail: product.thumbnail ?? '',
    });
    this.#commit();
  }

  remove(id) {
    if (this.#items.delete(id)) this.#commit();
  }

  clear() {
    this.#items.clear();
    this.#commit();
  }

  quantityOf(id) {
    return this.#items.get(id)?.quantity ?? 0;
  }

  get items() {
    return [...this.#items.values()].map((item) => ({
      ...item,
      lineTotal: round2(item.price * item.quantity),
    }));
  }

  get totals() {
    const items = this.items;
    const count = items.reduce((sum, i) => sum + i.quantity, 0);
    const subtotal = round2(items.reduce((sum, i) => sum + i.lineTotal, 0));
    const tax = round2(subtotal * TAX_RATE);
    return { count, subtotal, tax, total: round2(subtotal + tax) };
  }
}
