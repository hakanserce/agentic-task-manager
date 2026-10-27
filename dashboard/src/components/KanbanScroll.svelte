<script lang="ts">
  import type { Snippet } from 'svelte';

  // A column's cards, scrolling on their own without a scrollbar (T-262): "▲ N more" and "▼ N more" at the edges say
  // how many cards are cut off above and below; the wheel and the trackpad scroll as usual, a hint scrolls a page.
  let { children }: { children: Snippet } = $props();
  let el = $state<HTMLElement>();
  let above = $state(0);
  let below = $state(0);

  // Cards at least partly out of view (offsetTop is relative to the scroller, which is positioned)
  function update() {
    if (!el) return;
    const top = el.scrollTop;
    const bottom = top + el.clientHeight;
    let a = 0;
    let b = 0;
    for (const card of el.querySelectorAll<HTMLElement>('.kanban-card')) {
      if (card.offsetTop < top - 1) a++;
      else if (card.offsetTop + card.offsetHeight > bottom + 1) b++;
    }
    above = a;
    below = b;
  }
  $effect(() => {
    if (!el) return;
    update();
    // A resized window or column, and cards coming and going, change what is cut off
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(el);
    const mutation = new MutationObserver(update);
    mutation.observe(el, { childList: true, subtree: true });
    return () => {
      resize?.disconnect();
      mutation.disconnect();
    };
  });
  const page = (direction: 1 | -1) => el?.scrollBy({ top: direction * el.clientHeight * 0.85, behavior: 'smooth' });
</script>

<div class="kanban-scroll">
  {#if above}
    <button class="kanban-more top" aria-label="Scroll up: {above} more" onclick={() => page(-1)}>▲ {above} more</button
    >
  {/if}
  <div class="kanban-cards" bind:this={el} onscroll={update}>
    {@render children()}
  </div>
  {#if below}
    <button class="kanban-more bottom" aria-label="Scroll down: {below} more" onclick={() => page(1)}
      >▼ {below} more</button
    >
  {/if}
</div>
