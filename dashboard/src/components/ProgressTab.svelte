<script lang="ts">
  import { BURNDOWN_RANGES, burndown, rangeStart } from '../lib/burndown';
  import { FILTER_GROUPS } from '../lib/filters';
  import { forecastPhases, withWholePhaseEstimates } from '../lib/forecast';
  import { dashboard } from '../lib/state.svelte';
  import { timeUse } from '../lib/timeuse';
  import BurndownChart from './BurndownChart.svelte';
  import InfoTip from './InfoTip.svelte';
  import PhaseTable from './PhaseTable.svelte';
  import TimeSplitBar from './TimeSplitBar.svelte';

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
  // The time range (saved with the view): since the focused or first unfinished phase started, by default (T-240)
  const range = $derived(dashboard.progressRange);
  const from = $derived(rangeStart(range, dashboard.history, whole, now, focus));
  const rangePhase = $derived(focus ?? whole.phases.find((p) => p.state !== 'done')?.phase);
  const RANGE_LABELS = $derived({
    phase: rangePhase === undefined ? 'This phase' : `Since phase ${rangePhase} started`,
    '14d': 'Last 14 days',
    all: 'All time',
  });
  const chart = $derived(burndown(tasks, forecast, now, focus, dashboard.vocab, from));
  // Agent time, waiting on you and idle over the burndown's range, for the matching tasks (T-242; shared with the
  // Activity popup, timeuse.ts)
  const use = $derived(timeUse(tasks, from === undefined ? null : { start: from, end: now }, now, dashboard.vocab));

  const toggle = (phase: number) => (dashboard.progressPhase = focus === phase ? null : phase);
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
      <h3 class="burndown-title">
        Burndown ·
        <span class="burndown-focus" id="burndown-focus"
          >{focus === undefined ? 'All phases' : `Phase ${focus}`}{filtered ? ' · matching tasks' : ''}</span
        >
        <InfoTip label="the burndown" id="burndown-info">
          <p>
            <strong>Scope</strong> is how many tasks existed at each moment (skipped ones left out);
            <strong>Remaining</strong> is how many of them weren't done yet. Scope steps up when tasks are added, a phase
            at a time; Remaining steps down as tasks are finished.
          </p>
          <p>
            The dashed line is the <strong>forecast</strong>: the agents' pace (the middle of their last 10 tasks, the
            shaded fan its usual spread) times the work left, phase by phase. Tasks in review or blocked wait on people,
            not agents, so the forecast ends at their number, not at zero.
          </p>
          <p>
            It assumes <strong>one agent, one task at a time</strong>: parallel agents finish sooner. Tasks labelled
            <code>interactive</code> are left out of the pace, as they include time spent waiting on you. Filters choose the
            lines, not the pace.
          </p>
        </InfoTip>
      </h3>
      {#if focus !== undefined}
        <button class="burndown-all" onclick={() => (dashboard.progressPhase = null)}>Show all phases</button>
      {/if}
      <span class="activity-range burndown-range" id="burndown-range" role="group" aria-label="Time range">
        {#each BURNDOWN_RANGES as option (option)}
          <button
            class:active={range === option}
            aria-pressed={range === option}
            data-range={option}
            onclick={() => (dashboard.progressRange = option)}>{RANGE_LABELS[option]}</button
          >
        {/each}
      </span>
    </div>
    {#if chart.untimed}
      <p class="progress-empty" id="burndown-empty">
        No timeline yet: tasks get times when agents start and finish them.
      </p>
    {:else}
      <BurndownChart data={chart} {now} />
    {/if}
    <PhaseTable {forecast} {now} selected={focus} onselect={toggle} />
    {#if use}
      <section class="progress-time-use" aria-label="Where the time went">
        <TimeSplitBar {use} id="progress-time-use" />
      </section>
    {/if}
  {/if}
</div>
