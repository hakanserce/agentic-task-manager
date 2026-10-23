<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboard } from './lib/state.svelte';
  import Header from './components/Header.svelte';
  import Stats from './components/Stats.svelte';
  import Filters from './components/Filters.svelte';
  import ViewPanel from './components/ViewPanel.svelte';
  import TaskGrid from './components/TaskGrid.svelte';
  import DetailPanel from './components/DetailPanel.svelte';
  import WhatsNew from './components/WhatsNew.svelte';

  onMount(() => {
    dashboard.load();
  });
</script>

<Header />
<Stats />
<Filters />
<ViewPanel />
<TaskGrid />
<DetailPanel />
<WhatsNew />
