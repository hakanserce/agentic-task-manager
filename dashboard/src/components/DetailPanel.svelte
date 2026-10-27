<script lang="ts">
  import { tick } from 'svelte';
  import { dashboard } from '../lib/state.svelte';
  import { kindStyle, phaseColor, typeStyle } from '../lib/theme';
  import { kindOf, phaseLabel, statusLabel } from '../lib/vocab';
  import { actorsLine, earlierAttempts } from '../lib/actors';
  import { noteKindLabel, shortSha, taskNotes } from '../lib/notes';
  import { blockSummary, blockWait, reviewSummary, reviewWait } from '../lib/waiting';
  import { parseInline, parseMarkdown } from '../lib/markdown';
  import { taskTimes } from '../lib/work';
  import { commitRef } from '../lib/repo';
  import RepoRef from './RepoRef.svelte';
  import BranchChip from './BranchChip.svelte';
  import LabelChips from './LabelChips.svelte';
  import Markdown from './Markdown.svelte';
  import PriorityBadge from './PriorityBadge.svelte';
  import StageChip from './StageChip.svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from '../lib/icons';
  import type { Task } from '../lib/types';

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

  // The sections in groups, one rail entry each (T-280); only the groups the task has
  const groups = $derived.by(() => {
    if (!task) return [];
    const list: { id: string; label: string; icon: IconName }[] = [{ id: 'info', label: 'Info', icon: 'file-text' }];
    if ((task.dependencies ?? []).length || requiredBy.length)
      list.push({ id: 'dependencies', label: 'Dependencies', icon: 'network' });
    if (notes.length) list.push({ id: 'notes', label: 'Notes', icon: 'message-square' });
    if (claim || actors || attempts.length || task.commit || times.length)
      list.push({ id: 'activity', label: 'Activity', icon: 'history' });
    list.push({ id: 'ref', label: 'Ref', icon: 'paperclip' });
    return list;
  });

  // The sections scroll without a scrollbar, like the Kanban columns: a fade at a cut-off edge, and the rail
  // highlights the group in view
  let body = $state<HTMLElement>();
  let active = $state('info');
  // Sections at least partly cut off above and below, for "▲ N more" / "▼ N more" (as in the Kanban columns)
  let above = $state(0);
  let below = $state(0);
  // A rail click puts its group at the top, with empty space below the last section when the content is too short
  // for that. The space only shrinks: scrolling back up takes away what is no longer needed, and the wheel or a hint
  // never adds any.
  let spacer = $state(0);
  let jumpTo: number | null = null;
  function update() {
    if (!body) return;
    const top = body.scrollTop;
    const bottom = top + body.clientHeight;
    const content = body.scrollHeight - spacer;
    // Arrived (scrollend does it too, where the browser has it); not before, or the space would shrink under it
    if (jumpTo !== null && Math.abs(top - jumpTo) < 0.5) jumpTo = null;
    if (jumpTo === null && spacer > 0) spacer = Math.min(spacer, Math.max(0, Math.ceil(bottom - content)));
    const cutBottom = bottom < content - 1;
    let a = 0;
    let b = 0;
    for (const s of body.querySelectorAll<HTMLElement>('.detail-section')) {
      if (s.offsetTop < top - 1) a++;
      else if (s.offsetTop + s.offsetHeight > bottom + 1) b++;
    }
    above = a;
    below = b;
    const sections = [...body.querySelectorAll<HTMLElement>('[data-group]')];
    // At the bottom, the last group is the one in view even when it's too short to reach the top (unless a rail click
    // made room to bring its group up)
    if (jumpTo !== null) return;
    let current = sections[0]?.dataset.group ?? 'info';
    if (top > 0 && !cutBottom && !spacer && sections.length) current = sections[sections.length - 1].dataset.group!;
    else for (const s of sections) if (s.offsetTop <= top + HINT_HEIGHT + 4) current = s.dataset.group!;
    active = current;
  }
  // The wheel, a touch or a hint takes over from a rail click still under way
  const manual = () => (jumpTo = null);
  $effect(() => {
    if (!body) return;
    update();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    resize?.observe(body);
    const mutation = new MutationObserver(update);
    mutation.observe(body, { childList: true, subtree: true });
    return () => {
      resize?.disconnect();
      mutation.disconnect();
    };
  });
  function page(direction: 1 | -1) {
    manual();
    body?.scrollBy({ top: direction * body.clientHeight * 0.85, behavior: 'smooth' });
  }
  // A group scrolled to sits just below the "▲ N more" hint, which covers the top of the sections (.kanban-more.top)
  const HINT_HEIGHT = 28;
  async function jump(id: string) {
    const target = body?.querySelector<HTMLElement>(`[data-group="${id}"]`);
    if (!body || !target) return;
    // Measured, not offsetTop, which is rounded to whole pixels
    const at = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop;
    const top = at > 1 ? Math.round(at - HINT_HEIGHT) : 0;
    const content = body.scrollHeight - spacer;
    spacer = Math.max(spacer, Math.ceil(top + body.clientHeight - content));
    jumpTo = top;
    active = id;
    await tick();
    body.scrollTo({ top, behavior: 'smooth' });
  }

  // Another task opens at its top; the same task re-rendered (auto-refresh, a reload) keeps its scroll position
  let shownId: string | undefined;
  $effect(() => {
    const id = task?.id;
    if (id !== shownId) {
      shownId = id;
      spacer = 0;
      jumpTo = null;
      if (body) body.scrollTop = 0;
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
  <div class="detail-panel" id="detail-panel">
    {#if task}
      {@const ts = typeStyle(task.type)}
      {@const ss = statusStyle(task.status)}
      {@const pc = phaseColor(task.phase)}
      <div class="detail-head">
        <h3>
          <span style="color:var(--text-muted)">{task.id}</span>
          {task.name}{#if archived}<span class="archived-tag" id="detail-archived"> · archived</span>{/if}
        </h3>
        <button class="detail-close" aria-label="Close" onclick={() => dashboard.closeDetail()}>&times;</button>
      </div>
      <div class="task-meta" style="margin-bottom:12px">
        <span class="badge" style="background:{ts.bg};color:{ts.color}">{task.type}</span>
        <span class="badge" style="background:{ss.bg};color:{ss.color}"
          >{statusLabel(dashboard.vocab, task.status)}</span
        >
        <span class="phase-badge" style="background:color-mix(in srgb, {pc} 12.5%, transparent);color:{pc}"
          >{phaseLabel(dashboard.vocab, task.phase)}</span
        >
        <PriorityBadge {task} />
        <StageChip {task} />
        <BranchChip {task} />
        <LabelChips {task} />
      </div>
      <div class="detail-main">
        <nav class="detail-rail" id="detail-rail" aria-label="Sections">
          {#each groups as g (g.id)}
            <button
              class="detail-rail-item"
              class:active={active === g.id}
              data-group={g.id}
              aria-label={g.label}
              aria-current={active === g.id ? 'true' : undefined}
              title={g.label}
              onclick={() => jump(g.id)}
            >
              <span class="detail-rail-label">{g.label}</span>
              <Icon name={g.icon} size={14} />
            </button>
          {/each}
        </nav>
        <div class="detail-scroll">
          {#if above}
            <button class="kanban-more top" aria-label="Scroll up: {above} more" onclick={() => page(-1)}
              >▲ {above} more</button
            >
          {/if}
          <div
            class="detail-body"
            id="detail-body"
            bind:this={body}
            onscroll={update}
            onscrollend={() => {
              manual();
              update();
            }}
            onwheel={manual}
            ontouchstart={manual}
          >
            {@render sections(task)}
            {#if spacer}<div class="detail-spacer" style="height:{spacer}px"></div>{/if}
          </div>
          {#if below}
            <button class="kanban-more bottom" aria-label="Scroll down: {below} more" onclick={() => page(1)}
              >▼ {below} more</button
            >
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

{#snippet sections(task: Task)}
  <div class="detail-group" data-group="info">
    {@render waiting(task)}
    <div class="detail-section">
      <div class="label">Description</div>
      <!-- Markdown, like Help; every piece of text stays escaped. Heading IDs are prefixed per task -->
      <div class="value detail-description" id="detail-description">
        <Markdown blocks={parseMarkdown(task.description ?? '')} idPrefix="desc-{task.id}-" />
      </div>
    </div>
  </div>
  {#if (task.dependencies ?? []).length || requiredBy.length}
    <div class="detail-group" data-group="dependencies">
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
    </div>
  {/if}
  {#if notes.length}
    <div class="detail-group" data-group="notes">
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
              <div class="note-text">
                <Markdown blocks={parseMarkdown(note.text)} idPrefix="note-{task.id}-{i}-" />
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  {/if}
  {#if claim || actors || attempts.length || task.commit || times.length}
    <div class="detail-group" data-group="activity">
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
      {#if times.length}
        <div class="detail-section" id="detail-times">
          <div class="label">Timestamps</div>
          <div class="value" style="font-size:13px;color:var(--text-muted)">
            {#each times as row, i (row.label)}{#if i}<br />{/if}{row.label}:
              {row.at ? new Date(row.at).toLocaleString() : row.text}{/each}
          </div>
        </div>
      {/if}
      {#if task.commit}
        {@const ref = commitRef(dashboard.meta, task.commit)}
        <div class="detail-section" id="detail-commit">
          <div class="label">Commit</div>
          <div class="value">
            <RepoRef {ref} title={task.commit}><code>{shortSha(task.commit)}</code></RepoRef>
            <!-- The dashboard doesn't know whether the commit was pushed: a task in a PR or merged was -->
            {#if ref.kind === 'link' && !task.pr && !task.merged_at}
              <span class="commit-unpushed" id="detail-commit-note">The link works once the commit is pushed</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
  <div class="detail-group" data-group="ref">
    {@render badges('Use Cases', task.use_cases ?? [], 'uc-badge')}
    {@render badges('Requirements', task.requirements ?? [], 'req-badge')}
    <div class="detail-section">
      <div class="label">Files</div>
      <div class="detail-files">
        {#each task.files ?? [] as file (file)}<div>{file}</div>{:else}<span style="color:var(--text-muted)"
            >None specified</span
          >{/each}
      </div>
    </div>
  </div>
{/snippet}

<!-- Why the task waits, if it does: above the description, the first thing to read -->
{#snippet waiting(task: Task)}
  {#if review}
    <div class="detail-section" id="detail-review">
      <div class="label">In review</div>
      <div class="value" style="font-size:13px">
        <div><strong>{reviewSummary(review)}</strong></div>
        <div style="color:var(--text-muted)">Since {new Date(review.since).toLocaleString()}</div>
        {#if review.note}<div class="review-note">
            <Markdown blocks={parseMarkdown(review.note.text)} idPrefix="review-{task.id}-" />
          </div>{/if}
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
            {#each block.questions as question, i (i)}<li><Markdown inline={parseInline(question)} /></li>{/each}
          </ol>
          <div style="color:var(--text-muted)">
            Answer with <code>atm unblock {task.id} --answer "…"</code>, one per question.
          </div>
        {/if}
      </div>
    </div>
  {/if}
{/snippet}

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
  <div class="detail-dep-item" onclick={() => dashboard.showDetail(id)} title={name}>
    <span class="detail-dep-arrow">{arrow}</span>
    <strong>{id}</strong>
    <span class="detail-dep-name">{name}</span>
    {#if status !== undefined}
      {@const ds = statusStyle(status)}
      <span class="badge" style="background:{ds.bg};color:{ds.color};margin-left:auto"
        >{statusLabel(dashboard.vocab, status)}</span
      >
    {/if}
  </div>
{/snippet}
