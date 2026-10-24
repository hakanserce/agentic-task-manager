<script lang="ts">
  // A ring meter: one share of a whole (done / total), the arc in the entity's colour on a neutral track.
  let {
    ratio,
    color,
    size = 56,
    stroke = 6,
    label = '',
  }: { ratio: number; color: string; size?: number; stroke?: number; label?: string } = $props();
  const r = $derived((size - stroke) / 2);
  const circumference = $derived(2 * Math.PI * r);
  const pct = $derived(Math.round(ratio * 100));
</script>

<svg class="ring" width={size} height={size} viewBox="0 0 {size} {size}" role="img" aria-label="{label} {pct}% done">
  <circle cx={size / 2} cy={size / 2} {r} fill="none" stroke="var(--surface2)" stroke-width={stroke} />
  {#if ratio > 0}
    <circle
      class="ring-arc"
      cx={size / 2}
      cy={size / 2}
      {r}
      fill="none"
      stroke={color}
      stroke-width={stroke}
      stroke-linecap="round"
      stroke-dasharray="{Math.max(0.001, ratio * circumference)} {circumference}"
      transform="rotate(-90 {size / 2} {size / 2})"
    />
  {/if}
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" class="ring-value" font-size={size * 0.24}
    >{pct}%</text
  >
</svg>
