<script lang="ts">
  import { buildBoard, buildLanes } from '../lib/kanban';
  import { getPref, setPref } from '../lib/prefs';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor } from '../lib/theme';
  import KanbanColumns from './KanbanColumns.svelte';

  let showSkipped = $state(false);
  let showAllDone = $state(false);
  let groupByPhase = $state(getPref('kanbanGroupByPhase', false));

  const options = $derived({ showSkipped, statusFilter: dashboard.filters.status });
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
        onchange={(e) => setPref('kanbanGroupByPhase', (groupByPhase = e.currentTarget.checked))}
      /> Group by phase</label
    >
    <label class="kanban-option"
      ><input type="checkbox" id="kanban-show-skipped" bind:checked={showSkipped} /> Show skipped</label
    >
  </div>
  {#if groupByPhase}
    {#each lanes as lane (lane.phase)}
      <div class="kanban-lane" data-phase={lane.phase}>
        <div class="kanban-lane-header">
          <span class="phase-badge" style="background:{phaseColor(lane.phase)}20;color:{phaseColor(lane.phase)}"
            >Phase {lane.phase}</span
          >
          <span class="kanban-lane-progress">{lane.done}/{lane.total} done</span>
        </div>
        <KanbanColumns columns={lane.columns} {showAllDone} onshowall={() => (showAllDone = true)} />
      </div>
    {/each}
  {:else}
    <KanbanColumns columns={board} {showAllDone} onshowall={() => (showAllDone = true)} />
  {/if}
</div>
