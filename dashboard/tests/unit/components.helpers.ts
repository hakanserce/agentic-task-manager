import { emptyFilters } from '../../src/lib/filters';
import { parseTasksFile } from '../../src/lib/load';
import { dashboard } from '../../src/lib/state.svelte';
import type { TasksFile } from '../../src/lib/types';

/** Put the shared dashboard state into a freshly loaded state for a component test. */
export function loadIntoDashboard(data: TasksFile) {
  const { tasks, taskMap, projectName } = parseTasksFile(data);
  Object.assign(dashboard, {
    tasks,
    taskMap,
    projectName,
    loaded: true,
    loadError: null,
    filters: emptyFilters(),
    detailId: null,
    detailOpen: false,
  });
}
