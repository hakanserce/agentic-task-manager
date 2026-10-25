import { emptyFilters } from '../../src/lib/filters';
import { parseTasksFile } from '../../src/lib/load';
import { dashboard } from '../../src/lib/state.svelte';
import type { TasksFile } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';

/**
 * Put the shared dashboard state into a freshly loaded state for a component test. `archive` stands for a loaded
 * tasks-archive.json; without it there is none loaded.
 */
export function loadIntoDashboard(data: TasksFile, archive?: TasksFile) {
  const { tasks, taskMap, projectName, meta, bytes } = parseTasksFile(data, JSON.stringify(data).length);
  Object.assign(dashboard, {
    tasks,
    taskMap,
    projectName,
    meta,
    tasksBytes: bytes,
    vocab: resolveVocabulary(meta),
    loaded: true,
    loadError: null,
    filters: emptyFilters(),
    query: '',
    detailId: null,
    detailOpen: false,
    archive: archive?.tasks ?? [],
    archiveLoaded: !!archive,
    includeArchived: false,
    // Keep component tests free of background reloads (the real default is on)
    autoRefresh: false,
  });
}
