import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Plugin } from 'vite';

/**
 * The dev server sends the headers `atm serve` sends (atm-cli/atm/server.py, T-226), so something the policy would
 * block shows up while developing. Scripts are the dev server's own files here, plus index.html's inline ones (by
 * hash, as in the built page); Vite's client also needs its WebSocket.
 */
export function securityHeaders(): Plugin {
  return {
    name: 'atm-security-headers',
    apply: 'serve',
    configureServer(server) {
      const html = readFileSync(join(server.config.root, 'index.html'), 'utf8');
      const hashes = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
        .filter(([, attrs]) => !attrs.includes('src='))
        .map(([, , body]) => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
      const csp = [
        "default-src 'none'",
        ["script-src 'self'", ...hashes].join(' '),
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' ws://localhost:* ws://127.0.0.1:*",
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join('; ');
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Content-Security-Policy', csp);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        next();
      });
    },
  };
}
