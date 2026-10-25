// Dev server only: play atm serve's API (docs/multi-project-api.md) for one or more task folders, so `npm run dev`
// shows real data with hot reload. ATM_DEV_DATA picks the folders (.agentic-task-manager paths, separated like PATH);
// the default is this repo's own .agentic-task-manager/.
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { Plugin } from 'vite';

const FILES = new Set(['tasks.json', 'claims.json', 'tasks-archive.json']);

interface DevProject {
  id: string;
  name: string;
  dir: string;
}

/** Each folder's project: id and name from its tasks.json meta, falling back to the folder's place in the list */
async function devProjects(dirs: string[]): Promise<DevProject[]> {
  return Promise.all(
    dirs.map(async (dir, i) => {
      let meta: { id?: unknown; project?: unknown } = {};
      try {
        meta = JSON.parse(await readFile(path.join(dir, 'tasks.json'), 'utf8')).meta ?? {};
      } catch {
        // missing or unreadable: listed as missing below
      }
      const root = path.dirname(dir);
      return {
        id: typeof meta.id === 'string' && meta.id ? meta.id : `dev${i}`,
        name: typeof meta.project === 'string' && meta.project ? meta.project : path.basename(root),
        dir,
      };
    }),
  );
}

export function devData(defaultDir: string): Plugin {
  const dirs = (process.env.ATM_DEV_DATA || defaultDir).split(path.delimiter).filter(Boolean);
  return {
    name: 'atm-dev-data',
    apply: 'serve',
    configureServer(server) {
      server.config.logger.info(`  atm: serving the API for ${dirs.join(', ')}`);
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const json = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(body));
        };
        if (url === '/api/projects') {
          const projects = await devProjects(dirs);
          const listed = await Promise.all(
            projects.map(async (p) => ({
              id: p.id,
              name: p.name,
              path: path.dirname(p.dir),
              missing: !(await stat(path.join(p.dir, 'tasks.json')).catch(() => null)),
              summary: null,
            })),
          );
          json(200, { generated_at: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), projects: listed });
          return;
        }
        const match = /^\/p\/([^/]+)\/([^/]+)$/.exec(url);
        if (!match || !FILES.has(match[2])) return next();
        const project = (await devProjects(dirs)).find((p) => p.id === decodeURIComponent(match[1]));
        if (!project) return json(404, { error: 'unknown project' });
        try {
          const file = path.join(project.dir, match[2]);
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
          json(404, { error: 'not found' });
        }
      });
    },
  };
}
