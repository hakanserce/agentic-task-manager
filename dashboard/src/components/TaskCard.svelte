<script lang="ts">
  import { claimSummary } from '../lib/claims';
  import { scrollToTask } from '../lib/scroll';
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle, phaseColor, typeStyle } from '../lib/theme';
  import type { Task } from '../lib/types';
  import { kindOf, phaseLabel, statusLabel, typeLabel } from '../lib/vocab';
  import { reviewSummary, reviewWait } from '../lib/waiting';
  import LabelChips from './LabelChips.svelte';
  import PriorityBadge from './PriorityBadge.svelte';

  let { task }: { task: Task } = $props();

  const pc = $derived(phaseColor(task.phase));
  const ts = $derived(typeStyle(task.type));
  const kind = $derived(kindOf(dashboard.vocab, task.status));
  const ss = $derived(kindStyle(kind));
  const deps = $derived(task.dependencies ?? []);
  const claim = $derived(kind === 'active' ? dashboard.claims.get(task.id) : undefined);
  const review = $derived(reviewWait(task, dashboard.loadedAt, dashboard.vocab));
</script>

<div class="task-card status-{task.status} kind-{kind ?? 'none'}" id="task-{task.id}" data-id={task.id}>
  <div class="task-id">{task.id}</div>
  <div class="task-body">
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="task-name" onclick={() => dashboard.showDetail(task.id)}>{task.name}</div>
    <div class="task-meta">
      <span
        class="badge"
        style="background:color-mix(in srgb, {pc} 12.5%, transparent);color:{pc}"
        title={phaseLabel(dashboard.vocab, task.phase)}>Phase {task.phase}</span
      >
      <span class="badge" style="background:{ts.bg};color:{ts.color}" title={typeLabel(dashboard.vocab, task.type)}
        >{task.type}</span
      >
      <span class="badge" style="background:{ss.bg};color:{ss.color}">{statusLabel(dashboard.vocab, task.status)}</span>
      <PriorityBadge {task} />
      <LabelChips {task} />
      {#if deps.length}
        <span class="deps-label">needs:</span>
        {#each deps as dep (dep)}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions, a11y_missing_attribute -->
          <a class="dep-link" title={dashboard.taskMap.get(dep)?.name || dep} onclick={() => scrollToTask(dep)}>{dep}</a
          >
        {/each}
      {/if}
    </div>
    {#if claim}
      <div class="task-claim" title="Claimed by {claim.agent}">{claimSummary(claim, dashboard.loadedAt)}</div>
    {/if}
    {#if review}
      <div class="task-waiting review-wait" title={review.note?.text}>{reviewSummary(review)}</div>
    {/if}
  </div>
  <div class="task-tags">
    {#each task.use_cases ?? [] as uc (uc)}<span class="uc-badge" title={uc}>{uc}</span
      >{/each}{#each task.requirements ?? [] as req (req)}<span class="req-badge">{req}</span>{/each}
  </div>
</div>
