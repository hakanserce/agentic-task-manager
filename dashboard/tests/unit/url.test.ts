import { describe, expect, it } from 'vitest';
import { safeUrl } from '../../src/lib/url';

describe('safeUrl (T-225, docs/security-review.md F9)', () => {
  it('passes absolute http(s) addresses', () => {
    expect(safeUrl('https://github.com/acme/demo/pull/5')).toBe('https://github.com/acme/demo/pull/5');
    expect(safeUrl('  http://example.com/x  ')).toBe('http://example.com/x');
    expect(safeUrl('HTTPS://EXAMPLE.COM')).toBe('HTTPS://EXAMPLE.COM');
  });

  it('refuses anything else: script and data URLs, relative paths, other schemes, non-strings', () => {
    for (const bad of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:x',
      '//evil.example/x',
      '/p/abcd/tasks.json',
      'mailto:a@b.c',
      'https:/missing-slash',
      'http://',
      '',
      undefined,
      42,
      { href: 'https://x' },
    ])
      expect(safeUrl(bad), String(bad)).toBeNull();
  });
});
