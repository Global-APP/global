const RATE_LIMIT_HEADERS = [
  'X-RateLimit-Limit',
  'X-RateLimit-Remaining',
  'X-RateLimit-Reset',
  'X-RateLimit-Reset-After',
  'X-RateLimit-Bucket',
  'Retry-After'
];

function sanitizarRota(route) {
  const original = String(route || '');
  let safe = original.split(/[?#]/, 1)[0];
  try {
    if (/^https?:\/\//i.test(safe)) {
      const url = new URL(safe);
      safe = `${url.origin}${url.pathname}`;
    }
  } catch {
    safe = safe.replace(/\/\/[^/@]+:[^/@]+@/, '//');
  }
  safe = safe.replace(/(\/webhooks\/\d+)\/[^/]+/i, '$1/:token');
  return safe.replace(/\d{17,20}/g, ':id');
}

function instalarDebugRest(rest, logger, enabled) {
  if (!enabled || !rest || rest.__debugInstrumented) return;
  Object.defineProperty(rest, '__debugInstrumented', { value: true });
  if (typeof rest.request === 'function') {
    const originalRequest = rest.request;
    rest.request = async function debugRequest(method, route, options) {
      const startedAt = Date.now();
      const safeMethod = String(method || 'GET').toUpperCase();
      const safeRoute = sanitizarRota(route);
      logger.debug('HTTP', `→ ${safeMethod} ${safeRoute}`);
      try {
        const result = await originalRequest.call(this, method, route, options);
        logger.debug('HTTP', `← ${safeMethod} ${safeRoute} concluído em ${Date.now() - startedAt}ms`);
        return result;
      } catch (error) {
        const status = error && (error.statusCode || error.status);
        const code = error && error.code;
        logger.debug('HTTP', `← ${safeMethod} ${safeRoute} falhou${status ? ` status=${status}` : ''}${code ? ` código=${String(code).slice(0, 80)}` : ''} após ${Date.now() - startedAt}ms`);
        throw error;
      }
    };
  }
  const rateLimiter = rest.rateLimiter;
  if (rateLimiter && typeof rateLimiter.updateFromHeaders === 'function') {
    const originalUpdate = rateLimiter.updateFromHeaders;
    rateLimiter.updateFromHeaders = function debugRateHeaders(route, headers) {
      const values = RATE_LIMIT_HEADERS
        .map((name) => [name, headers && typeof headers.get === 'function' ? headers.get(name) : null])
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([name, value]) => `${name}=${String(value).slice(0, 100)}`);
      if (values.length) logger.debug('HTTP', `Rate limit ${sanitizarRota(route)} | ${values.join(' ')}`);
      return originalUpdate.call(this, route, headers);
    };
  }
}

module.exports = { instalarDebugRest, sanitizarRota };
