<script lang="ts">
  // The title bar of the current page: a project's (counts, charts, filters), or a page without a project (the
  // overview of all projects, how to add a project, an unknown project; lib/routes.ts)
  import { dashboard } from '../lib/state.svelte';
  import { needingUser } from '../lib/waiting';
  import Filters from './Filters.svelte';
  import ActivityWidget from './ActivityWidget.svelte';
  import ProgressWidget from './ProgressWidget.svelte';
  import TitleBar from './TitleBar.svelte';

  const onProject = $derived(dashboard.route.page === 'project');
  const title = $derived(
    onProject
      ? dashboard.loaded
        ? dashboard.projectName + ' — Task Dashboard'
        : 'Task Dashboard'
      : dashboard.route.page === 'overview'
        ? 'All projects — Task Dashboard'
        : 'Task Dashboard',
  );
  const phaseCount = $derived(new Set(dashboard.tasks.map((t) => t.phase)).size);
  const counts = $derived(`${dashboard.tasks.length} tasks across ${phaseCount} phase${phaseCount !== 1 ? 's' : ''}`);
  // Tasks that need the user: in review, or blocked on a question for the user (D-3.3)
  const needYou = $derived(needingUser(dashboard.tasks, dashboard.vocab));
  const present = $derived(dashboard.projects.filter((p) => !p.missing));
</script>

{#if onProject}
  <TitleBar {title}>
    {#snippet subtitle()}
      {#if dashboard.loaded}
        <!-- One text node when nothing is archived, as before the archive existed (screenshots compare glyphs exactly) -->
        {#if dashboard.archivedCount}
          {counts} · <span id="archived-count">{dashboard.archivedCount} archived</span> — loaded from tasks.json
        {:else}
          {counts} — loaded from tasks.json
        {/if}
        {#if needYou.length}
          <button
            class="attention-chip"
            id="attention-count"
            title={needYou.map((t) => `${t.id} ${t.name}`).join('\n')}
            onclick={() => dashboard.selectTab('kanban')}
            >{needYou.length} need{needYou.length === 1 ? 's' : ''} you</button
          >
        {/if}
      {:else}
        Loading tasks.json…
      {/if}
    {/snippet}
    {#snippet charts()}
      {#if dashboard.loaded}
        <div class="topbar-charts">
          <ProgressWidget />
          <ActivityWidget />
        </div>
      {/if}
    {/snippet}
    {#snippet below()}
      <!-- Second row of the title bar: search and filters -->
      <Filters />
    {/snippet}
  </TitleBar>
{:else}
  <TitleBar {title} selector={dashboard.projects.length > 0}>
    {#snippet subtitle()}
      {#if !dashboard.projectsLoaded}
        Loading projects…
      {:else}
        {present.length} project{present.length === 1 ? '' : 's'}
      {/if}
    {/snippet}
  </TitleBar>
{/if}
