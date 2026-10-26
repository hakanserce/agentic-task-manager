<script lang="ts">
  import { phaseRanges, type Forecast, type PhaseForecast } from '../lib/forecast';
  import { formatMinutes, formatMinutesRange, formatWhen } from '../lib/format';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor } from '../lib/theme';
  import InfoTip from './InfoTip.svelte';

  let {
    forecast,
    now,
    selected,
    onselect,
  }: { forecast: Forecast; now: number; selected?: number; onselect?: (phase: number) => void } = $props();

  function onRowKeydown(e: KeyboardEvent, phase: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onselect?.(phase);
    }
  }

  // Skipped tasks count as neither done nor left to do: a phase of done and skipped tasks is 100%
  const pct = (row: { done: number; total: number; skipped: number }) =>
    row.total ? Math.round((row.done / row.total) * 100) : row.skipped ? 100 : 0;

  // Finished phases fold into one row (T-241): on a long project they are most of the table and say nothing new. One
  // finished phase is shown as it is. The row opens to show them; the choice lasts while the tab is open.
  const finished = $derived(forecast.phases.filter((p) => p.state === 'done'));
  const folded = $derived(finished.length >= 2);
  let expanded = $state(false);
  const finishedTasks = $derived(finished.reduce((n, p) => n + p.total + p.skipped, 0));
  const lastFinished = $derived(Math.max(...finished.map((p) => p.completedAt ?? -Infinity)));
  const finishedLabel = $derived(
    `✓ Phases ${phaseRanges(finished.map((p) => p.phase))} · ${finishedTasks} tasks` +
      (Number.isFinite(lastFinished) ? ` · last finished ${formatWhen(lastFinished, now)}` : ''),
  );
  const rows = $derived(folded && !expanded ? forecast.phases.filter((p) => p.state !== 'done') : forecast.phases);
  // The first phase with an estimate is the loop's next: the ones after it include its work, and the work before them
  const firstEstimated = $derived(forecast.phases.find((p) => p.estimate)?.phase);
  const name = (phase: number) => dashboard.vocab.phaseNames.get(phase);
</script>

<p class="progress-basis" id="progress-basis">
  {#if forecast.pace}
    <!-- One short line; the burndown's ⓘ explains what the pace is and what it assumes (T-240) -->
    <span title="{formatMinutesRange(forecast.pace.low, forecast.pace.high)} for the middle half of those tasks"
      >Pace: ~{formatMinutes(forecast.pace.likely)} per task (last {forecast.pace.basedOn} tasks, one agent at a time).</span
    >
    Phases are worked in order, like <code>/atm:loop-tasks</code>.
  {:else}
    Not enough history to estimate yet: estimates need at least 3 completed tasks with timestamps.
  {/if}
  {#if onselect}<span class="phase-table-hint">Click a phase to see its burndown.</span>{/if}
</p>

<table class="phase-table" id="phase-table">
  <thead>
    <tr>
      <th>Phase</th>
      <th>Done</th>
      <th class="phase-table-progress">Progress</th>
      <th>Remaining</th>
      <th>
        Finished by
        <InfoTip label="the phase estimates" id="phase-table-info">
          <p>
            <strong>Finished by</strong> is when the phase would be done if an agent loop keeps running from now. Phases
            are worked in order, like <code>/atm:loop-tasks</code>, so a phase's estimate includes the work left in the
            phases before it.
          </p>
          <p>
            It counts only work agents can do: tasks <strong>blocked</strong> or <strong>in review</strong> wait on people
            and are left out (shown next to Remaining). It is for the whole phase, whatever the filters.
          </p>
        </InfoTip>
      </th>
    </tr>
  </thead>
  <tbody>
    {#if folded}
      <tr class="phase-finished-group" id="phase-finished">
        <td colspan="5">
          <button
            class="phase-finished-toggle"
            id="phase-finished-toggle"
            aria-expanded={expanded}
            onclick={() => (expanded = !expanded)}
          >
            <span>{finishedLabel}</span>
            <span class="phase-finished-action">{expanded ? 'Hide' : 'Show'}</span>
          </button>
        </td>
      </tr>
    {/if}
    {#each rows as row (row.phase)}
      {@render phaseRow(row)}
    {/each}
  </tbody>
</table>

{#snippet phaseRow(row: PhaseForecast)}
  {@const color = phaseColor(row.phase)}
  <tr
    data-phase={row.phase}
    data-state={row.state}
    class:selected={selected === row.phase}
    class:selectable={!!onselect}
    class:not-started={row.state === 'not_started'}
    tabindex={onselect ? 0 : undefined}
    aria-selected={onselect ? selected === row.phase : undefined}
    onclick={() => onselect?.(row.phase)}
    onkeydown={(e) => onRowKeydown(e, row.phase)}
  >
    <td class="phase-cell"
      ><span class="phase-badge" style="background:color-mix(in srgb, {color} 12.5%, transparent);color:{color}"
        >{row.state === 'done' ? '✓ ' : ''}Phase {row.phase}</span
      >{#if name(row.phase)}<span class="phase-name">{name(row.phase)}</span>{/if}</td
    >
    <td class="num"
      >{row.done}/{row.total}{#if row.skipped}<span class="skipped-note" title="Skipped: not counted as done or to do"
          >&nbsp;· {row.skipped} skipped</span
        >{/if}</td
    >
    <td class="phase-table-progress">
      <div class="progress-bar">
        <div class="progress-fill" style:width="{pct(row)}%" style:background={color}></div>
      </div>
    </td>
    <td class="num">
      {row.remaining}{#if row.blocked}<span class="phase-blocked" title="Blocked tasks are not included in the estimate"
          >{row.blocked} blocked</span
        >{/if}{#if row.inReview}<span
          class="phase-blocked phase-in-review"
          title="Tasks waiting for a review need no agent work and are not included in the estimate"
          >{row.inReview} in review</span
        >{/if}
    </td>
    <td
      class="phase-estimate"
      title={row.estimate
        ? `${formatMinutes(row.estimate.minutes.likely)} of agent work (${formatMinutesRange(row.estimate.minutes.low, row.estimate.minutes.high)}), for the whole phase whatever the filters`
        : undefined}
    >
      {#if row.state === 'done'}
        Done{#if row.completedAt}&nbsp;{formatWhen(row.completedAt, now)}{/if}
      {:else if row.estimate}
        <div class="estimate-main">≈ {formatWhen(row.estimate.finishAt.likely, now)}</div>
        <div class="estimate-calendar">
          {formatMinutes(row.estimate.minutes.likely)} of agent work{row.phase === firstEstimated
            ? ''
            : ', including earlier phases'}
        </div>
      {:else if row.remaining === 0 && row.blocked}
        Blocked
      {:else if row.remaining === 0 && row.inReview}
        Waiting for review
      {:else}
        <span class="estimate-none">Not enough history to estimate</span>
      {/if}
    </td>
  </tr>
{/snippet}
