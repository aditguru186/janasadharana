'use strict';

/**
 * Parse CORS_ORIGINS and also allow the www / apex counterpart of each host.
 * Coolify often lists only one of https://example.com vs https://www.example.com,
 * which makes the other origin fail with 403 in the browser.
 */
function parseCorsOrigins(raw) {
  const list = String(raw || 'http://localhost:5431')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
  const set = new Set(list);

  for (const origin of list) {
    try {
      const u = new URL(origin);
      const port = u.port ? `:${u.port}` : '';
      const base = `${u.protocol}//`;
      if (u.hostname.startsWith('www.')) {
        set.add(`${base}${u.hostname.slice(4)}${port}`);
      } else if (u.hostname.includes('.')) {
        set.add(`${base}www.${u.hostname}${port}`);
      }
    } catch {
      /* skip malformed entries */
    }
  }

  return [...set];
}

module.exports = { parseCorsOrigins };
