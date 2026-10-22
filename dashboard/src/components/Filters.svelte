<script lang="ts">
  import { FILTER_GROUPS, filterOptions, isActive, type FilterGroup } from '../lib/filters';
  import { dashboard } from '../lib/state.svelte';
  import RefreshControls from './RefreshControls.svelte';

  const LABELS: Record<FilterGroup, string> = { phase: 'Phase:', type: 'Type:', status: 'Status:' };
  const options = $derived(filterOptions(dashboard.tasks));
</script>

<div class="filters" id="filters">
  {#if dashboard.loaded}
    {#each FILTER_GROUPS as group (group)}
      <!-- svelte-ignore a11y_label_has_associated_control (legacy markup: styled by `.filters label`) -->
      <label>{LABELS[group]}</label>
      {#each [{ value: 'all', label: 'All' }, ...options[group]] as option (option.value)}
        <button
          class="filter-btn"
          class:active={isActive(dashboard.filters, group, option.value)}
          data-filter={group}
          data-value={option.value}
          onclick={() => dashboard.toggleFilter(group, option.value)}>{option.label}</button
        >
      {/each}
      <div class="separator"></div>
    {/each}
    <RefreshControls />
  {/if}
</div>
