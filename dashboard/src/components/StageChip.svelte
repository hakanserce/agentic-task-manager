<script lang="ts">
  import { prOf, stageOf } from '../lib/stages';
  import { dashboard } from '../lib/state.svelte';
  import type { Task } from '../lib/types';

  // A done task's stage when it has one (D-4.2): "PR #12", linking to the PR, or "Merged"; nothing otherwise
  let { task }: { task: Task } = $props();
  const stage = $derived(stageOf(task, dashboard.vocab));
  const pr = $derived(prOf(task));
</script>

{#if stage === 'in_pr' && pr}
  {#if pr.url}
    <a
      class="stage-chip in-pr"
      data-stage="in_pr"
      href={pr.url}
      target="_blank"
      rel="noopener noreferrer"
      title="In pull request #{pr.number}"
      onclick={(e) => e.stopPropagation()}>PR #{pr.number}</a
    >
  {:else}
    <span class="stage-chip in-pr" data-stage="in_pr" title="In pull request #{pr.number}">PR #{pr.number}</span>
  {/if}
{:else if stage === 'merged'}
  <span
    class="stage-chip merged"
    data-stage="merged"
    title="Merged{pr ? ` in #${pr.number}` : ''}{task.merged_at
      ? ` on ${new Date(task.merged_at).toLocaleString()}`
      : ''}">Merged</span
  >
{/if}
