<script lang="ts">
  import { releaseSummaries } from '../lib/releases';
  import { dashboard } from '../lib/state.svelte';
  import { safeUrl } from '../lib/url';

  // The releases (SR-7.5): each with its sprints, its tasks by stage, its PR and state, and the notes draft to copy.
  // Over the whole history (archived tasks too, once loaded), whatever the filters: a release ships all its tasks.
  const releases = $derived(releaseSummaries(dashboard.meta, dashboard.history, dashboard.sprints, dashboard.vocab));
  let copied = $state<string | null>(null);

  async function copy(id: string, notes: string) {
    await navigator.clipboard.writeText(notes);
    copied = id;
  }
</script>

{#if releases.length}
  <section class="release-view" id="release-view" aria-label="Releases">
    <h3 class="burndown-title">Releases</h3>
    {#each releases as r (r.release.id)}
      {@const url = safeUrl(r.release.pr?.url)}
      <div class="release-row" data-release={r.release.id} data-state={r.release.state}>
        <div class="release-head">
          <strong class="release-id">{r.release.id}</strong>
          {#if r.release.name}<span class="muted">“{r.release.name}”</span>{/if}
          <span class="sprint-state">{r.release.state}</span>
          {#if r.release.pr}
            {#if url}<a href={url} target="_blank" rel="noopener noreferrer">PR #{r.release.pr.number}</a>{:else}<span
                >PR #{r.release.pr.number}</span
              >{/if}
          {/if}
          {#if r.release.target && r.release.state === 'planned'}<span class="muted">target {r.release.target}</span
            >{/if}
          {#if r.sprints.length}<span class="muted release-sprints">{r.sprints.join(', ')}</span>{/if}
        </div>
        <div class="release-counts">
          {r.done} of {r.total} done · {r.inPr} in PR · {r.merged} merged
        </div>
        <details class="release-notes">
          <summary
            >Notes draft <button class="link-button" onclick={() => copy(r.release.id, r.notes)}
              >{copied === r.release.id ? 'Copied' : 'Copy'}</button
            ></summary
          >
          <pre>{r.notes}</pre>
        </details>
      </div>
    {/each}
  </section>
{/if}
