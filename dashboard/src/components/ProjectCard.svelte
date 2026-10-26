<script lang="ts">
  // One project on the overview (docs/multi-project-dashboard-proposal.md 3.5), from its server summary
  import { formatAgo } from '../lib/claims';
  import type { ProjectEntry } from '../lib/load';
  import { needsYou } from '../lib/projects';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor } from '../lib/theme';
  import Icon from './Icon.svelte';
  import NeedsYouMenu from './NeedsYouMenu.svelte';
  import ProjectLogo from './ProjectLogo.svelte';
  import Ring from './Ring.svelte';

  let { project }: { project: ProjectEntry } = $props();

  const s = $derived(project.summary);
  const need = $derived(needsYou(project));
  const needItems = $derived(project.missing ? [] : (s?.needs_you_tasks ?? []));
  const counted = $derived(s ? s.total - s.skipped : 0);
  const phase = $derived(s?.current_phase);
  // An older server sends no recent_phases: no rings then
  const phases = $derived(s?.recent_phases ?? []);
  // What's going on, by task name (T-207): the agents' tasks, or else what the loop takes next. Two lines at most, so
  // the cards of a row line up; more work than that ends the second line with "+N more". A server before 0.18 sends
  // neither: the foot then counts the agents instead.
  const working = $derived(s?.working ?? []);
  const nextUp = $derived(s?.next ?? []);
  const byName = $derived(s?.working !== undefined);
  const workLines = $derived(working.length ? working.slice(0, 2) : nextUp.slice(0, 2));
  const moreWork = $derived(Math.max(0, working.length - 2));

  // Completions per day over the last 14 days: thin bars, like the Activity widget
  const W = 112;
  const H = 20;
  const days = $derived(s?.completions_14d ?? []);
  const max = $derived(Math.max(1, ...days));
  const step = $derived(days.length ? W / days.length : W);
</script>

<article class="project-card" class:missing={project.missing} data-id={project.id}>
  <div class="project-card-head">
    <ProjectLogo {project} size={24} />
    {#if project.missing}
      <h3 class="project-card-name" title="{project.name}&#10;{project.path}">{project.name}</h3>
    {:else}
      <h3 class="project-card-name">
        <button
          class="project-card-open"
          title="{project.name}&#10;{project.path}"
          onclick={() => dashboard.openProject(project.id)}>{project.name}</button
        >
      </h3>
    {/if}
    {#if needItems.length}
      <!-- The tasks, from the server's summary: one opens the project on it, several are listed under the chip -->
      <NeedsYouMenu
        items={needItems}
        onopen={(task) => dashboard.openProject(project.id, { task })}
        chipClass="project-card-need"
        align="right"
      />
    {:else if need}
      <!-- A server without the list (before 0.17): the project's Kanban, filtered to review and blocked -->
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
      {#if phases.length}
        <!-- One ring per recent phase, always on one line: the rings shrink to fit the card -->
        <ul class="project-card-rings" aria-label="Recent phases">
          {#each phases as p (p.id)}
            {@const name = `Phase ${p.id}${p.name ? ` · ${p.name}` : ''}`}
            <li class="project-card-ring" title="{name}: {p.done} / {p.total} done">
              <Ring
                ratio={p.total ? p.done / p.total : 0}
                color={phaseColor(p.id)}
                size={48}
                stroke={5}
                ariaLabel="{name}: {p.done} of {p.total} done"
              />
              <span class="project-card-ring-label">Phase {p.id}</span>
            </li>
          {/each}
        </ul>
      {/if}
      <div class="project-card-counts">
        <span class="project-card-done"
          >{s.done} / {counted} done{#if s.skipped}&nbsp;· {s.skipped} skipped{/if}</span
        >
        <span class="project-card-percent">{s.percent}%</span>
      </div>
    </div>

    <!-- One line: a long phase name is cut off (the full one in the title), its counts stay visible -->
    <p
      class="project-card-phase"
      title={phase ? `Phase ${phase.id}${phase.name ? ` · ${phase.name}` : ''} — ${phase.done} / ${phase.total}` : null}
    >
      {#if phase}
        <span class="project-card-phase-name"
          >Phase {phase.id}{#if phase.name}&nbsp;<span class="muted">· {phase.name}</span>{/if}</span
        ><span class="project-card-phase-count">&nbsp;— {phase.done} / {phase.total}</span>
      {:else}
        Every phase is finished
      {/if}
    </p>

    {#if byName}
      <ul
        class="project-card-work"
        class:next={!working.length}
        aria-label={working.length ? 'Working now' : 'Next up'}
      >
        {#each workLines as line, i (i)}
          {@const id = 'task' in line ? line.task : line.id}
          {@const who = 'agent' in line ? [line.agent, line.branch].filter(Boolean).join(' · ') : 'next up'}
          <li class="project-card-work-line" title="{id} {line.name} — {who}">
            {#if working.length}
              <Icon name="bot" size={13} />
            {:else}
              <span class="project-card-next">Next:</span>
            {/if}
            <span class="project-card-work-id">{id}</span>
            <span class="project-card-work-name">{line.name}</span>
            {#if i === 1 && moreWork}<span class="project-card-more">+{moreWork} more</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}

    <div class="project-card-foot">
      {#if s.agents_working && !byName}
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
