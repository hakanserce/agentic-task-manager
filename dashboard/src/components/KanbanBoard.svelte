<script lang="ts">
  import { BACKLOG } from '../lib/filters';
  import { share } from '../lib/insights';
  import { buildBoard, buildLanes } from '../lib/kanban';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor } from '../lib/theme';
  import KanbanColumns from './KanbanColumns.svelte';
  import Ring from './Ring.svelte';

  const showAllDone = $derived(dashboard.kanbanShowAllDone);
  // Both options are part of the project's saved view (dashboard state)
  const groupBySprint = $derived(dashboard.kanbanGroupBySprint);
  const showSkipped = $derived(dashboard.kanbanShowSkipped);
  // Cards name their sprint only when the board shows more than one (SR-7.3); a lane names its own
  const showSprint = $derived(
    !groupBySprint && new Set(dashboard.filtered.map((t) => dashboard.sprints.sprintOf(t) ?? BACKLOG)).size > 1,
  );
  const laneColor = (index: number) => (index < 0 ? 'var(--text-muted)' : phaseColor(index));

  const options = $derived({
    showSkipped,
    statusFilter: dashboard.filters.status,
    vocab: dashboard.vocab,
    sprints: dashboard.sprints,
  });
  const board = $derived(groupBySprint ? [] : buildBoard(dashboard.filtered, dashboard.tasks, options));
  const lanes = $derived(groupBySprint ? buildLanes(dashboard.filtered, dashboard.tasks, options) : []);
  // Completion of the tasks the search and filters leave, counted as everywhere else: skipped ones apart (T-162)
  const shown = $derived(share('shown', 'Tasks shown', dashboard.filtered, dashboard.vocab));
  const shownTitle = $derived(
    `Tasks shown: ${shown.done} of ${shown.total} done` + (shown.skipped ? `, ${shown.skipped} skipped` : ''),
  );
</script>

<div class="kanban" class:grouped={groupBySprint} id="kanban">
  <div class="kanban-toolbar">
    <div class="kanban-completion" id="kanban-completion" title={shownTitle}>
      <Ring ratio={shown.ratio} color="var(--green)" size={20} stroke={3} label="Tasks shown" bare />
      <span class="kanban-completion-text" id="kanban-completion-text">
        <strong class="kanban-completion-pct">{Math.round(shown.ratio * 100)}%</strong>
        · {shown.done} of {shown.total} done
        {#if shown.skipped}<span class="skipped-note">· {shown.skipped} skipped</span>{/if}
      </span>
    </div>
    <label class="kanban-option"
      ><input
        type="checkbox"
        id="kanban-group-by-sprint"
        checked={groupBySprint}
        onchange={(e) => (dashboard.kanbanGroupBySprint = e.currentTarget.checked)}
      /> Group by sprint</label
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
  {#if groupBySprint}
    {#each lanes as lane (lane.key)}
      {@const color = laneColor(lane.index)}
      <div class="kanban-lane" data-sprint={lane.key}>
        <div class="kanban-lane-header">
          <span class="phase-badge" style="background:color-mix(in srgb, {color} 12.5%, transparent);color:{color}"
            >{lane.key === BACKLOG ? 'Backlog' : lane.key}</span
          >
          <span class="kanban-lane-progress">{lane.done}/{lane.total} done</span>
        </div>
        <KanbanColumns columns={lane.columns} {showAllDone} onshowall={(all) => (dashboard.kanbanShowAllDone = all)} />
      </div>
    {/each}
  {:else}
    <KanbanColumns
      columns={board}
      {showAllDone}
      {showSprint}
      onshowall={(all) => (dashboard.kanbanShowAllDone = all)}
    />
  {/if}
</div>
