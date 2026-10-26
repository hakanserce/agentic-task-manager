<script lang="ts">
  import { dashboardVersion } from '../lib/release-notes';
  import { dashboard } from '../lib/state.svelte';
  import { needingUser } from '../lib/waiting';
  import AppearanceMenu from './AppearanceMenu.svelte';
  import Filters from './Filters.svelte';
  import RefreshMenu from './RefreshMenu.svelte';
  import ActivityWidget from './ActivityWidget.svelte';
  import ProgressWidget from './ProgressWidget.svelte';
  import ProjectLogo from './ProjectLogo.svelte';
  import ProjectSelector from './ProjectSelector.svelte';

  const version = dashboardVersion();
  // The open project, as api/projects lists it: its logo goes next to the title
  const project = $derived.by(() => {
    const route = dashboard.route;
    return route.page === 'project' ? dashboard.projects.find((p) => p.id === route.id) : undefined;
  });

  const title = $derived(dashboard.loaded ? dashboard.projectName + ' — Task Dashboard' : 'Task Dashboard');
  const phaseCount = $derived(new Set(dashboard.tasks.map((t) => t.phase)).size);
  const counts = $derived(`${dashboard.tasks.length} tasks across ${phaseCount} phase${phaseCount !== 1 ? 's' : ''}`);
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
      {#if project}<ProjectLogo {project} size={26} />{/if}
      <h1 id="dashboard-title">{title}</h1>
      <ProjectSelector />
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
