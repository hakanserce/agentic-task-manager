<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle, phaseColor, typeStyle } from '../lib/theme';
  import { kindOf, phaseLabel, statusLabel } from '../lib/vocab';
  import { actorsLine, earlierAttempts } from '../lib/actors';
  import { noteKindLabel, shortSha, taskNotes } from '../lib/notes';
  import { blockSummary, blockWait, reviewSummary, reviewWait } from '../lib/waiting';
  import { parseMarkdown } from '../lib/markdown';
  import { taskTimes } from '../lib/work';
  import { commitRef } from '../lib/repo';
  import RepoRef from './RepoRef.svelte';
  import LabelChips from './LabelChips.svelte';
  import Markdown from './Markdown.svelte';
  import PriorityBadge from './PriorityBadge.svelte';
  import StageChip from './StageChip.svelte';

  // An archived task opens too (listed with "Include archived")
  const task = $derived(
    dashboard.detailId
      ? (dashboard.taskMap.get(dashboard.detailId) ?? dashboard.archiveMap.get(dashboard.detailId))
      : undefined,
  );
  const archived = $derived(!!task && !dashboard.taskMap.has(task.id));
  // A dependency missing from tasks.json may be archived: load the archive to show it as a stub (D-5.3)
  $effect(() => {
    if (task && dashboard.archivedCount > 0 && (task.dependencies ?? []).some((d) => !dashboard.taskMap.has(d)))
      dashboard.wantArchive();
  });
  const claim = $derived(
    task && kindOf(dashboard.vocab, task.status) === 'active' ? dashboard.claims.get(task.id) : undefined,
  );
  const statusStyle = (status: string) => kindStyle(kindOf(dashboard.vocab, status));
  const review = $derived(task ? reviewWait(task, dashboard.loadedAt, dashboard.vocab) : null);
  const block = $derived(task ? blockWait(task, dashboard.loadedAt, dashboard.vocab) : null);
  const notes = $derived(task ? taskNotes(task) : []);
  const actors = $derived(task ? actorsLine(task) : '');
  const attempts = $derived(task ? earlierAttempts(task) : []);
  const requiredBy = $derived(task ? dashboard.tasks.filter((t) => (t.dependencies ?? []).includes(task.id)) : []);
  // Created, started, sent for review, finished, how long the work took, last updated
  const times = $derived(task ? taskTimes(task, dashboard.loadedAt, dashboard.vocab) : []);

  // Another task opens at its top; the same task re-rendered (auto-refresh, a reload) keeps its scroll position
  let panel: HTMLElement;
  let shownId: string | undefined;
  $effect(() => {
    const id = task?.id;
    if (id !== shownId) {
      shownId = id;
      if (panel) panel.scrollTop = 0;
    }
  });

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
  <div class="detail-panel" id="detail-panel" bind:this={panel}>
    {#if task}
      {@const ts = typeStyle(task.type)}
      {@const ss = statusStyle(task.status)}
      {@const pc = phaseColor(task.phase)}
      <button class="detail-close" onclick={() => dashboard.closeDetail()}>&times;</button>
      <h3>
        <span style="color:var(--text-muted)">{task.id}</span>
        {task.name}{#if archived}<span class="archived-tag" id="detail-archived"> · archived</span>{/if}
      </h3>
      <div class="task-meta" style="margin-bottom:16px">
        <span class="badge" style="background:{ts.bg};color:{ts.color}">{task.type}</span>
        <span class="badge" style="background:{ss.bg};color:{ss.color}"
          >{statusLabel(dashboard.vocab, task.status)}</span
        >
        <span class="phase-badge" style="background:color-mix(in srgb, {pc} 12.5%, transparent);color:{pc}"
          >{phaseLabel(dashboard.vocab, task.phase)}</span
        >
        <PriorityBadge {task} />
        <StageChip {task} />
        <LabelChips {task} />
      </div>
      <div class="detail-section">
        <div class="label">Description</div>
        <!-- Markdown, like Help; every piece of text stays escaped. Heading IDs are prefixed per task -->
        <div class="value detail-description" id="detail-description">
          <Markdown blocks={parseMarkdown(task.description ?? '')} idPrefix="desc-{task.id}-" />
        </div>
      </div>
      {@render badges('Use Cases', task.use_cases ?? [], 'uc-badge')}
      {@render badges('Requirements', task.requirements ?? [], 'req-badge')}
      {#if (task.dependencies ?? []).length}
        <div class="detail-section">
          <div class="label">Depends On</div>
          <div class="detail-deps">
            {#each task.dependencies ?? [] as depId (depId)}
              {@const dep = dashboard.taskMap.get(depId)}
              {@const old = dep ? undefined : dashboard.archiveMap.get(depId)}
              {#if old}
                <div class="detail-dep-item archived" data-archived={depId} title={old.name}>
                  <span class="detail-dep-arrow">←</span>
                  <strong>{depId}</strong>
                  <span style="color:var(--text-muted)"
                    >· archived, {statusLabel(dashboard.vocab, old.status).toLowerCase()}</span
                  >
                </div>
              {:else}
                {@render depItem('←', depId, dep?.name ?? '', dep?.status)}
              {/if}
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
      {#if block}
        <div class="detail-section" id="detail-blocked">
          <div class="label">Blocked</div>
          <div class="value" style="font-size:13px">
            <div><strong>{blockSummary(block)}</strong></div>
            {#if task.blocked_at}
              <div style="color:var(--text-muted)">Since {new Date(task.blocked_at).toLocaleString()}</div>
            {/if}
            {#if block.questions.length}
              <ol class="block-questions">
                {#each block.questions as question, i (i)}<li>{question}</li>{/each}
              </ol>
              <div style="color:var(--text-muted)">
                Answer with <code>atm unblock {task.id} --answer "…"</code>, one per question.
              </div>
            {/if}
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
      {#if actors || attempts.length}
        <div class="detail-section" id="detail-actors">
          <div class="label">Who</div>
          <div class="value" style="font-size:13px">
            {#if actors}<div>{actors}</div>{/if}
            {#if attempts.length}
              <div style="color:var(--text-muted)">Earlier attempts: {attempts.join(', ')}</div>
            {/if}
          </div>
        </div>
      {/if}
      {#if notes.length}
        <div class="detail-section" id="detail-notes">
          <div class="label">Notes</div>
          <ul class="detail-notes">
            {#each notes as note, i (i)}
              <li class="detail-note note-{note.kind}" data-kind={note.kind}>
                <div class="note-head">
                  <span class="note-kind">{noteKindLabel(note.kind)}</span>
                  <span class="note-meta"
                    >{note.by ? `${note.by} · ` : ''}{note.at ? new Date(note.at).toLocaleString() : ''}</span
                  >
                </div>
                <div class="note-text">{note.text}</div>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if task.commit}
        <div class="detail-section" id="detail-commit">
          <div class="label">Commit</div>
          <div class="value">
            <RepoRef ref={commitRef(dashboard.meta, task.commit)} title={task.commit}
              ><code>{shortSha(task.commit)}</code></RepoRef
            >
          </div>
        </div>
      {/if}
      {#if times.length}
        <div class="detail-section" id="detail-times">
          <div class="label">Timestamps</div>
          <div class="value" style="font-size:13px;color:var(--text-muted)">
            {#each times as row, i (row.label)}{#if i}<br />{/if}{row.label}:
              {row.at ? new Date(row.at).toLocaleString() : row.text}{/each}
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
