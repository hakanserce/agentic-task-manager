<script lang="ts">
  import { sortTasks, type ListSort } from '../lib/filters';
  import { dashboard } from '../lib/state.svelte';
  import Icon from './Icon.svelte';
  import TaskCard from './TaskCard.svelte';

  // The order is part of the project's saved view (dashboard state)
  const tasks = $derived(sortTasks(dashboard.filtered, dashboard.listSort, dashboard.vocab));
</script>

<div id="phases">
  {#if dashboard.loaded}
    <div class="kanban-toolbar">
      <!-- Drawn by the page, not the platform (.select-box, app.css), so it looks the same everywhere (T-281) -->
      <label class="kanban-option"
        >Order <span class="select-box"
          ><select
            id="list-sort"
            value={dashboard.listSort}
            onchange={(e) => (dashboard.listSort = e.currentTarget.value as ListSort)}
          >
            <option value="file">As in the file</option>
            <option value="priority">By priority</option>
          </select><span class="select-chevron"><Icon name="chevron-down" size={12} /></span></span
        ></label
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
