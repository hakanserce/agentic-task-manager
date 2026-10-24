// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readPluginInfo } from '../../build/plugin-info.ts';
import { copyright } from '../../src/lib/plugin-info.ts';

const pluginJson = JSON.stringify({
  name: 'atm',
  description: 'Tasks for agents.',
  version: '1.2.0',
  author: { name: 'Ada Lovelace', email: 'ada@example.com' },
  license: 'MIT',
  repository: 'https://github.com/example/atm',
});
const changelog =
  '# Changelog\n\n## [Unreleased]\n\n## [1.2.0] - 2027-01-05\n### Added\n- x\n\n## [1.1.0] - 2026-12-01\n';

describe('readPluginInfo', () => {
  it('takes the name, author, licence and links from plugin.json', () => {
    expect(readPluginInfo(pluginJson, changelog)).toEqual({
      name: 'atm',
      description: 'Tasks for agents.',
      version: '1.2.0',
      author: 'Ada Lovelace',
      license: 'MIT',
      repository: 'https://github.com/example/atm',
      year: '2027',
    });
  });

  it('takes the year from the newest dated release, skipping Unreleased', () => {
    expect(readPluginInfo(pluginJson, changelog).year).toBe('2027');
  });

  it('throws without a dated release', () => {
    expect(() => readPluginInfo(pluginJson, '## [Unreleased]\n')).toThrow(/No dated release/);
  });

  it('reads the real plugin.json and changelog', () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
    const info = readPluginInfo(
      read('../../../plugin/.claude-plugin/plugin.json'),
      read('../../../plugin/CHANGELOG.md'),
    );
    expect(info.repository).toBe('https://github.com/hakanserce/agentic-task-manager');
    expect(info.year).toMatch(/^\d{4}$/);
  });
});

describe('copyright', () => {
  it('reads "© year author · licence License"', () => {
    expect(copyright(readPluginInfo(pluginJson, changelog))).toBe('© 2027 Ada Lovelace · MIT License');
  });
});
