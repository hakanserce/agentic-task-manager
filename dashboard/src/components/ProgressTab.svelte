<script lang="ts">
  import { burndown } from '../lib/burndown';
  import { forecastPhases } from '../lib/forecast';
  import { dashboard } from '../lib/state.svelte';
  import BurndownChart from './BurndownChart.svelte';
  import PhaseTable from './PhaseTable.svelte';

  // Recomputed whenever tasks or filters change (auto-refresh reloads keep it current)
  const now = $derived.by(() => (dashboard.tasks, dashboard.filtered, Date.now()));
  const forecast = $derived(forecastPhases(dashboard.filtered, now, dashboard.tasks));
  const chart = $derived(burndown(dashboard.filtered, forecast, now));
</script>

<div class="progress-view" id="progress">
  {#if dashboard.filtered.length === 0}
    <div class="progress-empty">No tasks match current filters</div>
  {:else}
    <BurndownChart data={chart} {now} />
    <PhaseTable {forecast} {now} />
  {/if}
</div>
