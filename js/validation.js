/** Thrown when a product fails validation. `errors` maps field name to message. */
export class ValidationError extends Error {
  constructor(errors) {
    super('Please fix the highlighted fields.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

const str = (v) => String(v ?? '').trim();

/** Each rule returns an error message, or null when the value is valid. */
const rules = {
  title: (v) => {
    const s = str(v);
    if (!s) return 'Title is required';
    if (s.length < 2) return 'Title must be at least 2 characters';
    if (s.length > 100) return 'Title must be 100 characters or fewer';
    return null;
  },
  price: (v) => {
    const s = str(v);
    if (!s) return 'Price is required';
    if (!/^\d+(\.\d{1,2})?$/.test(s)) return 'Enter a valid price, e.g. 19.99';
    if (Number(s) <= 0) return 'Price must be greater than 0';
    if (Number(s) > 1_000_000) return 'Price must be under 1,000,000';
    return null;
  },
  category: (v) => {
    const s = str(v);
    if (!s) return 'Category is required';
    if (!/^[a-z0-9-]{2,40}$/.test(s)) return 'Use 2–40 lowercase letters, numbers or hyphens';
    return null;
  },
  stock: (v) => {
    const s = str(v);
    if (!s) return 'Stock is required';
    if (!/^\d+$/.test(s)) return 'Stock must be a whole number';
    if (Number(s) > 100_000) return 'Stock must be under 100,000';
    return null;
  },
  brand: (v) => (str(v).length > 50 ? 'Brand must be 50 characters or fewer' : null),
  description: (v) => (str(v).length > 500 ? 'Description must be 500 characters or fewer' : null),
  imageUrl: (v) => {
    const s = str(v);
    if (!s) return null;
    try { const url = new URL(s); return ['http:', 'https:'].includes(url.protocol) ? null : 'Image URL must use http or https'; }
    catch { return 'Enter a valid image URL'; }
  },
};

/** Converts raw form strings into typed, trimmed product fields. */
const normalize = (raw) => ({
  title: str(raw.title),
  price: Number(str(raw.price)),
  category: str(raw.category),
  stock: Number(str(raw.stock)),
  brand: str(raw.brand),
  description: str(raw.description),
  imageUrl: str(raw.imageUrl),
});

/**
 * Validates a product payload.
 * @returns {{valid: boolean, errors: Object, value: Object|null}}
 */
export function validateProduct(raw = {}) {
  const errors = {};
  for (const [field, check] of Object.entries(rules)) {
    const message = check(raw[field]);
    if (message) errors[field] = message;
  }
  return Object.keys(errors).length
    ? { valid: false, errors, value: null }
    : { valid: true, errors: {}, value: normalize(raw) };
}

/** Returns an error message for a cart quantity, or null if it is acceptable. */
export function validateQuantity(quantity, { stock = Infinity, max = 99 } = {}) {
  const n = Number(quantity);
  if (!Number.isInteger(n)) return 'Quantity must be a whole number';
  if (n < 1) return 'Quantity must be at least 1';
  if (n > max) return `Maximum ${max} per item`;
  if (n > stock) return `Only ${stock} left in stock`;
  return null;
}
