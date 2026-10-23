<script lang="ts">
  import { buildBoard, type ColumnId } from '../lib/kanban';
  import { dashboard } from '../lib/state.svelte';
  import { statusStyle } from '../lib/theme';
  import KanbanCard from './KanbanCard.svelte';

  const DONE_LIMIT = 20;

  let showSkipped = $state(false);
  let showAllDone = $state(false);

  const board = $derived(
    buildBoard(dashboard.filtered, dashboard.tasks, { showSkipped, statusFilter: dashboard.filters.status }),
  );

  const columnColor = (id: ColumnId) => (id === 'other' ? 'var(--text-muted)' : statusStyle(id).color);
</script>

<div class="kanban" id="kanban">
  <div class="kanban-toolbar">
    <label class="kanban-option"
      ><input type="checkbox" id="kanban-show-skipped" bind:checked={showSkipped} /> Show skipped</label
    >
  </div>
  <div class="kanban-board">
    {#each board as column (column.id)}
      {@const limited = column.id === 'done' && !showAllDone && column.cards.length > DONE_LIMIT}
      <section class="kanban-column" data-status={column.id} aria-label="{column.label} ({column.cards.length})">
        <header class="kanban-column-header">
          <span class="kanban-column-title" style:color={columnColor(column.id)}>{column.label}</span>
          <span class="kanban-count">{column.cards.length}</span>
        </header>
        <div class="kanban-cards">
          {#each limited ? column.cards.slice(0, DONE_LIMIT) : column.cards as card (card.task.id)}
            <KanbanCard {card} />
          {:else}
            <div class="kanban-empty">No tasks</div>
          {/each}
          {#if limited}
            <button class="kanban-show-all" onclick={() => (showAllDone = true)}
              >Show all ({column.cards.length})</button
            >
          {/if}
        </div>
      </section>
    {/each}
  </div>
</div>
