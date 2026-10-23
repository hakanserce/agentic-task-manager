// @vitest-environment node
// The dashboard's "Next up" marker and the loop (`atm next`, plugin/scripts/atm.py) must agree on the next task.
// Checked against every fixture; needs python3, like the plugin itself.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextUp } from '../../src/lib/kanban';
import type { TasksFile } from '../../src/lib/types';

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

describe('next task: dashboard and atm agree', () => {
  for (const file of fs.readdirSync(fixtures).filter((f) => f.endsWith('.json'))) {
    it(file, () => {
      const data = JSON.parse(fs.readFileSync(path.join(fixtures, file), 'utf8')) as TasksFile;
      if (!Array.isArray(data.tasks)) return;
      expect(atmNext(data)).toBe(nextUp(data.tasks)?.id ?? null);
    });
  }
});
