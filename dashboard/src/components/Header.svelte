<script lang="ts">
  import { dashboard } from '../lib/state.svelte';

  const title = $derived(dashboard.loaded ? dashboard.projectName + ' — Task Dashboard' : 'Task Dashboard');
  const phaseCount = $derived(new Set(dashboard.tasks.map((t) => t.phase)).size);

  $effect(() => {
    document.title = title;
  });
</script>

<h1 id="dashboard-title">{title}</h1>
<p class="subtitle" id="subtitle">
  {#if dashboard.loaded}
    {dashboard.tasks.length} tasks across {phaseCount} phase{phaseCount !== 1 ? 's' : ''} — loaded from tasks.json
  {:else}
    Loading tasks.json…
  {/if}
</p>
