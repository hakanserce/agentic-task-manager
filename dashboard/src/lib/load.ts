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

/**
 * Fetches ./tasks.json (cache-busted) relative to the dashboard.
 * Rejects with "HTTP <status>" for error responses and with the JSON error for invalid content.
 */
export async function loadTasks(fetchFn: typeof fetch = fetch, now: () => number = Date.now): Promise<LoadedTasks> {
  const resp = await fetchFn('./tasks.json?' + now());
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  return parseTasksFile(await resp.json());
}
