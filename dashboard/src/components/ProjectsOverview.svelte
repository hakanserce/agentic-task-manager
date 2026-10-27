<script lang="ts">
  // All projects at a glance (docs/multi-project-dashboard-proposal.md 3.5): a card per project, those that need you
  // first; or, on the Board tab, every project's tasks in one board (T-259). "Active only" hides projects with no open
  // work and nothing done lately, on both tabs.
  import { ACTIVE_DAYS, isActive, orderProjects } from '../lib/projects';
  import { OVERVIEW_TABS, type OverviewTab } from '../lib/routes';
  import { dashboard } from '../lib/state.svelte';
  import AllProjectsBoard from './AllProjectsBoard.svelte';
  import Icon from './Icon.svelte';
  import ProjectCard from './ProjectCard.svelte';

  const ordered = $derived(orderProjects(dashboard.projects));
  const shown = $derived(
    dashboard.overviewActiveOnly ? ordered.filter((p) => isActive(p, dashboard.loadedAt)) : ordered,
  );
  const hidden = $derived(ordered.length - shown.length);
  const tab = $derived(dashboard.overviewTab);

  const LABELS: Record<OverviewTab, string> = { projects: 'Projects', board: 'Board' };
  const ICONS = { projects: 'folder', board: 'square-kanban' } as const;
  const buttons: Partial<Record<OverviewTab, HTMLButtonElement>> = {};

  function onTabKeydown(e: KeyboardEvent) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tab === 'projects' ? 'board' : 'projects';
    dashboard.selectOverviewTab(next);
    buttons[next]?.focus();
  }
</script>

<section class="projects-overview" id="projects-overview">
  <div class="view-tabs overview-tabs" role="tablist" aria-label="All projects">
    {#each OVERVIEW_TABS as id (id)}
      <button
        bind:this={buttons[id]}
        class="view-tab"
        id="overview-tab-{id}"
        role="tab"
        aria-selected={tab === id}
        aria-controls="overview-panel"
        tabindex={tab === id ? 0 : -1}
        onclick={() => dashboard.selectOverviewTab(id)}
        onkeydown={onTabKeydown}><Icon name={ICONS[id]} size={15} />{LABELS[id]}</button
      >
    {/each}
  </div>
  <div class="projects-toolbar">
    {#if tab === 'board'}
      <!-- Over every project's tasks (T-261): ID, name, description, type, labels, notes and the project's name -->
      <label class="task-search board-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          id="board-search"
          placeholder="Search the board"
          aria-label="Search the board's tasks by ID, name, description, type, label, note or project"
          value={dashboard.boardQuery}
          oninput={(e) => dashboard.setBoardQuery(e.currentTarget.value)}
        />
        {#if dashboard.boardQuery}
          <button class="search-clear" aria-label="Clear search" onclick={() => dashboard.setBoardQuery('')}
            ><Icon name="x" size={12} /></button
          >
        {/if}
      </label>
      <label class="projects-active-only"
        ><input
          type="checkbox"
          id="board-group-by-project"
          checked={dashboard.boardGroupByProject}
          onchange={(e) => dashboard.setBoardGroupByProject(e.currentTarget.checked)}
        /> Group by project</label
      >
    {/if}
    <label
      class="projects-active-only"
      title="Hide projects with no open tasks and no activity in the last {ACTIVE_DAYS} days"
      ><input
        type="checkbox"
        id="active-projects-only"
        checked={dashboard.overviewActiveOnly}
        onchange={(e) => dashboard.setOverviewActiveOnly(e.currentTarget.checked)}
      /> Active only</label
    >
    {#if hidden}
      <span class="projects-hidden" id="projects-hidden">{hidden} inactive project{hidden === 1 ? '' : 's'} hidden</span
      >
    {/if}
  </div>
  <div id="overview-panel" role="tabpanel" aria-labelledby="overview-tab-{tab}">
    {#if tab === 'board'}
      <AllProjectsBoard projects={shown} />
    {:else}
      <div class="projects-grid" id="projects-grid">
        {#each shown as project (project.id)}
          <ProjectCard {project} />
        {/each}
      </div>
    {/if}
  </div>
</section>
