<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import { dueText, headerSprint, sprintSummary } from '../lib/sprints';

  // Above the Kanban, List and Graph (SR-7.2): the sprint the Sprint filter selects, or the active one when it selects
  // none, with its goal, due date, release, progress and how many tasks were added mid-sprint or carried in
  const sprint = $derived(headerSprint(dashboard.sprints, dashboard.filters.sprint));
  const summary = $derived(
    sprint && sprintSummary(dashboard.sprints, dashboard.history, sprint, dashboard.vocab, dashboard.loadedAt),
  );
  const percent = $derived(summary && summary.total ? Math.round((summary.done / summary.total) * 100) : 0);
</script>

{#if summary}
  <section class="sprint-header" id="sprint-header" data-state={summary.sprint.state} aria-label="Sprint">
    <div class="sprint-title">
      <span class="sprint-label">Sprint</span>
      <strong class="sprint-name">{summary.sprint.id}</strong>
      {#if summary.sprint.state !== 'active'}<span class="sprint-state">{summary.sprint.state}</span>{/if}
      {#if summary.sprint.goal}<span class="sprint-goal">{summary.sprint.goal}</span>{/if}
    </div>
    <div class="sprint-facts">
      {#if summary.dueIn !== undefined}
        <span
          class="sprint-due"
          class:overdue={summary.dueIn < 0}
          title="Due {summary.sprint.due}"
          data-days={summary.dueIn}>{dueText(summary.dueIn)}</span
        >
      {/if}
      {#if summary.sprint.release}<span class="sprint-release">release {summary.sprint.release}</span>{/if}
      <span class="sprint-progress" title="{summary.done} of {summary.total} tasks done ({percent}%)">
        <span class="sprint-bar" aria-hidden="true"><span style:width="{percent}%"></span></span>
        {summary.done} of {summary.total} done
      </span>
      {#if summary.added}<span class="sprint-added" title="Pulled into the sprint after it started"
          >{summary.added} added mid-sprint</span
        >{/if}
      {#if summary.carried}<span class="sprint-carried" title="Carried over from an earlier sprint"
          >{summary.carried} carried in</span
        >{/if}
      {#if summary.reviewPending}<span
          class="sprint-review-pending"
          title="Done, waiting for the end-of-sprint review with you (/atm:close-sprint)"
          >{summary.reviewPending} waiting for the sprint review</span
        >{/if}
    </div>
  </section>
{/if}
