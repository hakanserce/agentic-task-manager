<script lang="ts">
  import { onMount } from 'svelte';
  import { applyAppearance } from './lib/appearance';
  import { dashboard } from './lib/state.svelte';
  import Header from './components/Header.svelte';
  import ViewPanel from './components/ViewPanel.svelte';
  import LoadError from './components/LoadError.svelte';
  import DetailPanel from './components/DetailPanel.svelte';
  import WhatsNew from './components/WhatsNew.svelte';
  import Footer from './components/Footer.svelte';
  import AboutDialog from './components/AboutDialog.svelte';
  import HelpDialog from './components/HelpDialog.svelte';
  import LandingPage from './components/LandingPage.svelte';

  onMount(() => {
    dashboard.load();
    // "System" mode follows the OS setting while the page is open
    const query = matchMedia('(prefers-color-scheme: light)');
    const onChange = () => (dashboard.systemPrefersLight = query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  $effect(() => applyAppearance(document.documentElement, dashboard.theme, dashboard.mode));

  // Remember the view per project (FR-5): every change to filters, tab, panel or board options is saved
  $effect(() => dashboard.saveView());
</script>

{#if dashboard.route.page === 'project'}
  <Header />
  <ViewPanel />
{:else}
  <LandingPage />
{/if}
<Footer />
<LoadError />
<DetailPanel />
<WhatsNew />
<AboutDialog />
<HelpDialog />

<svelte:window onhashchange={() => dashboard.onHashChange()} />
