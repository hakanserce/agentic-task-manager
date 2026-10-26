<script lang="ts">
  // All projects at a glance (docs/multi-project-dashboard-proposal.md 3.5): a card per project, those that need you
  // first; "Active only" hides projects with no open work and nothing done lately
  import { ACTIVE_DAYS, isActive, orderProjects } from '../lib/projects';
  import { dashboard } from '../lib/state.svelte';
  import ProjectCard from './ProjectCard.svelte';

  const ordered = $derived(orderProjects(dashboard.projects));
  const shown = $derived(
    dashboard.overviewActiveOnly ? ordered.filter((p) => isActive(p, dashboard.loadedAt)) : ordered,
  );
  const hidden = $derived(ordered.length - shown.length);
</script>

<section class="projects-overview" id="projects-overview">
  <div class="projects-toolbar">
    <label
      class="projects-active-only"
      title="Hide projects with no open tasks and no activity in the last {ACTIVE_DAYS} days"
      ><input
        type="checkbox"
        id="active-projects-only"
        checked={dashboard.overviewActiveOnly}
        onchange={(e) => dashboard.setOverviewActiveOnly(e.currentTarget.checked)}
      /> Active only</label
    >
    {#if hidden}
      <span class="projects-hidden" id="projects-hidden">{hidden} inactive project{hidden === 1 ? '' : 's'} hidden</span
      >
    {/if}
  </div>
  <div class="projects-grid" id="projects-grid">
    {#each shown as project (project.id)}
      <ProjectCard {project} />
    {/each}
  </div>
</section>
