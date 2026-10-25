import type { Task, TasksFile } from './types';

export const DEFAULT_PROJECT_NAME = 'Task Dashboard';

export interface LoadedTasks {
  tasks: Task[];
  taskMap: Map<string, Task>;
  projectName: string;
  meta: TasksFile['meta'];
}

export function parseTasksFile(data: TasksFile): LoadedTasks {
  const tasks = data.tasks ?? [];
  return {
    tasks,
    taskMap: new Map(tasks.map((t) => [t.id, t])),
    projectName: data.meta?.project || DEFAULT_PROJECT_NAME,
    meta: data.meta,
  };
}

/** What the server said identifies this version of tasks.json, sent back to ask "has it changed?" */
export interface Validators {
  etag?: string;
  lastModified?: string;
}

export type LoadResult = { unchanged: true } | { unchanged: false; loaded: LoadedTasks; validators: Validators };

/**
 * Fetches ./tasks.json relative to the dashboard (D-5.1). With the validators of the last load, the request is
 * conditional (If-None-Match / If-Modified-Since): a 304 means unchanged, and nothing is parsed. The browser's cache
 * is bypassed so the 304 reaches us instead of a cached copy; atm serve and the Vite dev server both answer it.
 * Rejects with "HTTP <status>" for error responses and with the JSON error for invalid content.
 */
export async function loadTasks(fetchFn: typeof fetch = fetch, since?: Validators): Promise<LoadResult> {
  const headers: Record<string, string> = {};
  if (since?.etag) headers['If-None-Match'] = since.etag;
  if (since?.lastModified) headers['If-Modified-Since'] = since.lastModified;
  const resp = await fetchFn('./tasks.json', { cache: 'no-store', headers });
  if (resp.status === 304 && since) return { unchanged: true };
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const validators: Validators = {};
  const etag = resp.headers.get('ETag');
  const lastModified = resp.headers.get('Last-Modified');
  if (etag) validators.etag = etag;
  if (lastModified) validators.lastModified = lastModified;
  return { unchanged: false, loaded: parseTasksFile(await resp.json()), validators };
}
