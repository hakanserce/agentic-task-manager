<script lang="ts">
  import { FILTER_GROUPS, facetCounts, filterOptions, isActive, type FilterGroup } from '../lib/filters';
  import { dashboard } from '../lib/state.svelte';
  import Icon from './Icon.svelte';

  // Compact: a search box and what is selected, as chips. The ⌄ opens every filter, one group per line.
  const LABELS: Record<FilterGroup, string> = { phase: 'Phase', type: 'Type', status: 'Status' };
  const options = $derived(filterOptions(dashboard.tasks, dashboard.vocab));
  // How many tasks each button would show, given the search and the selections in the other groups
  const counts = $derived(facetCounts(dashboard.searched, dashboard.filters));
  let open = $state(false);

  const selected = $derived(
    FILTER_GROUPS.filter((g) => dashboard.filters[g].size > 0).map((g) => ({
      group: g,
      labels: options[g].filter((o) => dashboard.filters[g].has(o.value)).map((o) => o.label),
    })),
  );

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
    <div class="filter-bar" class:open>
      <button
        class="filters-toggle"
        id="filters-toggle"
        aria-expanded={open}
        aria-controls="filter-panel"
        onclick={() => (open = !open)}
        ><Icon name="sliders-horizontal" size={14} /> Filters <Icon name="chevron-down" size={14} /></button
      >
      <label class="task-search">
        <Icon name="search" size={14} />
        <input
          type="search"
          id="task-search"
          placeholder="Search tasks"
          aria-label="Search tasks by ID, name, description or type"
          value={dashboard.query}
          oninput={(e) => (dashboard.query = e.currentTarget.value)}
        />
        {#if dashboard.query}
          <button class="search-clear" aria-label="Clear search" onclick={() => (dashboard.query = '')}
            ><Icon name="x" size={12} /></button
          >
        {/if}
      </label>
      <div class="active-filters" id="active-filters">
        {#each selected as s (s.group)}
          <span class="filter-chip" data-filter={s.group}
            ><span class="chip-group">{LABELS[s.group]}:</span>
            {s.labels.join(', ')}<button
              class="chip-clear"
              aria-label="Clear {LABELS[s.group]} filter"
              onclick={() => dashboard.toggleFilter(s.group, 'all')}><Icon name="x" size={12} /></button
            ></span
          >
        {:else}
          <span class="filter-none">All phases, types and statuses</span>
        {/each}
      </div>
      <span class="match-count" id="match-count" aria-live="polite"
        ><strong>{dashboard.filtered.length}</strong> of {dashboard.tasks.length} tasks</span
      >
      <button
        class="reset-view-btn"
        id="reset-view"
        title="Forget this project's saved filters, search, tab and options"
        onclick={() => dashboard.resetView()}>Reset view</button
      >
    </div>
    {#if open}
      <div class="filter-panel" id="filter-panel">
        {#each FILTER_GROUPS as group (group)}
          <div class="filter-group" data-group={group}>
            <div class="filter-group-label">{LABELS[group]}</div>
            <div class="filter-group-buttons">
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
                  ><span class="filter-label">{option.label}</span><span class="filter-count" aria-hidden="true"
                    >{n}</span
                  ></button
                >
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>
