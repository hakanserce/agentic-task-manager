<script lang="ts">
  let {
    k,
    onzoom,
    onfit,
    onreset,
  }: { k: number; onzoom: (factor: number) => void; onfit: () => void; onreset: () => void } = $props();
</script>

<div class="graph-hint">Drag to pan &middot; Ctrl/&#8984; + scroll to zoom</div>
<div class="graph-controls">
  <button title="Zoom out (-)" onclick={() => onzoom(1 / 1.25)}>&minus;</button>
  <span class="graph-zoom-level" id="graph-zoom-level">{Math.round(k * 100)}%</span>
  <button title="Zoom in (+)" onclick={() => onzoom(1.25)}>+</button>
  <button title="Fit everything (F)" onclick={onfit}>&#x2922;</button>
  <button title="Actual size (0)" style="font-size:12px" onclick={onreset}>1:1</button>
</div>
