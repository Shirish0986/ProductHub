/**
 * Reusable utilities. Several are closures: each returns a function that
 * keeps private state (timers, caches, counters) in its enclosing scope.
 */

/**
 * Debounce: runs `fn` only after `wait` ms have passed without another call.
 * Used for search-as-you-type so we don't filter on every keystroke.
 */
export const debounce = (fn, wait = 300) => {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
};

/**
 * Throttle (leading + trailing): runs `fn` at most once per `limit` ms.
 * The first call runs immediately; the latest call during the cooldown
 * runs once the window ends, so the final value is never lost.
 */
export const throttle = (fn, limit = 200) => {
  let timer = null;
  let pending = null;

  const flush = () => {
    if (pending) {
      const args = pending;
      pending = null;
      fn(...args);
      timer = setTimeout(flush, limit);
    } else {
      timer = null;
    }
  };

  return (...args) => {
    if (timer) {
      pending = args;
      return;
    }
    fn(...args);
    timer = setTimeout(flush, limit);
  };
};

/**
 * Memoize the most recent call. The cache key is the argument plus a
 * version number, so bumping the version invalidates the cache.
 */
export const memoizeLast = (fn) => {
  let lastKey;
  let lastValue;
  return (arg, version = 0) => {
    const key = JSON.stringify([arg, version]);
    if (key !== lastKey) {
      lastKey = key;
      lastValue = fn(arg);
    }
    return lastValue;
  };
};

/** Closure-based id generator: each call returns the next integer. */
export const createIdGenerator = (start = 1) => {
  let next = start;
  return () => next++;
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Escapes text before it is inserted into HTML, preventing XSS. */
export const escapeHtml = (value = '') =>
  String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[ch]);

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const formatCurrency = (amount) => currency.format(amount);
