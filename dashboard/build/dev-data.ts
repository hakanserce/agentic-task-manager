// Dev server only: serve tasks.json and claims.json from a project's task folder, so `npm run dev` shows real data
// with hot reload. ATM_DEV_DATA picks the folder; the default is this repo's own .agentic-task-manager/.
import { readFile } from 'node:fs/promises';
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
        if (name !== 'tasks.json' && name !== 'claims.json') return next();
        try {
          const body = await readFile(path.join(dir, name));
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end('not found');
        }
      });
    },
  };
}
