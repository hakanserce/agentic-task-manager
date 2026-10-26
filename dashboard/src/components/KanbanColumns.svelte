<script lang="ts">
  import type { KanbanColumn } from '../lib/kanban';
  import { doneSections, workflowType } from '../lib/stages';
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle } from '../lib/theme';
  import KanbanCard from './KanbanCard.svelte';

  const DONE_LIMIT = 20;

  let {
    columns,
    showAllDone,
    onshowall,
  }: { columns: KanbanColumn[]; showAllDone: boolean; onshowall: (all: boolean) => void } = $props();

  const columnColor = (column: KanbanColumn) => (column.kind ? kindStyle(column.kind).color : 'var(--text-muted)');
  // In a pull-request project the Done column is split by stage: In PR (per PR), Done, Merged (D-4.2)
  const sectioned = $derived(workflowType(dashboard.meta) === 'pull-request');

  // Columns reach down to the window's bottom (T-237): their height is the space below the board's top on the page,
  // so a tall window shows more cards. A board that starts too far down for that (a lane further down when grouped
  // by phase) gets nearly a window's height, to fill the screen once scrolled to.
  const MIN_HEIGHT = 360;
  const BOTTOM_GAP = 24;
  let board: HTMLElement;
  let viewport = $state(0);
  let height = $state<number>();
  function measure() {
    if (!board || !viewport) return;
    const below = viewport - (board.getBoundingClientRect().top + window.scrollY) - BOTTOM_GAP;
    height = below >= MIN_HEIGHT ? below : Math.max(MIN_HEIGHT, viewport - 4 * BOTTOM_GAP);
  }
  $effect(() => {
    void viewport;
    void columns;
    measure();
  });
  // What's above the board can change its top without a resize of the window (the filter panel, the toolbar)
  $effect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => observer.disconnect();
  });
</script>

<svelte:window bind:innerHeight={viewport} />

<div class="kanban-board" bind:this={board} style:--kanban-height={height === undefined ? undefined : `${height}px`}>
  {#each columns as column (column.id)}
    {@const isDone = column.kind === 'done'}
    {@const limited = isDone && !showAllDone && column.cards.length > DONE_LIMIT}
    <section class="kanban-column" data-status={column.id} aria-label="{column.label} ({column.cards.length})">
      <header class="kanban-column-header">
        <span class="kanban-column-title" style:color={columnColor(column)}>{column.label}</span>
        <span class="kanban-count">{column.cards.length}</span>
      </header>
      <div class="kanban-cards">
        {#if isDone && sectioned && column.cards.length}
          {#each doneSections(column.cards, dashboard.vocab) as section (section.id)}
            {@const cut = section.stage === 'merged' && !showAllDone && section.cards.length > DONE_LIMIT}
            <div class="kanban-section" data-section={section.id}>
              <div class="kanban-section-header">
                {#if section.url}
                  <a href={section.url} target="_blank" rel="noopener noreferrer">{section.label}</a>
                {:else}
                  <span>{section.label}</span>
                {/if}
                <span class="kanban-section-count">{section.cards.length}</span>
              </div>
              {#each cut ? section.cards.slice(0, DONE_LIMIT) : section.cards as card (card.task.id)}
                <KanbanCard {card} />
              {/each}
              {#if cut}
                <button class="kanban-show-all" onclick={() => onshowall(true)}
                  >Show all ({section.cards.length})</button
                >
              {:else if section.stage === 'merged' && showAllDone && section.cards.length > DONE_LIMIT}
                <button class="kanban-show-all" id="kanban-show-fewer" onclick={() => onshowall(false)}
                  >Show the latest {DONE_LIMIT}</button
                >
              {/if}
            </div>
          {/each}
        {:else}
          {#each limited ? column.cards.slice(0, DONE_LIMIT) : column.cards as card (card.task.id)}
            <KanbanCard {card} />
          {:else}
            <div class="kanban-empty">No tasks</div>
          {/each}
          {#if limited}
            <button class="kanban-show-all" onclick={() => onshowall(true)}>Show all ({column.cards.length})</button>
          {:else if isDone && showAllDone && column.cards.length > DONE_LIMIT}
            <button class="kanban-show-all" id="kanban-show-fewer" onclick={() => onshowall(false)}
              >Show the latest {DONE_LIMIT}</button
            >
          {/if}
        {/if}
      </div>
    </section>
  {/each}
</div>
