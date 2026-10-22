<script lang="ts">
  import { dashboardVersion } from '../lib/release-notes';
  import { dashboard } from '../lib/state.svelte';

  const version = dashboardVersion();

  const title = $derived(dashboard.loaded ? dashboard.projectName + ' — Task Dashboard' : 'Task Dashboard');
  const phaseCount = $derived(new Set(dashboard.tasks.map((t) => t.phase)).size);

  $effect(() => {
    document.title = title;
  });
</script>

<div class="title-row">
  <h1 id="dashboard-title">{title}</h1>
  {#if version}
    <button class="version-chip" id="version-chip" title="What's new" onclick={() => dashboard.openWhatsNew()}
      >v{version}</button
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
