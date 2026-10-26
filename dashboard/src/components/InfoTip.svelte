<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  // An ⓘ next to a section's title that explains it (docs/progress-tab-review.md: what it shows, how it's counted,
  // when to be careful). A click opens a small popover; Escape, a click outside or the button again closes it.
  let { label, id, children }: { label: string; id?: string; children: Snippet } = $props();
  let open = $state(false);
  let root = $state<HTMLElement>();
</script>

<svelte:window
  onclick={(e) => open && !root?.contains(e.target as Node) && (open = false)}
  onkeydown={(e) => e.key === 'Escape' && (open = false)}
/>

<span class="infotip" bind:this={root}>
  <button
    class="infotip-button"
    {id}
    aria-label="About {label}"
    aria-expanded={open}
    title="About {label}"
    onclick={() => (open = !open)}><Icon name="info" size={14} /></button
  >
  {#if open}
    <span class="infotip-popover" role="dialog" aria-label="About {label}">{@render children()}</span>
  {/if}
</span>
