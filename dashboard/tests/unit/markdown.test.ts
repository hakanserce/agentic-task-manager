// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markdownPlainText, parseInline, parseMarkdown, plainText, safeHref, slug } from '../../src/lib/markdown';

describe('parseInline', () => {
  it('reads code, strong, em and links; the rest is text', () => {
    expect(parseInline('Run `atm next`, **now** and *then* or _later_: [docs](https://x.dev/a)')).toEqual([
      { t: 'text', text: 'Run ' },
      { t: 'code', text: 'atm next' },
      { t: 'text', text: ', ' },
      { t: 'strong', children: [{ t: 'text', text: 'now' }] },
      { t: 'text', text: ' and ' },
      { t: 'em', children: [{ t: 'text', text: 'then' }] },
      { t: 'text', text: ' or ' },
      { t: 'em', children: [{ t: 'text', text: 'later' }] },
      { t: 'text', text: ': ' },
      { t: 'link', href: 'https://x.dev/a', children: [{ t: 'text', text: 'docs' }] },
    ]);
  });

  it('nests, keeps snake_case and unclosed markers as text', () => {
    expect(parseInline('**see `x`**')).toEqual([
      {
        t: 'strong',
        children: [
          { t: 'text', text: 'see ' },
          { t: 'code', text: 'x' },
        ],
      },
    ]);
    expect(parseInline('review_requested_at and in_review')).toEqual([
      { t: 'text', text: 'review_requested_at and in_review' },
    ]);
    expect(parseInline('a * b, `open, **half')).toEqual([{ t: 'text', text: 'a * b, `open, **half' }]);
  });

  it('turns links it would not follow into text, and never treats HTML as markup', () => {
    expect(parseInline('[click](javascript:void)')).toEqual([{ t: 'text', text: 'click' }]);
    expect(parseInline('[x](javascript:alert(1))').some((i) => i.t === 'link')).toBe(false);
    expect(parseInline('<b>bold</b> <img src=x onerror=alert(1)>')).toEqual([
      { t: 'text', text: '<b>bold</b> <img src=x onerror=alert(1)>' },
    ]);
    expect([safeHref('https://a'), safeHref('mailto:a@b'), safeHref('#x'), safeHref('data:text/html,x')]).toEqual([
      true,
      true,
      true,
      false,
    ]);
  });
});

describe('parseMarkdown', () => {
  it('reads headings with anchors, paragraphs, lists, quotes and code', () => {
    const blocks = parseMarkdown(
      [
        '# Help',
        '',
        'First line',
        'second line.',
        '',
        '- one',
        '  continued',
        '- two',
        '1. first',
        '2. second',
        '',
        '> a quote',
        '',
        '```',
        'atm next',
        '  --claim',
        '```',
        '## Filters and saved views',
      ].join('\n'),
    );
    expect(blocks).toEqual([
      { t: 'heading', level: 1, id: 'help', children: [{ t: 'text', text: 'Help' }] },
      { t: 'paragraph', children: [{ t: 'text', text: 'First line second line.' }] },
      { t: 'list', ordered: false, items: [[{ t: 'text', text: 'one continued' }], [{ t: 'text', text: 'two' }]] },
      { t: 'list', ordered: true, items: [[{ t: 'text', text: 'first' }], [{ t: 'text', text: 'second' }]] },
      { t: 'quote', children: [{ t: 'text', text: 'a quote' }] },
      { t: 'code', text: 'atm next\n  --claim' },
      {
        t: 'heading',
        level: 2,
        id: 'filters-and-saved-views',
        children: [{ t: 'text', text: 'Filters and saved views' }],
      },
    ]);
  });

  it('handles Windows line endings and an unclosed code fence', () => {
    expect(parseMarkdown('a\r\nb')).toEqual([{ t: 'paragraph', children: [{ t: 'text', text: 'a b' }] }]);
    expect(parseMarkdown('```\nx')).toEqual([{ t: 'code', text: 'x' }]);
  });

  it('helpers: slugs and plain text', () => {
    expect(slug('Statuses and kinds!')).toBe('statuses-and-kinds');
    expect(plainText(parseInline('**a** `b` [c](#d)'))).toBe('a b c');
  });

  it('markdownPlainText: the text without markup, a line per block, for tooltips (T-219)', () => {
    expect(markdownPlainText('Use `atm show` for **all** of it')).toBe('Use atm show for all of it');
    expect(markdownPlainText('## Why\nIt *helps*.\n\n- one\n- two\n\n```\nx = 1\n```')).toBe(
      'Why\nIt helps.\none\ntwo\nx = 1',
    );
    expect(markdownPlainText('')).toBe('');
  });
});

describe('docs/help.md', () => {
  const blocks = parseMarkdown(readFileSync(new URL('../../../docs/help.md', import.meta.url), 'utf8'));
  const ids = blocks.flatMap((b) => (b.t === 'heading' ? [b.id] : []));

  it('covers the topics D-1.3 asks for', () => {
    for (const id of [
      'views',
      'filters-and-saved-views',
      'statuses-and-kinds',
      'waiting-on-you',
      'priorities-and-labels',
      'the-task-details',
      'workflows-and-stages',
      'the-archive',
      'the-skills',
      'running-agents-in-parallel',
    ])
      expect(ids).toContain(id);
  });

  it("links within the page only to headings that exist, and off the page only to the project's repository", () => {
    const links: string[] = [];
    const walk = (inlines: ReturnType<typeof parseInline>) => {
      for (const i of inlines) {
        if (i.t === 'link') links.push(i.href);
        if (i.t === 'strong' || i.t === 'em' || i.t === 'link') walk(i.children);
      }
    };
    for (const b of blocks) {
      if (b.t === 'list') b.items.forEach(walk);
      else if (b.t !== 'code') walk(b.children);
    }
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      if (href.startsWith('#')) expect(ids).toContain(href.slice(1));
      else expect(href).toMatch(/^https:\/\/github\.com\/hakanserce\/agentic-task-manager/);
    }
  });
});
