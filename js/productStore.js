import { productApi } from './api.js';
import { createIdGenerator, memoizeLast } from './utils.js';
import { validateProduct, ValidationError } from './validation.js';
import { saveProductImage, deleteProductImage } from './imageStore.js';

// Offline fallback so the app stays usable when the API is unreachable.
const SEED_PRODUCTS = [
  { id: 1, title: 'Wireless Headphones', brand: 'SoundCo', category: 'audio', price: 79.99, stock: 25, rating: 4.5, description: 'Over-ear Bluetooth headphones with a 30-hour battery.' },
  { id: 2, title: 'Mechanical Keyboard', brand: 'KeyForge', category: 'computers', price: 129.5, stock: 0, rating: 4.7, description: 'Hot-swappable switches and RGB backlight.' },
  { id: 3, title: 'Ergonomic Mouse', brand: 'PointPro', category: 'computers', price: 45, stock: 60, rating: 4.1, description: 'Vertical grip mouse that reduces wrist strain.' },
  { id: 4, title: 'USB-C Hub', brand: 'PortMax', category: 'accessories', price: 34.25, stock: 12, rating: 3.9, description: '7-in-1 hub with HDMI and card readers.' },
  { id: 5, title: 'Smart Watch', brand: 'TimeLoop', category: 'wearables', price: 199, stock: 8, rating: 4.3, description: 'Heart-rate tracking, GPS and a 5-day battery.' },
  { id: 6, title: 'Desk Lamp', brand: 'LumaHome', category: 'home', price: 27.8, stock: 40, rating: 4.0, description: 'Dimmable LED lamp with a USB charging port.' },
].map((p) => ({ ...p, localOnly: true }));

const PRODUCT_STORAGE_KEY = 'pma.products.v1';

const safeStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const SORTERS = {
  'title-asc': (a, b) => a.title.localeCompare(b.title),
  'title-desc': (a, b) => b.title.localeCompare(a.title),
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  'rating-desc': (a, b) => (b.rating ?? 0) - (a.rating ?? 0),
};

/**
 * Holds all product state. Products live in a Map keyed by id, and categories
 * in a Set. Listeners are notified as (type, product) after every change.
 */
export class ProductStore {
  #products = new Map();
  #categories = new Set();
  #listeners = new Set();
  #version = 0;
  #status = { source: 'idle', error: null };
  #nextLocalId = createIdGenerator(1000);
  #localProducts = new Map();
  #deletedIds = new Set();
  #storage = safeStorage();

  constructor() {
    this.#restoreLocalChanges();
  }
  // Memoized query: recomputes only when the filters or the data change.
  #queryMemo = memoizeLast((options) => this.#runQuery(options));

  #restoreLocalChanges() {
    if (!this.#storage) return;
    try {
      const saved = JSON.parse(this.#storage.getItem(PRODUCT_STORAGE_KEY) || '{}');
      if (Array.isArray(saved.products)) {
        this.#localProducts = new Map(saved.products.filter((p) => p && Number.isFinite(Number(p.id))).map((p) => [p.id, p]));
      }
      if (Array.isArray(saved.deletedIds)) this.#deletedIds = new Set(saved.deletedIds);
    } catch (error) {
      console.warn('Saved product changes could not be read. Starting with a clean local product cache.', error);
      try { this.#storage.removeItem(PRODUCT_STORAGE_KEY); } catch {}
    }
  }

  #persistLocalChanges() {
    try {
      this.#storage?.setItem(PRODUCT_STORAGE_KEY, JSON.stringify({
        products: [...this.#localProducts.values()],
        deletedIds: [...this.#deletedIds],
      }));
    } catch (error) {
      console.warn('Product changes could not be saved to localStorage.', error);
    }
  }

  #getUniqueLocalId() {
    let id;
    do { id = this.#nextLocalId(); } while (this.#products.has(id) || this.#localProducts.has(id));
    return id;
  }

  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #notify(type, product = null) {
    this.#version++;
    for (const listener of this.#listeners) listener(type, product);
  }

  get status() { return this.#status; }
  get size() { return this.#products.size; }
  get categories() { return [...this.#categories].sort(); }
  get(id) { return this.#products.get(id); }

  /** Loads products and categories in parallel, falling back to seed data on failure. */
  async load() {
    this.#status = { source: 'loading', error: null };
    try {
      const [products, categories] = await Promise.all([
        productApi.fetchAll(),
        productApi.fetchCategories(),
      ]);
      this.#hydrate(products, categories, 'api', null);
    } catch (error) {
      this.#hydrate(SEED_PRODUCTS, [], 'seed', error);
    }
    this.#notify('loaded');
    return this.#status;
  }

  #hydrate(products, categories, source, error) {
    const base = new Map(products.map((p) => [p.id, { localOnly: false, ...p }]));
    for (const id of this.#deletedIds) base.delete(id);
    for (const [id, localProduct] of this.#localProducts) base.set(id, localProduct);
    this.#products = base;

    // API category values can be strings or objects depending on version.
    const slugs = categories.map((c) => (typeof c === 'string' ? c : c.slug));
    this.#categories = new Set([...slugs, ...[...base.values()].map((p) => p.category).filter(Boolean)]);
    this.#status = { source, error };
  }

  /**
   * Creates a product. The API call is a demo acknowledgement only, and the
   * server never returns a durable id, so the product is kept locally.
   */
  async create(input) {
    const { imageFile, removeImage, ...raw } = input;
    const { valid, errors, value } = validateProduct(raw);
    if (!valid) throw new ValidationError(errors);

    try {
      await productApi.create(value);
    } catch (err) {
      console.warn('Product API unavailable; keeping product locally.', err);
    }

    const product = { ...value, id: this.#getUniqueLocalId(), rating: 0, localOnly: true, thumbnail: value.imageUrl || '', imageKey: null };
    if (imageFile) {
      await saveProductImage(product.id, imageFile);
      product.imageKey = product.id;
      product.thumbnail = '';
    }
    delete product.imageUrl;
    this.#products.set(product.id, product);
    this.#localProducts.set(product.id, product);
    this.#deletedIds.delete(product.id);
    this.#categories.add(product.category);
    this.#persistLocalChanges();
    this.#notify('created', product);
    return product;
  }

  /** Updates a product. Remote errors propagate, and the local state is left unchanged. */
  async update(id, input) {
    const existing = this.#products.get(id);
    if (!existing) throw new Error('This product no longer exists.');

    const { imageFile, removeImage, ...raw } = input;
    const { valid, errors, value } = validateProduct(raw);
    if (!valid) throw new ValidationError(errors);

    if (!existing.localOnly) {
      try {
        await productApi.update(id, value);
      } catch (error) {
        console.warn('Remote update was unavailable; saved the edit locally.', error);
      }
    }

    const updated = { ...existing, ...value, localOnly: existing.localOnly, localModified: true };
    if (imageFile) {
      await saveProductImage(id, imageFile);
      updated.imageKey = id;
      updated.thumbnail = '';
    } else if (removeImage) {
      await deleteProductImage(existing.imageKey);
      updated.imageKey = null;
      updated.thumbnail = '';
    } else if (value.imageUrl) {
      if (existing.imageKey) await deleteProductImage(existing.imageKey);
      updated.imageKey = null;
      updated.thumbnail = value.imageUrl;
    } else if (existing.imageKey) {
      updated.imageKey = existing.imageKey;
      updated.thumbnail = '';
    }
    delete updated.imageUrl;
    this.#products.set(id, updated);
    this.#localProducts.set(id, updated);
    this.#rebuildCategories();
    this.#persistLocalChanges();
    this.#notify('updated', updated);
    return updated;
  }

  async remove(id) {
    const existing = this.#products.get(id);
    if (!existing) throw new Error('This product no longer exists.');

    if (!existing.localOnly) {
      try {
        await productApi.remove(id);
      } catch (error) {
        console.warn('Remote delete was unavailable; deleted locally.', error);
      }
    }

    if (existing.imageKey) await deleteProductImage(existing.imageKey);
    this.#products.delete(id);
    this.#localProducts.delete(id);
    this.#deletedIds.add(id);
    this.#persistLocalChanges();
    this.#rebuildCategories();
    this.#notify('deleted', existing);
    return existing;
  }

  #rebuildCategories() {
    this.#categories = new Set([...this.#products.values()].map((p) => p.category).filter(Boolean));
  }

  /** Public query: `options` are { search, category, sortBy, minPrice, maxPrice }. */
  query(options = {}) {
    return this.#queryMemo(options, this.#version);
  }

  #runQuery({ search = '', category = 'all', sortBy = 'title-asc', minPrice = 0, maxPrice = Infinity } = {}) {
    const term = search.trim().toLowerCase();

    const matches = (p) =>
      (category === 'all' || p.category === category) &&
      p.price >= minPrice &&
      p.price <= maxPrice &&
      (!term || [p.title, p.brand, p.description].some((field) => field?.toLowerCase().includes(term)));

    return [...this.#products.values()]
      .filter(matches)
      .sort(SORTERS[sortBy] ?? SORTERS['title-asc']);
  }
}
