<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboard } from './lib/state.svelte';
  import Header from './components/Header.svelte';
  import Stats from './components/Stats.svelte';
  import Filters from './components/Filters.svelte';
  import TaskGrid from './components/TaskGrid.svelte';

  onMount(() => {
    dashboard.load();
  });
</script>

<Header />
<Stats />
<Filters />
<TaskGrid />
