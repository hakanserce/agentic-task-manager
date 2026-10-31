// @vitest-environment node
// The dashboard's "Next up" marker and the loop (`atm next`, plugin/scripts/atm.py) must agree on the next task.
// Checked against every fixture; needs python3, like the plugin itself.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextUp } from '../../src/lib/kanban';
import { sprintModel } from '../../src/lib/sprints';
import type { TasksFile } from '../../src/lib/types';
import { resolveVocabulary } from '../../src/lib/vocab';

const repo = path.resolve(import.meta.dirname, '../../..');
const fixtures = path.join(repo, 'dashboard/tests/fixtures');

function atmNext(data: TasksFile): string | null {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atm-parity-'));
  try {
    fs.mkdirSync(path.join(dir, '.agentic-task-manager'));
    fs.writeFileSync(path.join(dir, '.agentic-task-manager/tasks.json'), JSON.stringify(data));
    const r = spawnSync('python3', [path.join(repo, 'plugin/scripts/atm.py'), 'next', '--json'], {
      cwd: dir,
      encoding: 'utf8',
      env: { ...process.env, GIT_CEILING_DIRECTORIES: path.dirname(dir) },
    });
    if (r.status !== 0 && r.status !== 3) throw new Error(r.stderr);
    return JSON.parse(r.stdout).task?.id ?? null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Both pick the same task; returns its ID */
function agree(data: TasksFile): string | null {
  const id = atmNext(data);
  const vocab = resolveVocabulary(data.meta);
  expect(id).toBe(nextUp(data.tasks ?? [], vocab, sprintModel(data.meta, data.tasks ?? [], vocab))?.id ?? null);
  return id;
}

describe('next task: dashboard and atm agree', () => {
  for (const file of fs.readdirSync(fixtures).filter((f) => f.endsWith('.json'))) {
    it(file, () => {
      const data = JSON.parse(fs.readFileSync(path.join(fixtures, file), 'utf8')) as TasksFile;
      if (!Array.isArray(data.tasks)) return;
      agree(data);
    });
  }

  it('priorities and a custom vocabulary: phase, then priority, then ID', () => {
    const task = (id: string, phase: number, priority?: string, status = 'backlog') => ({
      id,
      name: id,
      phase,
      type: 'feature',
      description: '',
      status,
      dependencies: [],
      ...(priority ? { priority } : {}),
    });
    const meta = {
      statuses: [
        { id: 'backlog', kind: 'todo' },
        { id: 'doing', kind: 'active' },
        { id: 'shipped', kind: 'done' },
      ],
      priorities: [{ id: 'must' }, { id: 'should' }, { id: 'could' }],
    };
    const tasks = [task('T-1', 1, 'must'), task('T-9', 0, 'could'), task('T-5', 0), task('T-7', 0, 'must', 'doing')];
    // Phase 0 first; there "should" (the default, for T-5) beats "could"
    expect(agree({ meta, tasks })).toBe('T-5');
    expect(agree({ meta, tasks: [...tasks, task('T-8', 0, 'must')] })).toBe('T-8');
    // Unknown priorities rank as the default: then the ID decides
    expect(agree({ meta, tasks: tasks.map((t) => ({ ...t, priority: 'unknown' })) })).toBe('T-5');
  });

  it('with sprints: the active sprint only, even before a more urgent task in the backlog; none without one (SR-5.1)', () => {
    const task = (id: string, sprint?: string, priority?: string) => ({
      id,
      name: id,
      phase: 0,
      type: 'feature',
      description: '',
      status: 'todo',
      dependencies: [],
      ...(sprint ? { sprint } : {}),
      ...(priority ? { priority } : {}),
    });
    const tasks = [task('T-1', undefined, 'P0'), task('T-2', 'Later'), task('T-3', 'Now', 'P3'), task('T-4', 'Now')];
    const meta = {
      sprints: [
        { id: 'Now', state: 'active' },
        { id: 'Later', state: 'planned' },
      ],
    };
    expect(agree({ meta, tasks } as TasksFile)).toBe('T-4');
    const noneActive = { sprints: [{ id: 'Now' }, { id: 'Later' }] };
    expect(agree({ meta: noneActive, tasks } as TasksFile)).toBeNull();
  });
});
