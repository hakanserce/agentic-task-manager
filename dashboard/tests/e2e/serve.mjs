// Minimal static server for e2e tests. The built dashboard is served as /svelte/tasks-dashboard.html, with the
// security headers atm serve sends (T-226); tasks.json is always supplied per test via page.route.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pageCsp } from './csp.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VARIANTS = {
  svelte: root + '../plugin/templates/tasks-dashboard.html',
};
const port = Number(process.env.PORT ?? 4173);

createServer(async (req, res) => {
  const match = /^\/(\w+)\/tasks-dashboard\.html$/.exec(new URL(req.url, 'http://x').pathname);
  const file = match && VARIANTS[match[1]];
  if (!file) {
    res.writeHead(404).end('not found');
    return;
  }
  try {
    const body = await readFile(file);
    res
      .writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-security-policy': pageCsp(body),
        'x-content-type-options': 'nosniff',
        'cross-origin-resource-policy': 'same-origin',
      })
      .end(body);
  } catch {
    res.writeHead(404).end('missing build: ' + file);
  }
}).listen(port, () => console.log(`e2e server on http://localhost:${port}`));
