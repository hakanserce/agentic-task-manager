<script lang="ts">
  import { buildBoard, buildLanes } from '../lib/kanban';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor } from '../lib/theme';
  import { phaseLabel } from '../lib/vocab';
  import KanbanColumns from './KanbanColumns.svelte';

  const showAllDone = $derived(dashboard.kanbanShowAllDone);
  // Both options are part of the project's saved view (dashboard state)
  const groupByPhase = $derived(dashboard.kanbanGroupByPhase);
  const showSkipped = $derived(dashboard.kanbanShowSkipped);

  const options = $derived({ showSkipped, statusFilter: dashboard.filters.status, vocab: dashboard.vocab });
  const board = $derived(groupByPhase ? [] : buildBoard(dashboard.filtered, dashboard.tasks, options));
  const lanes = $derived(groupByPhase ? buildLanes(dashboard.filtered, dashboard.tasks, options) : []);
</script>

<div class="kanban" id="kanban">
  <div class="kanban-toolbar">
    <label class="kanban-option"
      ><input
        type="checkbox"
        id="kanban-group-by-phase"
        checked={groupByPhase}
        onchange={(e) => (dashboard.kanbanGroupByPhase = e.currentTarget.checked)}
      /> Group by phase</label
    >
    <label class="kanban-option"
      ><input
        type="checkbox"
        id="kanban-show-skipped"
        checked={showSkipped}
        onchange={(e) => (dashboard.kanbanShowSkipped = e.currentTarget.checked)}
      /> Show skipped</label
    >
  </div>
  {#if groupByPhase}
    {#each lanes as lane (lane.phase)}
      <div class="kanban-lane" data-phase={lane.phase}>
        <div class="kanban-lane-header">
          <span
            class="phase-badge"
            style="background:color-mix(in srgb, {phaseColor(lane.phase)} 12.5%, transparent);color:{phaseColor(
              lane.phase,
            )}">{phaseLabel(dashboard.vocab, lane.phase)}</span
          >
          <span class="kanban-lane-progress">{lane.done}/{lane.total} done</span>
        </div>
        <KanbanColumns columns={lane.columns} {showAllDone} onshowall={(all) => (dashboard.kanbanShowAllDone = all)} />
      </div>
    {/each}
  {:else}
    <KanbanColumns columns={board} {showAllDone} onshowall={(all) => (dashboard.kanbanShowAllDone = all)} />
  {/if}
</div>
