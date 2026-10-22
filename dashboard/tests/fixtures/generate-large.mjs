// Deterministically generates large-90.json: a wide graph (90 tasks, ~40 done, 1 in progress).
// Run: node tests/fixtures/generate-large.mjs
import { writeFileSync } from 'node:fs';

const TYPES = ['feature', 'test', 'infra', 'docs', 'refactor', 'bugfix', 'polish'];
const id = (n) => 'T-' + String(n).padStart(3, '0');

const tasks = [];
for (let i = 1; i <= 90; i++) {
  const deps = new Set();
  if (i > 1) deps.add(id(Math.max(1, i - 1 - (i % 4))));
  if (i > 6 && i % 3 === 0) deps.add(id(i - 5));
  const status = i <= 40 ? 'done' : i === 41 ? 'in_progress' : 'todo';
  const day = String(1 + Math.floor(i / 8)).padStart(2, '0');
  tasks.push({
    id: id(i),
    name: `Task number ${i} with a reasonably long name`,
    phase: Math.floor(i / 15),
    type: TYPES[i % TYPES.length],
    description: `Generated task ${i}.`,
    requirements: [],
    use_cases: [],
    status,
    dependencies: [...deps],
    files: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: status === 'todo' ? '2026-04-01T00:00:00Z' : `2026-04-${day}T${String(i % 24).padStart(2, '0')}:00:00Z`,
  });
}

writeFileSync(
  new URL('./large-90.json', import.meta.url),
  JSON.stringify({ meta: { project: 'Large Project' }, tasks }, null, 2) + '\n',
);
