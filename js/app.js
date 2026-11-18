import { ProductStore } from './productStore.js';
import { CartStore } from './cartStore.js';
import { debounce, throttle, formatCurrency } from './utils.js';
import { getProductImage } from './imageStore.js';
import {
  $,
  renderProducts,
  renderCategoryOptions,
  renderCart,
  openProductDialog,
  toast,
  setBanner,
  setLoading,
} from './ui.js';

const store = new ProductStore();
const cart = new CartStore();

// All filter and sort state lives in one object.
const DEFAULT_VIEW = { search: '', category: 'all', sortBy: 'title-asc', minPrice: 0, maxPrice: Infinity };
const view = { ...DEFAULT_VIEW };

/* ---------- Rendering ---------- */

const activeImageUrls = new Set();

function hydrateUploadedImages() {
  for (const url of activeImageUrls) URL.revokeObjectURL(url);
  activeImageUrls.clear();

  $('#product-grid').querySelectorAll('img[data-image-key]').forEach(async (img) => {
    const key = img.dataset.imageKey;
    try {
      const blob = await getProductImage(key);
      const placeholder = img.nextElementSibling;
      if (!blob || !img.isConnected) {
        placeholder?.removeAttribute('hidden');
        return;
      }
      const url = URL.createObjectURL(blob);
      activeImageUrls.add(url);
      img.onload = () => {
        img.classList.add('image-loaded');
        placeholder?.setAttribute('hidden', '');
      };
      img.onerror = () => {
        img.classList.remove('image-loaded');
        placeholder?.removeAttribute('hidden');
      };
      img.src = url;
    } catch (error) {
      img.nextElementSibling?.removeAttribute('hidden');
      console.warn('Could not load saved product image', error);
    }
  });
}

function render() {
  const products = store.query(view);
  renderProducts($('#product-grid'), products, (id) => cart.quantityOf(id));
  hydrateUploadedImages();
  $('#result-count').textContent = `${products.length} products shown · ${store.size} in inventory`;
  renderStats();
}

function renderStats() {
  const allProducts = [...store.query({ search: '', category: 'all', sortBy: 'title-asc', minPrice: 0, maxPrice: Infinity })];
  $('#stat-products').textContent = store.size.toLocaleString();
  $('#stat-low-stock').textContent = allProducts.filter((p) => Number(p.stock) <= 10).length.toLocaleString();
  $('#stat-categories').textContent = store.categories.length.toLocaleString();
  $('#stat-cart').textContent = cart.totals.count.toLocaleString();
}

function renderApiStatus(status) {
  const el = $('#api-status');
  const online = status.source === 'api';
  el.classList.toggle('api-status--offline', !online);
  el.innerHTML = `<span class="status-dot"></span><span>${online ? 'Live API connected' : 'Demo mode · local changes saved'}</span>`;
}

function renderFilters() {
  renderCategoryOptions($('#category'), store.categories, view.category);
}

function renderCartPanel() {
  // Enrich older persisted cart rows with current product image references.
  const items = cart.items.map((item) => {
    const product = store.get(item.id);
    return product ? { ...item, imageKey: product.imageKey ?? item.imageKey ?? null, thumbnail: product.thumbnail ?? item.thumbnail ?? '' } : item;
  });
  renderCart({ items, totals: cart.totals });
  hydrateCartImages();
}

function hydrateCartImages() {
  $('#cart-items').querySelectorAll('img[data-cart-image-key]').forEach(async (img) => {
    const key = img.dataset.cartImageKey;
    const placeholder = img.nextElementSibling;
    try {
      const blob = await getProductImage(key);
      if (!blob || !img.isConnected) {
        placeholder?.removeAttribute('hidden');
        return;
      }
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        placeholder?.setAttribute('hidden', '');
        img.classList.add('cart-thumb-loaded');
      };
      img.onerror = () => {
        placeholder?.removeAttribute('hidden');
        img.hidden = true;
        URL.revokeObjectURL(url);
      };
      img.src = url;
    } catch (error) {
      placeholder?.removeAttribute('hidden');
      console.warn('Could not load cart image', error);
    }
  });
}

/* ---------- Reactive wiring (observer pattern) ---------- */

store.subscribe((type, product) => {
  if (type === 'updated') cart.syncProduct(product);
  if (type === 'deleted') cart.remove(product.id);
  if (type !== 'deleted') renderFilters();
  render();
});

cart.subscribe(() => {
  renderCartPanel();
  render(); // refreshes "In cart (n)" labels on product cards
});

/* ---------- Product actions (event delegation on the grid) ---------- */

$('#product-grid').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const product = store.get(Number(button.dataset.id));
  if (!product) return toast('Product not found.', 'error');

  try {
    switch (button.dataset.action) {
      case 'add':
        cart.add(product);
        toast(`Added "${product.title}" to cart`, 'success');
        break;
      case 'edit':
        await handleEdit(product);
        break;
      case 'delete':
        await handleDelete(product);
        break;
    }
  } catch (err) {
    toast(err.message, 'error');
  }
});

async function handleEdit(product) {
  const data = await openProductDialog({ product, categories: store.categories });
  if (!data) return;
  await store.update(product.id, data);
  toast('Product updated', 'success');
}

async function handleDelete(product) {
  if (!confirm(`Delete "${product.title}"?`)) return;
  await store.remove(product.id);
  toast('Product deleted', 'success');
}

$('#new-product').addEventListener('click', async () => {
  try {
    const data = await openProductDialog({ categories: store.categories });
    if (!data) return;
    const product = await store.create(data);
    toast(`Created "${product.title}"`, 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
});

/* ---------- Search, filter and sort ---------- */

// Debounce: wait until typing pauses before filtering.
const onSearch = debounce(() => {
  view.search = $('#search').value;
  render();
}, 300);
$('#search').addEventListener('input', onSearch);

$('#category').addEventListener('change', (e) => {
  view.category = e.target.value;
  render();
});

$('#sort').addEventListener('change', (e) => {
  view.sortBy = e.target.value;
  render();
});

// Throttle: limit re-filtering while the user drags or spins the price inputs.
const onPriceChange = throttle(() => {
  view.minPrice = Number($('#min-price').value) || 0;
  view.maxPrice = Number($('#max-price').value) || Infinity;
  render();
}, 150);
$('#min-price').addEventListener('input', onPriceChange);
$('#max-price').addEventListener('input', onPriceChange);

$('#clear-filters').addEventListener('click', () => {
  Object.assign(view, DEFAULT_VIEW);
  $('#search').value = '';
  $('#min-price').value = '';
  $('#max-price').value = '';
  $('#category').value = 'all';
  $('#sort').value = 'title-asc';
  render();
});

/* ---------- Cart panel ---------- */

const cartPanel = $('#cart-panel');
const cartToggle = $('#cart-toggle');

function setCartOpen(open) {
  cartPanel.classList.toggle('open', open);
  cartToggle.setAttribute('aria-expanded', String(open));
}

cartToggle.addEventListener('click', () => setCartOpen(!cartPanel.classList.contains('open')));
$('#cart-close').addEventListener('click', () => setCartOpen(false));

// Event delegation on the cart list handles +, −, remove and manual quantity edits.
$('#cart-items').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const id = Number(button.dataset.id);
  const attempt = (fn) => {
    try {
      fn();
    } catch (err) {
      toast(err.message, 'error');
    }
  };

  switch (button.dataset.action) {
    case 'inc':
      attempt(() => cart.setQuantity(id, cart.quantityOf(id) + 1));
      break;
    case 'dec':
      attempt(() => cart.setQuantity(id, cart.quantityOf(id) - 1));
      break;
    case 'remove':
      cart.remove(id);
      break;
  }
});

$('#cart-items').addEventListener('change', (event) => {
  const input = event.target;
  if (input.dataset.action !== 'set-qty') return;

  if (input.value.trim() === '') return renderCartPanel(); // ignore empty input
  try {
    cart.setQuantity(Number(input.dataset.id), input.value);
  } catch (err) {
    toast(err.message, 'error');
    renderCartPanel(); // reset the input to the stored value
  }
});

$('#cart-clear').addEventListener('click', () => {
  if (cart.items.length && confirm('Remove all items from your cart?')) cart.clear();
});

$('#checkout').addEventListener('click', () => {
  if (!cart.items.length) return toast('Your cart is empty.', 'error');

  const { count, total } = cart.totals;
  cart.clear(); // a real app would call a payment/order API here
  setCartOpen(false);
  toast(`Order placed: ${count} item(s), ${formatCurrency(total)}`, 'success', 5000);
});

/* ---------- Startup ---------- */

async function init() {
  setLoading(true);
  const status = await store.load();
  setLoading(false);

  if (status.source === 'seed') {
    setBanner(
      `Could not reach the product API (${status.error?.message ?? 'unknown error'}). ` +
      'Showing sample data. Local product changes are saved in this browser.',
    );
  }

  renderCartPanel();
  renderApiStatus(status);
  render();
}

init();
