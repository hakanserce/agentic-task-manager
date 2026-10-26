<script lang="ts">
  // One project on the overview (docs/multi-project-dashboard-proposal.md 3.5), from its server summary
  import { formatAgo } from '../lib/claims';
  import type { ProjectEntry } from '../lib/load';
  import { needsYou } from '../lib/projects';
  import { dashboard } from '../lib/state.svelte';
  import Icon from './Icon.svelte';

  let { project }: { project: ProjectEntry } = $props();

  const s = $derived(project.summary);
  const need = $derived(needsYou(project));
  const counted = $derived(s ? s.total - s.skipped : 0);
  const phase = $derived(s?.current_phase);

  // Completions per day over the last 14 days: thin bars, like the Activity widget
  const W = 112;
  const H = 20;
  const days = $derived(s?.completions_14d ?? []);
  const max = $derived(Math.max(1, ...days));
  const step = $derived(days.length ? W / days.length : W);
</script>

<article class="project-card" class:missing={project.missing} data-id={project.id}>
  <div class="project-card-head">
    {#if project.missing}
      <h3 class="project-card-name" title={project.path}>{project.name}</h3>
    {:else}
      <h3 class="project-card-name">
        <button class="project-card-open" title={project.path} onclick={() => dashboard.openProject(project.id)}
          >{project.name}</button
        >
      </h3>
    {/if}
    {#if need}
      <button
        class="attention-chip project-card-need"
        title="Open its Kanban board, filtered to the tasks in review and blocked"
        onclick={() => dashboard.openProject(project.id, { needsYou: true })}
        >{need} need{need === 1 ? 's' : ''} you</button
      >
    {/if}
  </div>

  {#if project.missing}
    <p class="project-card-note">
      Not found: its folder or tasks.json is gone. Remove it with <code>atm projects remove {project.id}</code>.
    </p>
  {:else if !s}
    <p class="project-card-note">No numbers yet</p>
  {:else}
    <div class="project-card-progress">
      <div
        class="progress-bar"
        role="progressbar"
        aria-label="{s.percent}% done"
        aria-valuenow={s.percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div class="progress-fill" style:width="{s.percent}%" style:background="var(--green)"></div>
      </div>
      <div class="project-card-counts">
        <span class="project-card-done"
          >{s.done} / {counted}{#if s.skipped}&nbsp;<span class="muted">· {s.skipped} skipped</span>{/if}</span
        >
        <span class="project-card-percent">{s.percent}%</span>
      </div>
    </div>

    <p class="project-card-phase">
      {#if phase}
        Phase {phase.id}{#if phase.name}&nbsp;<span class="muted">· {phase.name}</span>{/if} — {phase.done} / {phase.total}
      {:else}
        Every phase is finished
      {/if}
    </p>

    <div class="project-card-foot">
      {#if s.agents_working}
        <span class="project-card-agents"
          ><Icon name="bot" size={13} /> {s.agents_working} agent{s.agents_working === 1 ? '' : 's'} working</span
        >
      {/if}
      <span class="project-card-last muted">
        {s.last_activity ? formatAgo(s.last_activity, dashboard.loadedAt) : 'No activity yet'}
      </span>
      <svg
        class="sparkline project-card-spark"
        width={W}
        height={H}
        viewBox="0 0 {W} {H}"
        role="img"
        aria-label="Tasks completed per day, last {days.length} days: {days.join(', ')}"
      >
        {#each days as n, i (i)}
          <rect
            x={i * step + 1}
            y={n ? H - (n / max) * (H - 2) : H - 1}
            width={Math.max(1, step - 2)}
            height={n ? (n / max) * (H - 2) : 1}
            rx="1.5"
            fill={n ? 'var(--series-remaining)' : 'var(--border)'}
          />
        {/each}
      </svg>
    </div>
  {/if}
</article>
