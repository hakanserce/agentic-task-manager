<script lang="ts">
  import { burndown } from '../lib/burndown';
  import { forecastPhases } from '../lib/forecast';
  import { dashboard } from '../lib/state.svelte';
  import BurndownChart from './BurndownChart.svelte';
  import PhaseTable from './PhaseTable.svelte';
  import UtilizationPanel from './UtilizationPanel.svelte';

  // Recomputed whenever tasks or filters change (auto-refresh reloads keep it current)
  const now = $derived.by(() => (dashboard.tasks, dashboard.filtered, Date.now()));
  const forecast = $derived(forecastPhases(dashboard.filtered, now, dashboard.tasks));
  // Clicking a phase row focuses the burndown on that phase (FR-4.6); a filter that hides it resets the focus
  // The focused phase is part of the project's saved view (dashboard state)
  const selected = $derived(dashboard.progressPhase);
  const focus = $derived(selected !== null && forecast.phases.some((p) => p.phase === selected) ? selected : undefined);
  const chart = $derived(burndown(dashboard.filtered, forecast, now, focus));

  const toggle = (phase: number) => (dashboard.progressPhase = focus === phase ? null : phase);
</script>

<div class="progress-view" id="progress">
  {#if dashboard.filtered.length === 0}
    <div class="progress-empty">No tasks match current filters</div>
  {:else}
    <div class="burndown-scope-row">
      <span class="burndown-focus" id="burndown-focus">{focus === undefined ? 'All phases' : `Phase ${focus}`}</span>
      {#if focus !== undefined}
        <button class="burndown-all" onclick={() => (dashboard.progressPhase = null)}>Show all phases</button>
      {/if}
    </div>
    <BurndownChart data={chart} {now} />
    <PhaseTable {forecast} {now} selected={focus} onselect={toggle} />
    <UtilizationPanel {now} />
  {/if}
</div>
