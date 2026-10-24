<script lang="ts">
  import { progressBreakdown } from '../lib/insights';
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle, phaseColor, typeStyle } from '../lib/theme';
  import { kindOf, statusLabel as vocabStatusLabel } from '../lib/vocab';
  import Icon from './Icon.svelte';
  import Ring from './Ring.svelte';

  // Compact: a progress bar. Click: overall completion, the status split, and completion per phase and type.
  const p = $derived(progressBreakdown(dashboard.tasks));
  const pct = $derived(Math.round(p.overall.ratio * 100));
  let open = $state(false);
  let root: HTMLElement;
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const statusStyle = (status: string) => kindStyle(kindOf(dashboard.vocab, status));
  const statusLabel = (status: string) => vocabStatusLabel(dashboard.vocab, status);
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
    title="Progress: {p.overall.done} of {p.overall.total} tasks done · click for details"
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
        <Ring ratio={p.overall.ratio} color="var(--green)" size={132} stroke={12} label="All tasks" />
        <div class="insights-hero-text">
          <div class="insights-title">{p.overall.done} of {p.overall.total} tasks done</div>
          <!-- Status split: a stacked bar (part of a whole), labelled in the legend -->
          <div class="status-bar" aria-hidden="true">
            {#each p.byStatus as s (s.status)}
              <span
                style="flex:{s.count};background:{statusStyle(s.status).color}"
                title="{statusLabel(s.status)}: {s.count}"
              ></span>
            {/each}
          </div>
          <ul class="status-legend">
            {#each p.byStatus as s (s.status)}
              <li>
                <span class="legend-dot" style="background:{statusStyle(s.status).color}"></span>{statusLabel(
                  s.status,
                )}<strong>{s.count}</strong>
              </li>
            {/each}
          </ul>
        </div>
      </div>
      {@render group('By phase', p.byPhase, (key) => phaseColor(Number(key)))}
      {@render group('By type', p.byType, (key) => typeStyle(key).color)}
    </div>
  {/if}
</div>

{#snippet group(title: string, shares: typeof p.byPhase, color: (key: string) => string)}
  <div class="insights-section">
    <div class="menu-label">{title}</div>
    <div class="ring-grid">
      {#each shares as s (s.key)}
        <div class="ring-cell" title="{capitalize(s.label)}: {s.done} of {s.total} done">
          <Ring ratio={s.ratio} color={color(s.key)} label={s.label} />
          <div class="ring-label">{capitalize(s.label)}</div>
          <div class="ring-count">{s.done}/{s.total}</div>
        </div>
      {/each}
    </div>
  </div>
{/snippet}
