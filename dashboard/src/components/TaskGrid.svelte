<script lang="ts">
  import { sortTasks, type ListSort } from '../lib/filters';
  import { dashboard } from '../lib/state.svelte';
  import TaskCard from './TaskCard.svelte';

  // The order is part of the project's saved view (dashboard state)
  const tasks = $derived(sortTasks(dashboard.filtered, dashboard.listSort, dashboard.vocab));
</script>

<div id="phases">
  {#if dashboard.loaded}
    <div class="kanban-toolbar">
      <label class="kanban-option"
        >Order <select
          id="list-sort"
          value={dashboard.listSort}
          onchange={(e) => (dashboard.listSort = e.currentTarget.value as ListSort)}
        >
          <option value="file">As in the file</option>
          <option value="priority">By priority</option>
        </select></label
      >
    </div>
    <div class="task-grid">
      {#each tasks as task (task.id)}
        <TaskCard {task} />
      {/each}
      {#if dashboard.filtered.length === 0}
        <div style="color:var(--text-muted);padding:12px;font-size:14px">No tasks match current filters</div>
      {/if}
    </div>
  {/if}
</div>
