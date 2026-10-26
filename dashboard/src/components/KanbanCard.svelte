<script lang="ts">
  import { claimSummary } from '../lib/claims';
  import type { KanbanCard } from '../lib/kanban';
  import { dashboard } from '../lib/state.svelte';
  import { phaseColor, typeStyle } from '../lib/theme';
  import { kindOf } from '../lib/vocab';
  import { blockSummary, blockWait, reviewSummary, reviewWait } from '../lib/waiting';
  import BranchChip from './BranchChip.svelte';
  import LabelChips from './LabelChips.svelte';
  import PriorityBadge from './PriorityBadge.svelte';
  import StageChip from './StageChip.svelte';

  let { card }: { card: KanbanCard } = $props();
  const task = $derived(card.task);
  const pc = $derived(phaseColor(task.phase));
  const ts = $derived(typeStyle(task.type));
  const kind = $derived(kindOf(dashboard.vocab, task.status));
  const claim = $derived(kind === 'active' ? dashboard.claims.get(task.id) : undefined);
  const review = $derived(reviewWait(task, dashboard.loadedAt, dashboard.vocab));
  const block = $derived(blockWait(task, dashboard.loadedAt, dashboard.vocab));

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      dashboard.showDetail(task.id);
    }
  }
</script>

<div
  class="kanban-card status-{task.status} kind-{kind ?? 'none'}"
  class:next-up={card.nextUp}
  data-id={task.id}
  role="button"
  tabindex="0"
  onclick={() => dashboard.showDetail(task.id)}
  onkeydown={onKeydown}
>
  <div class="kanban-card-top">
    <span class="kanban-card-id">{task.id}</span>
    <span class="badge" style="background:color-mix(in srgb, {pc} 12.5%, transparent);color:{pc}"
      >Phase {task.phase}</span
    >
    <span class="badge" style="background:{ts.bg};color:{ts.color}">{task.type}</span>
    <PriorityBadge {task} />
    <StageChip {task} />
    <BranchChip {task} />
    <LabelChips {task} />
    {#if card.nextUp}<span class="kanban-next-up">Next up</span>{/if}
  </div>
  <div class="kanban-card-name">{task.name}</div>
  {#if claim}
    <div class="kanban-claim" title="Claimed by {claim.agent}">{claimSummary(claim, dashboard.loadedAt)}</div>
  {/if}
  {#if review}
    <div class="kanban-waiting review-wait" title={review.note?.text}>{reviewSummary(review)}</div>
  {/if}
  {#if block}
    <div class="kanban-waiting block-wait" class:on-user={block.on === 'user'} title={block.questions.join('\n')}>
      {blockSummary(block)}
    </div>
  {/if}
  {#if card.readiness}
    {#if card.readiness.ready}
      <div class="kanban-readiness ready">Ready</div>
    {:else}
      <div class="kanban-readiness waiting">Waiting on {card.readiness.waitingOn.join(', ')}</div>
    {/if}
  {/if}
</div>
