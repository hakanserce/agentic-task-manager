<script lang="ts">
  // The pages without a project: the overview of all projects, how to add a project when none is registered, and a
  // project the URL names but the server doesn't list (lib/routes.ts)
  import { dashboard } from '../lib/state.svelte';
  import ProjectsOverview from './ProjectsOverview.svelte';
  import TitleBar from './TitleBar.svelte';

  const present = $derived(dashboard.projects.filter((p) => !p.missing));
  const title = $derived(dashboard.route.page === 'overview' ? 'All projects — Task Dashboard' : 'Task Dashboard');
</script>

<TitleBar {title} selector={dashboard.projects.length > 0}>
  {#snippet subtitle()}
    {#if !dashboard.projectsLoaded}
      Loading projects…
    {:else}
      {present.length} project{present.length === 1 ? '' : 's'}
    {/if}
  {/snippet}
</TitleBar>

<main class="landing" id="landing" data-page={dashboard.route.page}>
  {#if dashboard.route.page === 'unknown'}
    <section class="landing-note" id="unknown-project" role="alert">
      <h2>No project “{dashboard.route.id}”</h2>
      <p>
        The atm server doesn't list it, or its folder or tasks.json is gone. <a href="#overview">See all projects</a>.
      </p>
    </section>
  {:else if dashboard.route.page === 'none' || (dashboard.projectsLoaded && present.length === 0)}
    <section class="landing-note" id="no-projects">
      <h2>No projects yet</h2>
      <p>The dashboard shows every project atm works in. To add one:</p>
      <ul>
        <li>run <code>/atm:create-tasks</code> in a project, or</li>
        <li>run <code>atm projects add &lt;path&gt;</code> for a project that already has tasks.</li>
      </ul>
    </section>
  {:else}
    <ProjectsOverview />
  {/if}
</main>
