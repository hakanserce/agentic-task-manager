<script lang="ts">
  import type { Block, Inline } from '../lib/markdown';

  // Renders parsed Markdown (lib/markdown.ts). Every piece of text goes through Svelte, so it is escaped.
  // Heading IDs get `idPrefix`, so they can't collide with the dashboard's own IDs or the flags in the URL hash
  // ("#help" would otherwise make the browser jump to a heading called Help).
  let { blocks, idPrefix }: { blocks: Block[]; idPrefix: string } = $props();

  // The URL hash holds the dashboard's state (tab, open dialog), so links within the page scroll instead
  function scrollTo(e: MouseEvent, href: string) {
    e.preventDefault();
    document.getElementById(idPrefix + href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
</script>

<div class="markdown">
  {#each blocks as block, i (i)}
    {#if block.t === 'heading'}
      <svelte:element this={`h${Math.min(block.level + 2, 6)}`} id={idPrefix + block.id}
        >{@render inlines(block.children)}</svelte:element
      >
    {:else if block.t === 'paragraph'}
      <p>{@render inlines(block.children)}</p>
    {:else if block.t === 'quote'}
      <blockquote>{@render inlines(block.children)}</blockquote>
    {:else if block.t === 'code'}
      <pre><code>{block.text}</code></pre>
    {:else if block.ordered}
      <ol>
        {#each block.items as item, j (j)}<li>{@render inlines(item)}</li>{/each}
      </ol>
    {:else}
      <ul>
        {#each block.items as item, j (j)}<li>{@render inlines(item)}</li>{/each}
      </ul>
    {/if}
  {/each}
</div>

{#snippet inlines(items: Inline[])}
  {#each items as item, k (k)}{#if item.t === 'text'}{item.text}{:else if item.t === 'code'}<code>{item.text}</code
      >{:else if item.t === 'strong'}<strong>{@render inlines(item.children)}</strong>{:else if item.t === 'em'}<em
        >{@render inlines(item.children)}</em
      >{:else if item.href.startsWith('#')}<a href={item.href} onclick={(e) => scrollTo(e, item.href)}
        >{@render inlines(item.children)}</a
      >{:else}<a href={item.href} target="_blank" rel="noopener noreferrer">{@render inlines(item.children)}</a
      >{/if}{/each}
{/snippet}
