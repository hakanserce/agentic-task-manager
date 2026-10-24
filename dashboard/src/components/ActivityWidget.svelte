<script lang="ts">
  import { activitySeries } from '../lib/insights';
  import { dashboard } from '../lib/state.svelte';
  import ActivityDeepDive from './ActivityDeepDive.svelte';
  import Icon from './Icon.svelte';

  // Compact: completions per period (bars) with their rolling average (line, same scale). Click: the deep dive.
  const series = $derived(activitySeries(dashboard.tasks));
  let open = $state(false);
  let root = $state<HTMLElement>();

  const W = 120;
  const H = 18;
  const max = $derived(series ? Math.max(1, ...series.buckets.map((b) => b.completed.length)) : 1);
  const step = $derived(series ? W / series.buckets.length : W);
  const y = (v: number) => H - (v / max) * (H - 2);
  const avgPath = $derived(
    series
      ? series.buckets.map((b, i) => `${i ? 'L' : 'M'}${(i + 0.5) * step},${y(b.average).toFixed(1)}`).join(' ')
      : '',
  );
</script>

<svelte:window
  onclick={(e) => open && !root?.contains(e.target as Node) && (open = false)}
  onkeydown={(e) => e.key === 'Escape' && (open = false)}
/>

{#if series}
  <div class="widget" bind:this={root}>
    <button
      class="widget-card activity-card"
      id="activity-card"
      aria-expanded={open}
      title="Activity: {series.totalCompleted} tasks completed, per {series.unitLabel} · click for details"
      aria-label="Activity: {series.totalCompleted} tasks completed"
      onclick={() => (open = !open)}
    >
      <span class="widget-body">
        <svg class="sparkline" width={W} height={H} viewBox="0 0 {W} {H}" aria-hidden="true">
          {#each series.buckets as b, i (b.start)}
            {#if b.completed.length}
              <rect
                x={i * step + 1}
                y={y(b.completed.length)}
                width={Math.max(1, step - 2)}
                height={H - y(b.completed.length)}
                rx="1.5"
                fill="var(--series-remaining)"
              />
            {/if}
          {/each}
          <path d={avgPath} fill="none" stroke="var(--series-scope)" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
      </span>
      <Icon name="chevron-down" size={14} />
    </button>
    {#if open}
      <div class="insights-panel wide" id="activity-panel" role="dialog" aria-label="Activity details">
        <div class="panel-heading">Activity <span>per {series.unitLabel}</span></div>
        <ActivityDeepDive {series} />
      </div>
    {/if}
  </div>
{/if}
