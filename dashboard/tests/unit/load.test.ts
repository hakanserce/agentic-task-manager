import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROJECT_NAME, loadArchive, loadTasks, parseTasksFile } from '../../src/lib/load';
import archive from '../fixtures/archive.json';
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
  it('fetches ./tasks.json past the browser cache, and keeps its validators', async () => {
    const response = new Response(JSON.stringify(standard), {
      headers: { ETag: '"abc"', 'Last-Modified': 'Sat, 24 Oct 2026 10:00:00 GMT' },
    });
    const fetchFn = vi.fn().mockResolvedValue(response);
    const result = await loadTasks(fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('./tasks.json', { cache: 'no-store', headers: {} });
    expect(result.unchanged).toBe(false);
    if (result.unchanged) return;
    expect(result.loaded.tasks).toHaveLength(12);
    expect(result.validators).toEqual({ etag: '"abc"', lastModified: 'Sat, 24 Oct 2026 10:00:00 GMT' });
  });

  it('asks whether it changed; a 304 means unchanged, without parsing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    const since = { etag: '"abc"', lastModified: 'Sat, 24 Oct 2026 10:00:00 GMT' };
    expect(await loadTasks(fetchFn, since)).toEqual({ unchanged: true });
    expect(fetchFn).toHaveBeenCalledWith('./tasks.json', {
      cache: 'no-store',
      headers: { 'If-None-Match': '"abc"', 'If-Modified-Since': 'Sat, 24 Oct 2026 10:00:00 GMT' },
    });
  });

  it('measures the file, for the archive notice', async () => {
    const body = JSON.stringify(standard);
    const result = await loadTasks(vi.fn().mockResolvedValue(new Response(body)));
    expect(!result.unchanged && result.loaded.bytes).toBe(body.length);
  });

  it('a 304 without having asked is an error', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    await expect(loadTasks(fetchFn)).rejects.toThrow('HTTP 304');
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

describe('loadArchive', () => {
  it("fetches ./tasks-archive.json's tasks, conditionally once it has validators", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(archive), { headers: { ETag: '"a1"' } }));
    const result = await loadArchive(fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('./tasks-archive.json', { cache: 'no-store', headers: {} });
    expect(!result.unchanged && result.tasks.map((t) => t.id)).toEqual(['T-090', 'T-091', 'T-092']);
    expect(!result.unchanged && result.validators).toEqual({ etag: '"a1"' });
    const again = vi.fn().mockResolvedValue(new Response(null, { status: 304 }));
    expect(await loadArchive(again, { etag: '"a1"' })).toEqual({ unchanged: true });
  });

  it('a missing archive (404) is an empty one; a malformed one has no tasks; a server error rejects', async () => {
    const missing = await loadArchive(vi.fn().mockResolvedValue(jsonResponse('not found', 404)));
    expect(missing).toEqual({ unchanged: false, tasks: [], validators: {} });
    const odd = await loadArchive(vi.fn().mockResolvedValue(jsonResponse({ tasks: 'x' })));
    expect(!odd.unchanged && odd.tasks).toEqual([]);
    await expect(loadArchive(vi.fn().mockResolvedValue(jsonResponse('boom', 500)))).rejects.toThrow('HTTP 500');
  });
});
