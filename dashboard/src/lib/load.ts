import type { Task, TasksFile } from './types';

export const DEFAULT_PROJECT_NAME = 'Task Dashboard';

export interface LoadedTasks {
  tasks: Task[];
  taskMap: Map<string, Task>;
  projectName: string;
  meta: TasksFile['meta'];
  /** The file's size, in characters (≈ bytes: task files are mostly ASCII), for the archive notice (D-5.4) */
  bytes: number;
}

export function parseTasksFile(data: TasksFile, bytes = 0): LoadedTasks {
  const tasks = data.tasks ?? [];
  return {
    tasks,
    taskMap: new Map(tasks.map((t) => [t.id, t])),
    projectName: data.meta?.project || DEFAULT_PROJECT_NAME,
    meta: data.meta,
    bytes,
  };
}

/** What the server said identifies this version of a file, sent back to ask "has it changed?" */
export interface Validators {
  etag?: string;
  lastModified?: string;
}

type FileResult = { unchanged: true } | { unchanged: false; text: string; validators: Validators };

/**
 * Fetches a file next to the dashboard (D-5.1). With the validators of the last load, the request is conditional
 * (If-None-Match / If-Modified-Since): a 304 means unchanged. The browser's cache is bypassed so the 304 reaches us
 * instead of a cached copy; atm serve and the Vite dev server both answer it. `missing` is returned for a 404 when
 * given; other error responses reject with "HTTP <status>".
 */
async function fetchFile(
  url: string,
  fetchFn: typeof fetch,
  since?: Validators,
  missing?: string,
): Promise<FileResult> {
  const headers: Record<string, string> = {};
  if (since?.etag) headers['If-None-Match'] = since.etag;
  if (since?.lastModified) headers['If-Modified-Since'] = since.lastModified;
  const resp = await fetchFn(url, { cache: 'no-store', headers });
  if (resp.status === 304 && since) return { unchanged: true };
  if (resp.status === 404 && missing !== undefined) return { unchanged: false, text: missing, validators: {} };
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const validators: Validators = {};
  const etag = resp.headers.get('ETag');
  const lastModified = resp.headers.get('Last-Modified');
  if (etag) validators.etag = etag;
  if (lastModified) validators.lastModified = lastModified;
  return { unchanged: false, text: await resp.text(), validators };
}

export type LoadResult = { unchanged: true } | { unchanged: false; loaded: LoadedTasks; validators: Validators };

/**
 * Fetches ./tasks.json, conditionally when `since` is given: a 304 means unchanged, and nothing is parsed.
 * Rejects with "HTTP <status>" for error responses and with the JSON error for invalid content.
 */
export async function loadTasks(fetchFn: typeof fetch = fetch, since?: Validators): Promise<LoadResult> {
  const file = await fetchFile('./tasks.json', fetchFn, since);
  if (file.unchanged) return file;
  return {
    unchanged: false,
    loaded: parseTasksFile(JSON.parse(file.text), file.text.length),
    validators: file.validators,
  };
}

export type ArchiveResult = { unchanged: true } | { unchanged: false; tasks: Task[]; validators: Validators };

/**
 * Fetches ./tasks-archive.json (DM-5), conditionally when `since` is given. A missing archive (404) is an empty one;
 * an unreadable one is an error, like tasks.json.
 */
export async function loadArchive(fetchFn: typeof fetch = fetch, since?: Validators): Promise<ArchiveResult> {
  const file = await fetchFile('./tasks-archive.json', fetchFn, since, '{"tasks": []}');
  if (file.unchanged) return file;
  const data = JSON.parse(file.text) as TasksFile;
  return { unchanged: false, tasks: Array.isArray(data.tasks) ? data.tasks : [], validators: file.validators };
}
