// The Content-Security-Policy `atm serve` sends with the dashboard (atm-cli/atm/server.py page_csp), rebuilt here for
// the e2e server (serve.mjs), so every e2e test runs under it; tests/scripts/serve.test.mjs checks the two agree.
import { createHash } from 'node:crypto';

/** The policy for a page (its bytes): its own inline scripts by hash, nothing else from anywhere */
export function pageCsp(page) {
  const hashes = [
    ...Buffer.from(page)
      .toString('latin1')
      .matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi),
  ]
    .filter(([, attrs]) => !attrs.includes('src='))
    .map(([, , body]) => `'sha256-${createHash('sha256').update(Buffer.from(body, 'latin1')).digest('base64')}'`);
  return [
    "default-src 'none'",
    `script-src ${hashes.join(' ') || "'none'"}`,
    "style-src 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
