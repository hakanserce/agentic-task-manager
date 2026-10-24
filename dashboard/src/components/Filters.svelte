<script lang="ts">
  import { FILTER_GROUPS, facetCounts, filterOptions, isActive, type FilterGroup } from '../lib/filters';
  import { dashboard } from '../lib/state.svelte';
  import RefreshControls from './RefreshControls.svelte';

  const LABELS: Record<FilterGroup, string> = { phase: 'Phase:', type: 'Type:', status: 'Status:' };
  const options = $derived(filterOptions(dashboard.tasks));
  // How many tasks each button would show, given the selections in the other groups
  const counts = $derived(facetCounts(dashboard.tasks, dashboard.filters));

  function countOf(group: FilterGroup, value: string): number {
    return value === 'all' ? counts[group].all : (counts[group].values.get(value) ?? 0);
  }

  function ariaLabel(group: FilterGroup, value: string, label: string, n: number): string {
    const name =
      value === 'all'
        ? `All ${group === 'status' ? 'statuses' : group + 's'}`
        : group === 'phase'
          ? `Phase ${label}`
          : label;
    return `${name}, ${n} ${n === 1 ? 'task' : 'tasks'}`;
  }
</script>

<div class="filters" id="filters">
  {#if dashboard.loaded}
    {#each FILTER_GROUPS as group (group)}
      <!-- svelte-ignore a11y_label_has_associated_control (legacy markup: styled by `.filters label`) -->
      <label>{LABELS[group]}</label>
      {#each [{ value: 'all', label: 'All' }, ...options[group]] as option (option.value)}
        {@const n = countOf(group, option.value)}
        {@const active = isActive(dashboard.filters, group, option.value)}
        <button
          class="filter-btn"
          class:active
          class:empty={n === 0 && !active}
          data-filter={group}
          data-value={option.value}
          aria-label={ariaLabel(group, option.value, option.label, n)}
          aria-pressed={active}
          onclick={() => dashboard.toggleFilter(group, option.value)}
          ><span class="filter-label">{option.label}</span><span class="filter-count" aria-hidden="true">{n}</span
          ></button
        >
      {/each}
      <div class="separator"></div>
    {/each}
    <RefreshControls />
    <button
      class="reset-view-btn"
      id="reset-view"
      title="Forget this project's saved filters, tab and options"
      onclick={() => dashboard.resetView()}>Reset view</button
    >
  {/if}
</div>
