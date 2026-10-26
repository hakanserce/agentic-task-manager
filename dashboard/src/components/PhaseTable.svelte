<script lang="ts">
  import type { Forecast } from '../lib/forecast';
  import { formatMinutes, formatMinutesRange, formatWhen } from '../lib/format';
  import { phaseColor } from '../lib/theme';

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

  const STATE_LABELS = { done: 'Done', in_progress: 'In progress', not_started: 'Not started' } as const;
  // Skipped tasks count as neither done nor left to do: a phase of done and skipped tasks is 100%
  const pct = (row: { done: number; total: number; skipped: number }) =>
    row.total ? Math.round((row.done / row.total) * 100) : row.skipped ? 100 : 0;
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
</p>

<table class="phase-table" id="phase-table">
  <thead>
    <tr>
      <th>Phase</th>
      <th>Done</th>
      <th class="phase-table-progress">Progress</th>
      <th>Remaining</th>
      <th>State</th>
      <th>Estimate</th>
    </tr>
  </thead>
  <tbody>
    {#each forecast.phases as row (row.phase)}
      {@const color = phaseColor(row.phase)}
      <tr
        data-phase={row.phase}
        data-state={row.state}
        class:selected={selected === row.phase}
        class:selectable={!!onselect}
        tabindex={onselect ? 0 : undefined}
        aria-selected={onselect ? selected === row.phase : undefined}
        onclick={() => onselect?.(row.phase)}
        onkeydown={(e) => onRowKeydown(e, row.phase)}
      >
        <td
          ><span class="phase-badge" style="background:color-mix(in srgb, {color} 12.5%, transparent);color:{color}"
            >Phase {row.phase}</span
          ></td
        >
        <td class="num"
          >{row.done}/{row.total}{#if row.skipped}<span
              class="skipped-note"
              title="Skipped: not counted as done or to do">&nbsp;· {row.skipped} skipped</span
            >{/if}</td
        >
        <td class="phase-table-progress">
          <div class="progress-bar">
            <div class="progress-fill" style:width="{pct(row)}%" style:background={color}></div>
          </div>
        </td>
        <td class="num">
          {row.remaining}{#if row.blocked}<span
              class="phase-blocked"
              title="Blocked tasks are not included in the estimate">{row.blocked} blocked</span
            >{/if}{#if row.inReview}<span
              class="phase-blocked phase-in-review"
              title="Tasks waiting for a review need no agent work and are not included in the estimate"
              >{row.inReview} in review</span
            >{/if}
        </td>
        <td>{STATE_LABELS[row.state]}</td>
        <td
          class="phase-estimate"
          title={row.estimate
            ? 'For the whole phase, all its tasks, whatever the filters: the loop works through all of it'
            : undefined}
        >
          {#if row.state === 'done'}
            Done{#if row.completedAt}&nbsp;{formatWhen(row.completedAt, now)}{/if}
          {:else if row.estimate}
            <div class="estimate-main">
              ≈ {formatMinutes(row.estimate.minutes.likely)} of agent work
              <span class="estimate-range"
                >({formatMinutesRange(row.estimate.minutes.low, row.estimate.minutes.high)})</span
              >
            </div>
            <div class="estimate-calendar">
              If the loop keeps running: {formatWhen(row.estimate.finishAt.likely, now)}
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
    {/each}
  </tbody>
</table>
