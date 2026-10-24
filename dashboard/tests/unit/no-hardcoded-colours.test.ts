// @vitest-environment node
// FR-2.1: every colour is a CSS token, so light/dark modes and themes can change it. Colour literals may only appear
// where a token is defined (a `--name: value;` line in a .css file); components and code use var(--name) or a
// color-mix() of tokens.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const src = path.resolve(import.meta.dirname, '../../src');
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)],
  );
// Hex colours (not HTML entities like &#9660;), rgb()/rgba()/hsl() literals and named black/white
const COLOUR = /(?<![&\w])#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|:\s*(?:black|white)\b/;
const definesToken = (line: string) => /^\s*--[\w-]+\s*:/.test(line);
const allowed = (file: string) => /[\\/]themes[\\/]/.test(file); // theme files are token data

describe('no hard-coded colours', () => {
  for (const file of files(src).filter((f) => /\.(ts|svelte|css)$/.test(f) && !allowed(f))) {
    it(path.relative(src, file), () => {
      const offending = readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => COLOUR.test(line) && !(file.endsWith('.css') && definesToken(line)));
      expect(offending.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
    });
  }
});
