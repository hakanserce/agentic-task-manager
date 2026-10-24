<script lang="ts">
  import { compareVersions } from '../lib/changelog';
  import { getPref, setPref, storageAvailable } from '../lib/prefs';
  import { dashboardVersion } from '../lib/release-notes';
  import { dashboard } from '../lib/state.svelte';
  import AppearanceMenu from './AppearanceMenu.svelte';
  import Filters from './Filters.svelte';
  import RefreshMenu from './RefreshMenu.svelte';
  import ActivityWidget from './ActivityWidget.svelte';
  import ProgressWidget from './ProgressWidget.svelte';

  const version = dashboardVersion();
  // "New" until the release notes of this version are opened once (FR-1.5). Without working storage we could
  // never clear it, so it is not shown at all.
  const lastSeen = getPref('lastSeenVersion', '');
  let unseen = $state(!!version && storageAvailable() && (lastSeen === '' || compareVersions(version, lastSeen) > 0));

  function openReleaseNotes() {
    dashboard.openWhatsNew();
    if (version) setPref('lastSeenVersion', version);
    unseen = false;
  }

  const title = $derived(dashboard.loaded ? dashboard.projectName + ' — Task Dashboard' : 'Task Dashboard');
  const phaseCount = $derived(new Set(dashboard.tasks.map((t) => t.phase)).size);

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
        <button class="version-chip" class:unseen id="version-chip" title="What's new" onclick={openReleaseNotes}
          >v{version}{#if unseen}<span class="version-new">new</span>{/if}</button
        >
      {/if}
    </div>
    <p class="subtitle" id="subtitle">
      {#if dashboard.loaded}
        {dashboard.tasks.length} tasks across {phaseCount} phase{phaseCount !== 1 ? 's' : ''} — loaded from tasks.json
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
