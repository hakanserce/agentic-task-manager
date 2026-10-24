<script lang="ts">
  import { MODE_LABELS, MODE_PREFS, THEMES } from '../lib/appearance';
  import { compareVersions } from '../lib/changelog';
  import { getPref, setPref, storageAvailable } from '../lib/prefs';
  import { dashboardVersion } from '../lib/release-notes';
  import { dashboard } from '../lib/state.svelte';

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
</script>

<div class="title-row">
  <h1 id="dashboard-title">{title}</h1>
  {#if version}
    <button class="version-chip" class:unseen id="version-chip" title="What's new" onclick={openReleaseNotes}
      >v{version}{#if unseen}<span class="version-new">new</span>{/if}</button
    >
  {/if}
  <select
    class="theme-select"
    id="theme-select"
    aria-label="Theme"
    value={dashboard.theme}
    onchange={(e) => dashboard.setTheme(e.currentTarget.value)}
  >
    {#each THEMES as theme (theme.id)}<option value={theme.id}>{theme.name}</option>{/each}
  </select>
  <div class="appearance" role="group" aria-label="Color mode" id="mode-control">
    {#each MODE_PREFS as pref (pref)}
      <button
        class="mode-btn"
        class:active={dashboard.modePref === pref}
        data-mode={pref}
        aria-pressed={dashboard.modePref === pref}
        onclick={() => dashboard.setModePref(pref)}>{MODE_LABELS[pref]}</button
      >
    {/each}
  </div>
</div>
<p class="subtitle" id="subtitle">
  {#if dashboard.loaded}
    {dashboard.tasks.length} tasks across {phaseCount} phase{phaseCount !== 1 ? 's' : ''} — loaded from tasks.json
  {:else}
    Loading tasks.json…
  {/if}
</p>
