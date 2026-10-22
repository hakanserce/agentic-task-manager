<script lang="ts">
  import { onMount } from 'svelte';
  import { dashboard } from './lib/state.svelte';
  import Header from './components/Header.svelte';
  import Stats from './components/Stats.svelte';

  onMount(() => {
    dashboard.load();
  });
</script>

<Header />
<Stats />
