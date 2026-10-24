<script lang="ts">
  import { adjacentView, parseViewHash, VIEW_LABELS, VIEWS, type ViewId } from '../lib/tabs';
  import { dashboard } from '../lib/state.svelte';
  import AgentsTab from './AgentsTab.svelte';
  import DepGraph from './DepGraph.svelte';
  import KanbanBoard from './KanbanBoard.svelte';
  import ProgressTab from './ProgressTab.svelte';
  import TaskGrid from './TaskGrid.svelte';

  const view = $derived(dashboard.tab);
  const tabs: Partial<Record<ViewId, HTMLButtonElement>> = {};

  // The hash is the source of truth (FR-2.2): selecting a tab writes it, back/forward and edits read it.
  function select(next: ViewId, focus = false) {
    dashboard.selectTab(next);
    if (focus) tabs[next]?.focus();
  }

  function onTabKeydown(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    select(adjacentView(view, step), true);
  }
</script>

<svelte:window onhashchange={() => (dashboard.tab = parseViewHash(location.hash))} />

<div class="graph-section" id="graph-section">
  <div class="phase-header view-header">
    <div class="view-tabs" role="tablist" aria-label="Views">
      {#each VIEWS as id (id)}
        <button
          bind:this={tabs[id]}
          class="view-tab"
          id="tab-{id}"
          role="tab"
          aria-selected={view === id}
          aria-controls="panel-{id}"
          tabindex={view === id ? 0 : -1}
          onclick={() => select(id)}
          onkeydown={onTabKeydown}>{VIEW_LABELS[id]}</button
        >
      {/each}
    </div>
  </div>
  <div class="view-panels">
    <!-- Inactive panels stay mounted (hidden) so each view keeps its state, e.g. the graph's pan/zoom (FR-2.4) -->
    <div class="view-panel" id="panel-graph" role="tabpanel" aria-labelledby="tab-graph" hidden={view !== 'graph'}>
      <DepGraph />
    </div>
    <div class="view-panel" id="panel-kanban" role="tabpanel" aria-labelledby="tab-kanban" hidden={view !== 'kanban'}>
      <KanbanBoard />
    </div>
    <div class="view-panel" id="panel-list" role="tabpanel" aria-labelledby="tab-list" hidden={view !== 'list'}>
      <TaskGrid />
    </div>
    <div class="view-panel" id="panel-agents" role="tabpanel" aria-labelledby="tab-agents" hidden={view !== 'agents'}>
      <AgentsTab />
    </div>
    <div
      class="view-panel"
      id="panel-progress"
      role="tabpanel"
      aria-labelledby="tab-progress"
      hidden={view !== 'progress'}
    >
      <ProgressTab />
    </div>
  </div>
</div>
