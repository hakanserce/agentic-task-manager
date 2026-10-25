// atm-cli/build.py: plugin/scripts/atm.py is built from the modules in atm-cli/atm/. The build must be
// deterministic, the committed file must match it, and it must refuse module layouts that concatenation would break.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, test } from 'node:test';
import { REPO, removeDir, tempDir } from './helpers.mjs';

const BUILD = path.join(REPO, 'atm-cli/build.py');

function runBuild(args, build = BUILD) {
  const result = spawnSync('python3', [build, ...args], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { code: result.status, stderr: result.stderr };
}

/** A copy of atm-cli/ in a temporary directory, so a test can break a module without touching the repo. */
function copyOfSources() {
  const dir = tempDir('atm-build-');
  fs.cpSync(path.join(REPO, 'atm-cli'), path.join(dir, 'atm-cli'), { recursive: true });
  return dir;
}

describe('build', () => {
  test('the build is deterministic', () => {
    const dir = tempDir('atm-build-');
    try {
      const [a, b] = [path.join(dir, 'a.py'), path.join(dir, 'b.py')];
      assert.equal(runBuild(['--output', a]).code, 0);
      assert.equal(runBuild(['--output', b]).code, 0);
      assert.equal(fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8'));
    } finally {
      removeDir(dir);
    }
  });

  test('the committed plugin/scripts/atm.py is what the modules build', () => {
    const { code, stderr } = runBuild(['--check']);
    assert.equal(code, 0, stderr);
  });

  test('a name defined in two modules is refused', () => {
    const dir = copyOfSources();
    try {
      fs.appendFileSync(path.join(dir, 'atm-cli/atm/paths.py'), '\n\ndef out(text=""):\n    pass\n');
      const { code, stderr } = runBuild(['--output', path.join(dir, 'atm.py')], path.join(dir, 'atm-cli/build.py'));
      assert.equal(code, 1);
      assert.match(stderr, /out is defined in both core\.py and paths\.py/);
    } finally {
      removeDir(dir);
    }
  });

  test('importing from a later module, or a name a module does not define, is refused', () => {
    const dir = copyOfSources();
    try {
      const core = path.join(dir, 'atm-cli/atm/core.py');
      const original = fs.readFileSync(core, 'utf8');
      const output = path.join(dir, 'atm.py');
      const build = path.join(dir, 'atm-cli/build.py');

      fs.writeFileSync(core, original + '\nfrom .paths import find_paths\n');
      assert.match(runBuild(['--output', output], build).stderr, /core\.py imports from paths/);

      fs.writeFileSync(core, original);
      fs.appendFileSync(path.join(dir, 'atm-cli/atm/paths.py'), '\nfrom .core import no_such_name\n');
      assert.match(runBuild(['--output', output], build).stderr, /imports no_such_name from core/);
    } finally {
      removeDir(dir);
    }
  });
});
