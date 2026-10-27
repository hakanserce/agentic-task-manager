import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The logo on GitHub (README, social preview, T-272) is the dashboard's, drawn in the accent blue: the same shapes
// The path as an argument, never a literal or template string inside `new URL(…, import.meta.url)`: Vite would turn
// that into an asset import. Paths are relative to the repository root.
const file = (path: string) => new URL(path, import.meta.url);
const read = (path: string) => readFileSync(file('../../../' + path), 'utf8');
const shapes = (svg: string) => svg.match(/<(rect|path)\b[^>]*>/g) ?? [];

describe("the README's logo", () => {
  it('has the same shapes as the dashboard logo, in the accent blue', () => {
    const github = read('.github/assets/atm-logo.svg');
    const dashboard = read('dashboard/src/assets/atm-logo.svg');
    expect(shapes(github).length).toBeGreaterThan(0);
    expect(shapes(github)).toEqual(shapes(dashboard));
    expect(github).toContain('stroke="#2f81f7"');
  });

  it('heads the README, and the social preview card uses it', () => {
    expect(read('README.md')).toContain('src=".github/assets/atm-logo.svg"');
    expect(read('.github/assets/social-preview.html')).toContain('src="atm-logo.svg"');
    expect(existsSync(file('../../../.github/assets/social-preview.png'))).toBe(true);
    // The PNG version (GitHub's avatars take only PNG, JPG or GIF) is made from the same SVG
    expect(read('.github/assets/atm-logo-png.html')).toContain('src="atm-logo.svg"');
    expect(existsSync(file('../../../.github/assets/atm-logo.png'))).toBe(true);
  });
});
