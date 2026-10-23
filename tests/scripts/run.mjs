// Runs every tests/scripts/*.test.mjs file with node:test, against each runtime (ATM_TEST_RUNTIMES=python,node).
// Usage: node tests/scripts/run.mjs   (works on Node 18+, unlike `node --test <dir>` whose argument rules changed)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort()) {
  await import(pathToFileURL(path.join(dir, file)).href);
}
