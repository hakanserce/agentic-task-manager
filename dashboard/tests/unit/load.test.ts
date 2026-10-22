import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT_NAME, loadTasks, parseTasksFile } from '../../src/lib/load';
import standard from '../fixtures/standard.json';
import noMeta from '../fixtures/no-meta.json';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

describe('parseTasksFile', () => {
  it('indexes tasks by id and reads the project name', () => {
    const { tasks, taskMap, projectName } = parseTasksFile(standard);
    expect(tasks).toHaveLength(12);
    expect(taskMap.get('T-004')?.name).toBe('User login');
    expect(projectName).toBe('Standard Project');
  });

  it('falls back without meta or tasks', () => {
    expect(parseTasksFile(noMeta).projectName).toBe(DEFAULT_PROJECT_NAME);
    expect(parseTasksFile({ meta: { project: '' } }).projectName).toBe(DEFAULT_PROJECT_NAME);
    expect(parseTasksFile({}).tasks).toEqual([]);
  });

  it('keeps the last task when ids are duplicated', () => {
    const t = { phase: 0, type: 'feature', description: '', status: 'todo' };
    const { taskMap } = parseTasksFile({
      tasks: [
        { ...t, id: 'T-1', name: 'a' },
        { ...t, id: 'T-1', name: 'b' },
      ],
    });
    expect(taskMap.get('T-1')?.name).toBe('b');
  });
});

describe('loadTasks', () => {
  it('fetches ./tasks.json with a cache-busting timestamp', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse(standard));
    const loaded = await loadTasks(fetchFn, () => 1234);
    expect(fetchFn).toHaveBeenCalledWith('./tasks.json?1234');
    expect(loaded.tasks).toHaveLength(12);
  });

  it('rejects with the HTTP status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse('not found', 404));
    await expect(loadTasks(fetchFn)).rejects.toThrow('HTTP 404');
  });

  it('rejects on invalid JSON', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse('{ not json'));
    await expect(loadTasks(fetchFn)).rejects.toThrow(SyntaxError);
  });
});
