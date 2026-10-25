<script lang="ts">
  import { dashboardVersion } from '../lib/release-notes';
  import { dashboard } from '../lib/state.svelte';
  import { needingUser } from '../lib/waiting';
  import AppearanceMenu from './AppearanceMenu.svelte';
  import Filters from './Filters.svelte';
  import RefreshMenu from './RefreshMenu.svelte';
  import ActivityWidget from './ActivityWidget.svelte';
  import ProgressWidget from './ProgressWidget.svelte';

  const version = dashboardVersion();

  const title = $derived(dashboard.loaded ? dashboard.projectName + ' — Task Dashboard' : 'Task Dashboard');
  const phaseCount = $derived(new Set(dashboard.tasks.map((t) => t.phase)).size);
  // Tasks that need the user: in review, or blocked on a question for the user (D-3.3)
  const needYou = $derived(needingUser(dashboard.tasks, dashboard.vocab));

  $effect(() => {
    document.title = title;
  });

  // The header stays pinned at the top; once the page scrolls it compacts and casts a shadow
  let scrolled = $state(false);
</script>

<svelte:window onscroll={() => (scrolled = window.scrollY > 8)} />

<header class="topbar" class:scrolled>
  <div class="title-block">
    <div class="title-row">
      <h1 id="dashboard-title">{title}</h1>
      {#if version}
        <button
          class="version-chip"
          class:unseen={dashboard.releaseNotesUnseen}
          id="version-chip"
          title="What's new"
          onclick={() => dashboard.openWhatsNew()}
          >v{version}{#if dashboard.releaseNotesUnseen}<span class="version-new">new</span>{/if}</button
        >
      {/if}
    </div>
    <p class="subtitle" id="subtitle">
      {#if dashboard.loaded}
        {dashboard.tasks.length} tasks across {phaseCount} phase{phaseCount !== 1 ? 's' : ''} — loaded from tasks.json
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
    </p>
  </div>
  {#if dashboard.loaded}
    <div class="topbar-charts">
      <ProgressWidget />
      <ActivityWidget />
    </div>
  {/if}
  <div class="topbar-controls">
    <RefreshMenu />
    <AppearanceMenu />
  </div>
  <!-- Second row of the title bar: search and filters -->
  <Filters />
</header>
