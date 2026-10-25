// Dev server only: serve tasks.json, claims.json and tasks-archive.json from a project's task folder, so `npm run dev` shows real data
// with hot reload. ATM_DEV_DATA picks the folder; the default is this repo's own .agentic-task-manager/.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

export function devData(defaultDir: string): Plugin {
  const dir = process.env.ATM_DEV_DATA || defaultDir;
  return {
    name: 'atm-dev-data',
    apply: 'serve',
    configureServer(server) {
      server.config.logger.info(`  atm: serving tasks.json and claims.json from ${dir}`);
      server.middlewares.use(async (req, res, next) => {
        const name = req.url?.split('?')[0].replace(/^\/+/, '');
        if (name !== 'tasks.json' && name !== 'claims.json' && name !== 'tasks-archive.json') return next();
        try {
          const file = path.join(dir, name);
          // Like atm serve: an ETag from size and mtime, and a 304 when the dashboard already has this version (D-5.1)
          const { size, mtimeMs } = await stat(file);
          const etag = `"${size.toString(16)}-${Math.round(mtimeMs * 1e6).toString(16)}"`;
          res.setHeader('ETag', etag);
          res.setHeader('Cache-Control', 'no-store');
          if (req.headers['if-none-match'] === etag) {
            res.statusCode = 304;
            res.end();
            return;
          }
          const body = await readFile(file);
          res.setHeader('Content-Type', 'application/json');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('not found');
        }
      });
    },
  };
}
