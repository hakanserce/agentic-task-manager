<script lang="ts">
  import { dashboard } from '../lib/state.svelte';

  let {
    k,
    onzoom,
    onfit,
    onreset,
    narrowed = false,
  }: {
    k: number;
    onzoom: (factor: number) => void;
    onfit: () => void;
    onreset: () => void;
    /** The search or filters leave some tasks out: offer hiding vs greying them out */
    narrowed?: boolean;
  } = $props();
</script>

<div class="graph-hint">Drag to pan &middot; Ctrl/&#8984; + scroll to zoom</div>
<div class="graph-controls">
  {#if narrowed}
    <span class="graph-filtered" role="group" aria-label="Tasks outside the filters" id="graph-filtered">
      <span class="graph-filtered-label">Filtered out:</span>
      {#each [['hide', 'Hide'], ['dim', 'Dim']] as [mode, label] (mode)}
        <button
          class:active={dashboard.graphFiltered === mode}
          aria-pressed={dashboard.graphFiltered === mode}
          data-mode={mode}
          onclick={() => (dashboard.graphFiltered = mode as 'hide' | 'dim')}>{label}</button
        >
      {/each}
    </span>
  {/if}
  <span class="graph-filtered">
    <button
      id="graph-dim-done"
      class:active={dashboard.graphDimDone}
      aria-pressed={dashboard.graphDimDone}
      title="Grey out done tasks, whatever the filters"
      onclick={() => (dashboard.graphDimDone = !dashboard.graphDimDone)}>Dim done</button
    >
  </span>
  <button title="Zoom out (-)" onclick={() => onzoom(1 / 1.25)}>&minus;</button>
  <span class="graph-zoom-level" id="graph-zoom-level">{Math.round(k * 100)}%</span>
  <button title="Zoom in (+)" onclick={() => onzoom(1.25)}>+</button>
  <button title="Fit everything (F)" onclick={onfit}>&#x2922;</button>
  <button title="Actual size (0)" style="font-size:12px" onclick={onreset}>1:1</button>
</div>
