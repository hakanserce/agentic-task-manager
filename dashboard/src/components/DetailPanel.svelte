<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle, phaseColor, typeStyle } from '../lib/theme';
  import { kindOf, phaseLabel, statusLabel } from '../lib/vocab';
  import { reviewSummary, reviewWait } from '../lib/waiting';
  import PriorityBadge from './PriorityBadge.svelte';

  const task = $derived(dashboard.detailId ? dashboard.taskMap.get(dashboard.detailId) : undefined);
  const claim = $derived(
    task && kindOf(dashboard.vocab, task.status) === 'active' ? dashboard.claims.get(task.id) : undefined,
  );
  const statusStyle = (status: string) => kindStyle(kindOf(dashboard.vocab, status));
  const review = $derived(task ? reviewWait(task, dashboard.loadedAt, dashboard.vocab) : null);
  const requiredBy = $derived(task ? dashboard.tasks.filter((t) => (t.dependencies ?? []).includes(task.id)) : []);

  function onOverlayClick(e: MouseEvent) {
    if (e.target === e.currentTarget) dashboard.closeDetail();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') dashboard.closeDetail();
  }
</script>

<svelte:document onkeydown={onKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions (Escape closes, see above) -->
<div class="detail-overlay" class:open={dashboard.detailOpen} id="detail-overlay" onclick={onOverlayClick}>
  <div class="detail-panel" id="detail-panel">
    {#if task}
      {@const ts = typeStyle(task.type)}
      {@const ss = statusStyle(task.status)}
      {@const pc = phaseColor(task.phase)}
      <button class="detail-close" onclick={() => dashboard.closeDetail()}>&times;</button>
      <h3><span style="color:var(--text-muted)">{task.id}</span> {task.name}</h3>
      <div class="task-meta" style="margin-bottom:16px">
        <span class="badge" style="background:{ts.bg};color:{ts.color}">{task.type}</span>
        <span class="badge" style="background:{ss.bg};color:{ss.color}"
          >{statusLabel(dashboard.vocab, task.status)}</span
        >
        <span class="phase-badge" style="background:color-mix(in srgb, {pc} 12.5%, transparent);color:{pc}"
          >{phaseLabel(dashboard.vocab, task.phase)}</span
        >
        <PriorityBadge {task} />
      </div>
      <div class="detail-section">
        <div class="label">Description</div>
        <div class="value">{task.description}</div>
      </div>
      {@render badges('Use Cases', task.use_cases ?? [], 'uc-badge')}
      {@render badges('Requirements', task.requirements ?? [], 'req-badge')}
      {#if (task.dependencies ?? []).length}
        <div class="detail-section">
          <div class="label">Depends On</div>
          <div class="detail-deps">
            {#each task.dependencies ?? [] as depId (depId)}
              {@const dep = dashboard.taskMap.get(depId)}
              {@render depItem('←', depId, dep?.name ?? '', dep?.status)}
            {/each}
          </div>
        </div>
      {/if}
      {#if requiredBy.length}
        <div class="detail-section">
          <div class="label">Required By</div>
          <div class="detail-deps">
            {#each requiredBy as dep (dep.id)}
              {@render depItem('→', dep.id, dep.name, dep.status)}
            {/each}
          </div>
        </div>
      {/if}
      {#if review}
        <div class="detail-section" id="detail-review">
          <div class="label">In review</div>
          <div class="value" style="font-size:13px">
            <div><strong>{reviewSummary(review)}</strong></div>
            <div style="color:var(--text-muted)">Since {new Date(review.since).toLocaleString()}</div>
            {#if review.note}<div class="review-note">{review.note.text}</div>{/if}
          </div>
        </div>
      {/if}
      {#if claim}
        {@const since = new Date(claim.claimed_at).toLocaleString()}
        {@const until = new Date(claim.lease_expires_at).toLocaleTimeString()}
        <div class="detail-section" id="detail-claim">
          <div class="label">Claimed by</div>
          <div class="value" style="font-size:13px">
            <div><strong>{claim.agent}</strong>{claim.branch ? ` on ${claim.branch}` : ''}</div>
            <div style="color:var(--text-muted)">Since {since} · lease until {until}</div>
            {#if claim.worktree}<div style="color:var(--text-muted)">{claim.worktree}</div>{/if}
          </div>
        </div>
      {/if}
      {#if task.created_at || task.updated_at}
        <div class="detail-section">
          <div class="label">Timestamps</div>
          <div class="value" style="font-size:13px;color:var(--text-muted)">
            {#if task.created_at}Created: {new Date(task.created_at).toLocaleString()}<br
              />{/if}{#if task.updated_at}Updated:
              {new Date(task.updated_at).toLocaleString()}{/if}
          </div>
        </div>
      {/if}
      <div class="detail-section">
        <div class="label">Files</div>
        <div class="detail-files">
          {#each task.files ?? [] as file (file)}<div>{file}</div>{:else}<span style="color:var(--text-muted)"
              >None specified</span
            >{/each}
        </div>
      </div>
    {/if}
  </div>
</div>

{#snippet badges(label: string, items: string[], cls: string)}
  <div class="detail-section">
    <div class="label">{label}</div>
    <div class="value">
      {#each items as item, i (item)}{i > 0 ? ' ' : ''}<span class={cls}>{item}</span>{:else}<span
          style="color:var(--text-muted)">None</span
        >{/each}
    </div>
  </div>
{/snippet}

{#snippet depItem(arrow: string, id: string, name: string, status: string | undefined)}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="detail-dep-item" onclick={() => dashboard.showDetail(id)}>
    <span class="detail-dep-arrow">{arrow}</span>
    <strong>{id}</strong>
    {name}
    {#if status !== undefined}
      {@const ds = statusStyle(status)}
      <span class="badge" style="background:{ds.bg};color:{ds.color};margin-left:auto"
        >{statusLabel(dashboard.vocab, status)}</span
      >
    {/if}
  </div>
{/snippet}
