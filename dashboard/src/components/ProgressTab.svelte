<script lang="ts">
  import { burndown } from '../lib/burndown';
  import { FILTER_GROUPS } from '../lib/filters';
  import { activePhases, forecastPhases, withWholePhaseEstimates } from '../lib/forecast';
  import { dashboard } from '../lib/state.svelte';
  import BurndownChart from './BurndownChart.svelte';
  import PhaseTable from './PhaseTable.svelte';
  import UtilizationPanel from './UtilizationPanel.svelte';

  // Progress is history: archived tasks count too, so the tab loads the archive once shown (D-5.2). It stays mounted
  // while hidden, so only when it is the selected tab.
  $effect(() => {
    if (dashboard.tab === 'progress' && dashboard.archivedCount > 0) dashboard.wantArchive();
  });
  const tasks = $derived(dashboard.historyFiltered);

  // Recomputed whenever tasks or filters change (auto-refresh reloads keep it current)
  const now = $derived.by(() => (dashboard.history, tasks, Date.now()));
  // The search and filters pick a slice of the tasks (the status and stage filters don't apply here: T-239). The slice
  // gets its own counts and lines, but when a phase finishes is the whole phase's: the loop works through all of it.
  const filtered = $derived(
    dashboard.query.trim() !== '' ||
      FILTER_GROUPS.some((g) => g !== 'status' && g !== 'stage' && dashboard.filters[g].size > 0),
  );
  const ignored = $derived((['status', 'stage'] as const).filter((g) => dashboard.filters[g].size > 0));
  const applied = $derived(
    [
      ...FILTER_GROUPS.filter((g) => g !== 'status' && g !== 'stage' && dashboard.filters[g].size > 0).map(
        (g) => `${g === 'agent' ? 'started by' : g} ${[...dashboard.filters[g]].join(', ')}`,
      ),
      ...(dashboard.query.trim() ? [`“${dashboard.query.trim()}”`] : []),
    ].join(' · '),
  );
  const whole = $derived(forecastPhases(dashboard.history, now, dashboard.history, dashboard.vocab));
  const forecast = $derived(
    filtered ? withWholePhaseEstimates(forecastPhases(tasks, now, dashboard.history, dashboard.vocab), whole) : whole,
  );
  // Clicking a phase row focuses the burndown on that phase (FR-4.6); a filter that hides it resets the focus
  // The focused phase is part of the project's saved view (dashboard state)
  const selected = $derived(dashboard.progressPhase);
  const focus = $derived(selected !== null && forecast.phases.some((p) => p.phase === selected) ? selected : undefined);
  const chart = $derived(burndown(tasks, forecast, now, focus, dashboard.vocab));

  const toggle = (phase: number) => (dashboard.progressPhase = focus === phase ? null : phase);

  // With many phases the table gets long: "Active phases only" keeps the unfinished phases and the one that finished
  // last (saved with the project's view). The burndown still covers every task.
  const active = $derived(dashboard.progressActive);
  const shownPhases = $derived(active.only ? { ...forecast, phases: activePhases(forecast.phases) } : forecast);
  const hidden = $derived(forecast.phases.length - shownPhases.phases.length);
</script>

<div class="progress-view" id="progress">
  {#if filtered || ignored.length}
    <div class="progress-filter-banner" id="progress-filter-banner" role="status">
      {#if filtered}
        <span
          >Showing <strong>{tasks.length}</strong> of {dashboard.history.length} tasks: {applied}. Counts, bars and the
          burndown are the matching tasks'; when a phase finishes is the whole phase's.</span
        >
      {/if}
      {#if ignored.length}
        <span id="progress-filter-ignored"
          >{ignored.map((g) => (g === 'status' ? 'Status' : 'Stage')).join(' and ')} filter not applied here: progress is
          the split by status.</span
        >
      {/if}
      <button class="link-button" id="progress-clear-filters" onclick={() => dashboard.clearFilters()}
        >Clear filters</button
      >
    </div>
  {/if}
  {#if tasks.length === 0}
    <div class="progress-empty">No tasks match current filters</div>
  {:else}
    <div class="burndown-scope-row">
      <span class="burndown-focus" id="burndown-focus"
        >{focus === undefined ? 'All phases' : `Phase ${focus}`}{filtered ? ' · matching tasks' : ''}</span
      >
      {#if focus !== undefined}
        <button class="burndown-all" onclick={() => (dashboard.progressPhase = null)}>Show all phases</button>
      {/if}
    </div>
    <BurndownChart data={chart} {now} />
    <div class="phase-filter" id="phase-filter">
      <label title="Unfinished phases, and the one that finished last">
        <input
          type="checkbox"
          id="active-phases-only"
          checked={active.only}
          onchange={(e) => (dashboard.progressActive = { only: e.currentTarget.checked })}
        />
        Active phases only
      </label>
      {#if active.only && hidden > 0}
        <span class="phase-filter-hidden" id="phases-hidden">{hidden} older phase{hidden === 1 ? '' : 's'} hidden</span>
      {/if}
    </div>
    <PhaseTable forecast={shownPhases} {now} selected={focus} onselect={toggle} />
    <UtilizationPanel {now} />
  {/if}
</div>
