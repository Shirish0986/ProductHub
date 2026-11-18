import { sleep } from './utils.js';

// Public demo API. Writes are acknowledged but not persisted on the server.
const BASE_URL = 'https://dummyjson.com';
const DEFAULT_TIMEOUT = 8000;

export class ApiError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'ApiError';
    this.status = status; // 0 means network failure or timeout
  }
}

/** Only transient failures are worth retrying. */
const isRetryable = (err) =>
  err.status === 0 || err.status === 429 || err.status >= 500;

/**
 * Low-level request helper.
 * - Aborts requests that exceed `timeout` (AbortController).
 * - Retries transient failures with exponential backoff (only for idempotent GETs).
 */
async function request(path, { method = 'GET', body, retries = 0, timeout = DEFAULT_TIMEOUT } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new ApiError(`Server responded with status ${res.status}`, { status: res.status });
      }
      return await res.json();
    } catch (err) {
      const apiError = err instanceof ApiError
        ? err
        : new ApiError(
            err.name === 'AbortError'
              ? 'The request timed out. Please try again.'
              : 'Network error. Check your connection.',
            { cause: err },
          );
      if (attempt >= retries || !isRetryable(apiError)) throw apiError;
      await sleep(2 ** attempt * 300); // 300ms, 600ms, ...
    } finally {
      clearTimeout(timer);
    }
  }
}

export const productApi = {
  async fetchAll() {
    const { products } = await request('/products?limit=0', { retries: 2 });
    return products;
  },

  fetchCategories() {
    return request('/products/categories', { retries: 2 });
  },

  // Mutations are not retried: a retried POST could create duplicates.
  create(data) {
    return request('/products/add', { method: 'POST', body: data });
  },

  update(id, data) {
    return request(`/products/${id}`, { method: 'PUT', body: data });
  },

  remove(id) {
    return request(`/products/${id}`, { method: 'DELETE' });
  },
};
