import { escapeHtml, formatCurrency } from './utils.js';
import { validateProduct } from './validation.js';
import { getProductImage } from './imageStore.js';

export const $ = (selector, root = document) => root.querySelector(selector);

const productCard = (p, inCart) => `
  <article class="card" data-id="${p.id}">
    <div class="card__media">
      <div class="image-glow"></div>
      ${p.imageKey
        ? `<img data-image-key="${escapeHtml(p.imageKey)}" alt="${escapeHtml(p.title)}" loading="lazy"><span class="product-placeholder" hidden aria-hidden="true">${escapeHtml(p.title.charAt(0).toUpperCase())}</span>`
        : p.thumbnail
          ? `<img src="${escapeHtml(p.thumbnail)}" alt="${escapeHtml(p.title)}" loading="lazy">`
          : `<span class="product-placeholder" aria-hidden="true">${escapeHtml(p.title.charAt(0).toUpperCase())}</span>`}
      ${p.localOnly || p.localModified ? `<span class="local-badge">Local</span>` : ''}
    </div>
    <div class="card__body">
      <div class="card__topline">
        <span class="category-pill">${escapeHtml(p.category || 'Uncategorized')}</span>
        ${Number.isFinite(p.rating) && p.rating > 0 ? `<span class="rating">★ ${Number(p.rating).toFixed(1)}</span>` : ''}
      </div>
      <h3 class="card__title" title="${escapeHtml(p.title)}">${escapeHtml(p.title)}</h3>
      <p class="card__meta">${escapeHtml(p.brand || 'Unbranded')}</p>
      <div class="card__price-row">
        <p class="card__price">${formatCurrency(p.price)}</p>
        <span class="stock-pill ${p.stock === 0 ? 'stock-pill--out' : p.stock <= 10 ? 'stock-pill--low' : 'stock-pill--good'}">
          ${p.stock === 0 ? 'Out of stock' : p.stock <= 10 ? `${p.stock} left` : `${p.stock} in stock`}
        </span>
      </div>
      ${p.description ? `<p class="card__description">${escapeHtml(p.description)}</p>` : ''}
    </div>
    <div class="card__actions">
      <button class="add-button" data-action="add" data-id="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>
        ${inCart ? `In cart · ${inCart}` : 'Add to cart'}
      </button>
      <button class="icon-action" data-action="edit" data-id="${p.id}" aria-label="Edit ${escapeHtml(p.title)}" title="Edit">✎</button>
      <button class="icon-action icon-action--danger" data-action="delete" data-id="${p.id}" aria-label="Delete ${escapeHtml(p.title)}" title="Delete">⌫</button>
    </div>
  </article>`;

/** Renders product cards. Uses event delegation, so no per-card listeners are needed. */
export function renderProducts(container, products, quantityOf) {
  container.innerHTML = products.length
    ? products.map((p) => productCard(p, quantityOf(p.id))).join('')
    : '<p class="empty">No products match these filters.</p>';
}

export function renderCategoryOptions(select, categories, selected) {
  select.innerHTML =
    '<option value="all">All categories</option>' +
    categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
  select.value = selected;
}

const cartRow = (i) => `
  <li class="cart-row">
    <div class="cart-row__product">
      <div class="cart-row__thumb">
        ${i.imageKey
          ? `<img data-cart-image-key="${escapeHtml(i.imageKey)}" alt="${escapeHtml(i.title)}" loading="lazy"><span class="cart-thumb-placeholder" hidden>${escapeHtml(i.title.charAt(0).toUpperCase())}</span>`
          : i.thumbnail
            ? `<img src="${escapeHtml(i.thumbnail)}" alt="${escapeHtml(i.title)}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="cart-thumb-placeholder" hidden>${escapeHtml(i.title.charAt(0).toUpperCase())}</span>`
            : `<span class="cart-thumb-placeholder">${escapeHtml(i.title.charAt(0).toUpperCase())}</span>`}
      </div>
      <div class="cart-row__info">
        <strong>${escapeHtml(i.title)}</strong>
        <span class="muted">${formatCurrency(i.price)} each</span>
      </div>
    </div>
    <span class="line-total">${formatCurrency(i.lineTotal)}</span>
    <div class="qty">
      <button class="ghost" data-action="dec" data-id="${i.id}" aria-label="Decrease quantity">−</button>
      <input type="number" min="1" max="99" value="${i.quantity}"
             data-action="set-qty" data-id="${i.id}" aria-label="Quantity">
      <button class="ghost" data-action="inc" data-id="${i.id}" aria-label="Increase quantity">+</button>
    </div>
    <button class="ghost danger" data-action="remove" data-id="${i.id}" aria-label="Remove item">×</button>
  </li>`;

export function renderCart({ items, totals }) {
  $('#cart-items').innerHTML = items.length
    ? items.map(cartRow).join('')
    : '<li class="empty">Your cart is empty.</li>';
  $('#cart-count').textContent = totals.count;
  $('#cart-subtotal').textContent = formatCurrency(totals.subtotal);
  $('#cart-tax').textContent = formatCurrency(totals.tax);
  $('#cart-total').textContent = formatCurrency(totals.total);
  $('#cart-badge').textContent = totals.count;
}

/** Shows per-field error messages. Fields with no error are cleared. */
export function showFieldErrors(errors = {}) {
  document.querySelectorAll('[data-error]').forEach((el) => {
    const message = errors[el.dataset.error] ?? '';
    el.textContent = message;
    el.closest('label')?.classList.toggle('invalid', Boolean(message));
  });
}

/**
 * Opens the product dialog and resolves with validated product data,
 * or with null if the user cancels. Each open uses an AbortController,
 * so listeners are removed when the dialog closes.
 */
export function openProductDialog({ product = null, categories = [] } = {}) {
  const dialog = $('#product-dialog');
  const form = $('#product-form');
  const field = (name) => form.elements.namedItem(name);
  const fileInput = $('#product-image-file');
  const previewWrap = $('#image-preview-wrap');
  const preview = $('#image-preview');
  const removeImageButton = $('#remove-product-image');
  let selectedFile = null;
  let removeImage = false;
  let previewObjectUrl = null;

  const setPreview = (src) => {
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    if (src) {
      preview.src = src;
      previewWrap.hidden = false;
    } else {
      preview.removeAttribute('src');
      previewWrap.hidden = true;
    }
  };

  form.reset();
  $('#product-dialog-title').textContent = product ? 'Edit product' : 'New product';
  $('#category-options').innerHTML = categories
    .map((c) => `<option value="${escapeHtml(c)}"></option>`)
    .join('');

  field('id').value = product?.id ?? '';
  if (product) {
    for (const name of ['title', 'price', 'category', 'stock', 'brand', 'description', 'imageUrl']) {
      if (name === 'imageUrl') field(name).value = product.imageKey ? '' : (product.thumbnail || '');
      else field(name).value = product[name] ?? '';
    }
    if (product.thumbnail && !product.imageKey) setPreview(product.thumbnail);
    else if (product.imageKey) {
      getProductImage(product.imageKey).then((blob) => {
        if (blob && dialog.open && !selectedFile) {
          const url = URL.createObjectURL(blob);
          setPreview(url);
          previewObjectUrl = url;
        }
      }).catch(() => {});
    }
  } else {
    setPreview(null);
  }

  showFieldErrors({});
  dialog.showModal();
  field('title').focus();

  const controller = new AbortController();
  const { signal } = controller;

  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files?.[0] || null;
    removeImage = false;
    field('imageUrl').value = '';
    if (selectedFile) {
      if (!selectedFile.type.startsWith('image/')) {
        toast('Please choose an image file.', 'error');
        fileInput.value = '';
        selectedFile = null;
        return;
      }
      if (selectedFile.size > 10 * 1024 * 1024) {
        toast('Image must be 10 MB or smaller.', 'error');
        fileInput.value = '';
        selectedFile = null;
        return;
      }
      const url = URL.createObjectURL(selectedFile);
      setPreview(url);
      previewObjectUrl = url;
    }
  }, { signal });

  field('imageUrl').addEventListener('input', () => {
    selectedFile = null;
    fileInput.value = '';
    removeImage = false;
    const value = field('imageUrl').value.trim();
    if (value) setPreview(value);
    else if (!product?.imageKey && !product?.thumbnail) setPreview(null);
  }, { signal });

  removeImageButton.addEventListener('click', () => {
    selectedFile = null;
    fileInput.value = '';
    field('imageUrl').value = '';
    removeImage = true;
    setPreview(null);
  }, { signal });

  return new Promise((resolve) => {
    const finish = (value) => {
      controller.abort();
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      resolve(value);
    };

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const raw = Object.fromEntries(new FormData(form));
      raw.imageUrl = field('imageUrl').value.trim();
      const { valid, errors, value } = validateProduct(raw);
      showFieldErrors(errors);
      if (valid) {
        finish({ ...value, imageFile: selectedFile, removeImage });
        dialog.close();
      }
    }, { signal });

    $('[data-cancel]', dialog).addEventListener('click', () => dialog.close(), { signal });
    dialog.addEventListener('close', () => finish(null), { signal });
  });
}

export function toast(message, type = 'info', duration = 3500) {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), duration);
}

export function setBanner(message) {
  const el = $('#banner');
  el.textContent = message;
  el.hidden = !message;
}

export function setLoading(on) {
  $('#loading').hidden = !on;
}
