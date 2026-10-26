// A small Markdown subset, parsed into a tree that Svelte renders: never into HTML strings, so text from a file can't
// inject markup (no {@html}). Used at build time for Help (docs/help.md) and usable in the browser too. No library:
// the dashboard stays one self-contained file.
//
// Blocks: # to #### headings, paragraphs, - / * / 1. lists (one level; indented lines continue an item), ``` fenced
// code, and > quotes. Inline: `code`, **strong**, *em* / _em_, [links](https://…). Anything else is plain text.

export type Inline =
  | { t: 'text'; text: string }
  | { t: 'code'; text: string }
  | { t: 'strong'; children: Inline[] }
  | { t: 'em'; children: Inline[] }
  | { t: 'link'; href: string; children: Inline[] };

export type Block =
  | { t: 'heading'; level: number; id: string; children: Inline[] }
  | { t: 'paragraph'; children: Inline[] }
  | { t: 'list'; ordered: boolean; items: Inline[][] }
  | { t: 'quote'; children: Inline[] }
  | { t: 'code'; text: string };

/** Links that are safe to follow: web and mail addresses, and anchors in the page. */
export function safeHref(href: string): boolean {
  return /^(https?:|mailto:|#)/i.test(href.trim());
}

/** "Filters and saved views" → "filters-and-saved-views", for heading anchors */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function plainText(inlines: Inline[]): string {
  return inlines.map((i) => (i.t === 'text' || i.t === 'code' ? i.text : plainText(i.children))).join('');
}

/** The text of a Markdown string without its markup, one line per block: for tooltips, which can't show markup. */
export function markdownPlainText(src: string): string {
  return parseMarkdown(src)
    .map((b) => (b.t === 'code' ? b.text : b.t === 'list' ? b.items.map(plainText).join('\n') : plainText(b.children)))
    .join('\n');
}

/** Inline markup of one line or paragraph. Unclosed markers are left as text. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ t: 'text', text });
    text = '';
  };
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    if (rest[0] === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push({ t: 'code', text: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    } else if (rest.startsWith('**')) {
      const end = src.indexOf('**', i + 2);
      if (end > i + 2) {
        flush();
        out.push({ t: 'strong', children: parseInline(src.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    } else if ((rest[0] === '*' || rest[0] === '_') && rest[1] && rest[1] !== ' ') {
      // _em_ only at a word boundary, so snake_case names stay intact
      const marker = rest[0];
      const end = src.indexOf(marker, i + 1);
      const boundary = marker === '*' || !/\w/.test(src[i - 1] ?? '');
      const closes = end > i + 1 && (marker === '*' || !/\w/.test(src[end + 1] ?? ''));
      if (boundary && closes) {
        flush();
        out.push({ t: 'em', children: parseInline(src.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    } else if (rest[0] === '[') {
      const m = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
      if (m) {
        flush();
        const children = parseInline(m[1]);
        out.push(safeHref(m[2]) ? { t: 'link', href: m[2], children } : { t: 'text', text: plainText(children) });
        i += m[0].length;
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return out;
}

const LIST_ITEM = /^(\s*)([-*]|\d+\.)\s+(.*)$/;

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i += 1;
      continue;
    }
    if (line.startsWith('```')) {
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) body.push(lines[i++]);
      blocks.push({ t: 'code', text: body.join('\n') });
      i += 1; // the closing fence
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const children = parseInline(heading[2].trim());
      blocks.push({ t: 'heading', level: heading[1].length, id: slug(plainText(children)), children });
      i += 1;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = LIST_ITEM.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered && m[1].length === 0) items.push(m[3]);
        else if (m && m[1].length === 0)
          break; // a different kind of list starts
        else items[items.length - 1] += ' ' + lines[i].trim();
        i += 1;
      }
      blocks.push({ t: 'list', ordered, items: items.map(parseInline) });
      continue;
    }
    const isQuote = line.startsWith('>');
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      lines[i].startsWith('>') === isQuote &&
      !/^(#{1,4}\s|```)/.test(lines[i]) &&
      !(LIST_ITEM.test(lines[i]) && !isQuote)
    ) {
      para.push(isQuote ? lines[i].replace(/^>\s?/, '') : lines[i].trim());
      i += 1;
    }
    const children = parseInline(para.join(' '));
    blocks.push(isQuote ? { t: 'quote', children } : { t: 'paragraph', children });
  }
  return blocks;
}
