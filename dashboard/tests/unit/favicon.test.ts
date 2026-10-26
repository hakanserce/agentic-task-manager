import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAVICON_COLOR, faviconHref, setFavicon } from '../../build/favicon';

const logo = readFileSync(path.resolve(import.meta.dirname, '../../src/assets/atm-logo.svg'), 'utf8');

describe('favicon', () => {
  it('is the logo as a data: URL, in a fixed colour and without comments', () => {
    const href = faviconHref(logo);
    expect(href.startsWith('data:image/svg+xml,')).toBe(true);
    const svg = decodeURIComponent(href.slice('data:image/svg+xml,'.length));
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 32 32"/);
    expect(svg).toContain(`stroke="${FAVICON_COLOR}"`);
    expect(svg).not.toContain('currentColor');
    expect(svg).not.toContain('<!--');
    expect(href).not.toContain('"');
  });

  it('goes into the head as an icon link', () => {
    const html = setFavicon('<html><head><title>x</title></head><body></body></html>', 'data:image/svg+xml,abc');
    expect(html).toContain('<link rel="icon" type="image/svg+xml" href="data:image/svg+xml,abc" />\n  </head>');
    expect(() => setFavicon('<html></html>', 'x')).toThrow('no </head>');
  });
});
