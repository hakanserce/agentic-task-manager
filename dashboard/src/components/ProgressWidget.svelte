<script lang="ts">
  import { forecastPhases, phaseRanges } from '../lib/forecast';
  import { formatWhen } from '../lib/format';
  import { progressBreakdown } from '../lib/insights';
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle, phaseColor, typeStyle } from '../lib/theme';
  import { kindOf, statusLabel as vocabStatusLabel } from '../lib/vocab';
  import Icon from './Icon.svelte';
  import Ring from './Ring.svelte';

  // Compact: a progress bar. Click: overall completion, the status split, and completion per phase and type.
  // Archived tasks count (all done): from meta.archived until the archive is loaded, then from the history (T-238)
  const p = $derived(
    dashboard.archiveLoaded
      ? progressBreakdown(dashboard.history, dashboard.vocab, 0, dashboard.archivedCount)
      : progressBreakdown(dashboard.tasks, dashboard.vocab, dashboard.archivedCount),
  );
  const pct = $derived(Math.round(p.overall.ratio * 100));
  let open = $state(false);
  // The popover's breakdown by phase and type needs the archived tasks themselves
  $effect(() => {
    if (open && dashboard.archivedCount > 0) dashboard.wantArchive();
  });
  const archivedNote = $derived(p.archived ? ` (${p.archived} archived, done)` : '');
  let root: HTMLElement;
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const statusStyle = (status: string) => kindStyle(kindOf(dashboard.vocab, status));
  const statusLabel = (status: string) => vocabStatusLabel(dashboard.vocab, status);

  // By phase (T-243): a ring for each unfinished phase; finished phases, which would be a row of full rings, are chips
  // with consecutive phases merged (✓ 0–12). A chip opens the Progress tab on its last phase.
  const source = $derived(dashboard.archiveLoaded ? dashboard.history : dashboard.tasks);
  const phases = $derived(forecastPhases(source, Date.now(), source, dashboard.vocab).phases);
  const finishedAt = $derived(new Map(phases.filter((f) => f.state === 'done').map((f) => [f.phase, f.completedAt])));
  const openPhases = $derived(p.byPhase.filter((s) => !finishedAt.has(Number(s.key))));
  const finishedRuns = $derived.by(() => {
    const runs: number[][] = [];
    for (const phase of [...finishedAt.keys()].sort((a, b) => a - b)) {
      const last = runs.at(-1);
      if (last && last.at(-1) === phase - 1) last.push(phase);
      else runs.push([phase]);
    }
    return runs;
  });
  const runTitle = (run: number[]) => {
    const when = Math.max(...run.map((phase) => finishedAt.get(phase) ?? -Infinity));
    const label = run.length > 1 ? `Phases ${phaseRanges(run)}` : `Phase ${run[0]}`;
    return `${label}: finished${Number.isFinite(when) ? `, the last on ${formatWhen(when, Date.now())}` : ''} · open on the Progress tab`;
  };
  function openPhase(phase: number) {
    dashboard.progressPhase = phase;
    dashboard.selectTab('progress');
    open = false;
  }

  // Go to: the Progress tab, and the Kanban filtered to the statuses that need a look
  const countOfKind = (kind: string) =>
    p.byStatus.filter((s) => kindOf(dashboard.vocab, s.status) === kind).reduce((n, s) => n + s.count, 0);
  const GO_TO = [
    { kind: 'review', label: 'In review' },
    { kind: 'blocked', label: 'Blocked' },
    { kind: 'active', label: 'In progress' },
  ] as const;
  function showStatuses(statuses: string[]) {
    dashboard.clearFilters();
    for (const status of statuses) dashboard.toggleFilter('status', status);
    dashboard.selectTab('kanban');
    open = false;
  }
  const statusesOfKind = (kind: string) => dashboard.vocab.statuses.filter((s) => s.kind === kind).map((s) => s.id);
</script>

<svelte:window
  onclick={(e) => open && !root.contains(e.target as Node) && (open = false)}
  onkeydown={(e) => e.key === 'Escape' && (open = false)}
/>

<div class="widget" bind:this={root}>
  <button
    class="widget-card progress-card"
    id="progress-card"
    aria-expanded={open}
    title="Progress: {p.overall.done} of {p.overall.total} tasks done{archivedNote} · click for details"
    aria-label="Progress {pct}%, {p.overall.done} of {p.overall.total} tasks done"
    onclick={() => (open = !open)}
  >
    <span class="widget-body">
      <!-- A small ring like the panel's, without its built-in label: the number sits beside it -->
      <svg class="mini-ring" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="8" fill="none" stroke="var(--surface2)" stroke-width="3" />
        {#if p.overall.ratio > 0}
          <circle
            cx="10"
            cy="10"
            r="8"
            fill="none"
            stroke="var(--green)"
            stroke-width="3"
            stroke-linecap="round"
            stroke-dasharray="{p.overall.ratio * 2 * Math.PI * 8} {2 * Math.PI * 8}"
            transform="rotate(-90 10 10)"
          />
        {/if}
      </svg>
      <span class="number">{pct}%</span>
    </span>
    <Icon name="chevron-down" size={14} />
  </button>
  {#if open}
    <div class="insights-panel" id="progress-panel" role="dialog" aria-label="Progress details">
      <div class="panel-heading">Progress</div>
      <div class="insights-hero">
        <Ring
          ratio={p.overall.ratio}
          color="var(--green)"
          size={132}
          stroke={12}
          label="All tasks"
          skipped={p.overall.skipped}
          total={p.overall.total}
        />
        <div class="insights-hero-text">
          <div class="insights-title">
            {p.overall.done} of {p.overall.total} tasks done{#if p.archived}<span
                class="skipped-note"
                id="overall-archived">&nbsp;· {p.archived} archived</span
              >{/if}{#if p.overall.skipped}<span class="skipped-note" id="overall-skipped"
                >&nbsp;· {p.overall.skipped} skipped</span
              >{/if}
          </div>
          <!-- Status split: a stacked bar (part of a whole), labelled in the legend -->
          <div class="status-bar" aria-hidden="true">
            {#each p.byStatus as s (s.status)}
              <span
                style="flex:{s.count};background:{statusStyle(s.status).color}"
                title="{statusLabel(s.status)}: {s.count}"
              ></span>
            {/each}
          </div>
          <!-- Each status opens the Kanban filtered to it -->
          <ul class="status-legend">
            {#each p.byStatus as s (s.status)}
              <li>
                <button
                  class="status-legend-link"
                  data-status={s.status}
                  title="Show {statusLabel(s.status)} tasks on the Kanban"
                  onclick={() => showStatuses([s.status])}
                  ><span class="legend-dot" style="background:{statusStyle(s.status).color}"></span>{statusLabel(
                    s.status,
                  )}<strong>{s.count}</strong></button
                >
              </li>
            {/each}
          </ul>
        </div>
      </div>

      <div class="insights-section ring-group" id="progress-by-phase">
        <div class="ring-group-head"><div class="menu-label">By phase</div></div>
        {#if openPhases.length}
          <div class="ring-grid">
            {#each openPhases as s (s.key)}
              <button
                class="ring-cell ring-cell-button"
                title="{capitalize(s.label)}: {s.done} of {s.total} done{s.skipped
                  ? `, ${s.skipped} skipped`
                  : ''} · open on the Progress tab"
                onclick={() => openPhase(Number(s.key))}
              >
                <Ring
                  ratio={s.ratio}
                  color={phaseColor(Number(s.key))}
                  label={s.label}
                  skipped={s.skipped}
                  total={s.total}
                />
                <span class="ring-label">{capitalize(s.label)}</span>
                <span class="ring-count">{s.done}/{s.total}</span>
              </button>
            {/each}
          </div>
        {/if}
        {#if finishedRuns.length}
          <div class="finished-chips" id="progress-finished-chips">
            {#each finishedRuns as run (run[0])}
              <button class="finished-chip" title={runTitle(run)} onclick={() => openPhase(run.at(-1)!)}
                >✓ {phaseRanges(run)}</button
              >
            {/each}
          </div>
        {/if}
      </div>

      <!-- By type: one stacked bar of all tasks, a segment per type, its done part solid and the rest faint -->
      <div class="insights-section" id="progress-by-type">
        <div class="menu-label">By type</div>
        <div class="status-bar" aria-hidden="true">
          {#each p.byType as s (s.key)}
            {@const color = typeStyle(s.key).color}
            <span
              class="type-bar-segment"
              style:flex={s.total}
              title="{capitalize(s.label)}: {s.done} of {s.total} done"
              style:background="color-mix(in srgb, {color} 28%, transparent)"
              ><span
                class="type-bar-done"
                style:width="{s.total ? (s.done / s.total) * 100 : 0}%"
                style:background={color}
              ></span></span
            >
          {/each}
        </div>
        <ul class="status-legend">
          {#each p.byType as s (s.key)}
            <li data-type={s.key}>
              <span class="legend-dot" style="background:{typeStyle(s.key).color}"></span>{capitalize(s.label)}
              <strong>{s.done}/{s.total}</strong>
            </li>
          {/each}
        </ul>
      </div>

      <div class="insights-section progress-go-to" id="progress-go-to">
        <div class="menu-label">Go to</div>
        <div class="go-to-links">
          <button
            class="go-to-link"
            data-go="progress"
            onclick={() => {
              dashboard.selectTab('progress');
              open = false;
            }}>Progress tab</button
          >
          {#each GO_TO as item (item.kind)}
            <button
              class="go-to-link"
              data-go={item.kind}
              disabled={countOfKind(item.kind) === 0}
              onclick={() => showStatuses(statusesOfKind(item.kind))}>{item.label} ({countOfKind(item.kind)})</button
            >
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
