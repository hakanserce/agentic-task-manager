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

  // Remember the view per project (FR-5): every change to filters, tab, panel or board options is saved
  $effect(() => dashboard.saveView());
</script>

<Header />
<Stats />
<Filters />
<ViewPanel />
<TaskGrid />
<DetailPanel />
<WhatsNew />
