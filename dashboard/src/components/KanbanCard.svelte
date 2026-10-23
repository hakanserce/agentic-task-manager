<script lang="ts">
  import type { KanbanCard } from '../lib/kanban';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor, typeStyle } from '../lib/theme';

  let { card }: { card: KanbanCard } = $props();
  const task = $derived(card.task);
  const pc = $derived(phaseColor(task.phase));
  const ts = $derived(typeStyle(task.type));

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dashboard.showDetail(task.id);
    }
  }
</script>

<div
  class="kanban-card status-{task.status}"
  class:next-up={card.nextUp}
  data-id={task.id}
  role="button"
  tabindex="0"
  onclick={() => dashboard.showDetail(task.id)}
  onkeydown={onKeydown}
>
  <div class="kanban-card-top">
    <span class="kanban-card-id">{task.id}</span>
    <span class="badge" style="background:{pc}20;color:{pc}">P{task.phase}</span>
    <span class="badge" style="background:{ts.bg};color:{ts.color}">{task.type}</span>
    {#if card.nextUp}<span class="kanban-next-up">Next up</span>{/if}
  </div>
  <div class="kanban-card-name">{task.name}</div>
  {#if card.readiness}
    {#if card.readiness.ready}
      <div class="kanban-readiness ready">Ready</div>
    {:else}
      <div class="kanban-readiness waiting">Waiting on {card.readiness.waitingOn.join(', ')}</div>
    {/if}
  {/if}
</div>
