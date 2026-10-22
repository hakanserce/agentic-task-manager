// Minimal static server for e2e tests. Each dashboard variant is served as
// /<variant>/tasks-dashboard.html; tasks.json is always supplied per test via page.route.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VARIANTS = {
  legacy: root + 'tests/legacy/tasks-dashboard.v0.4.0.html',
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
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(body);
  } catch {
    res.writeHead(404).end('missing build: ' + file);
  }
}).listen(port, () => console.log(`e2e server on http://localhost:${port}`));
