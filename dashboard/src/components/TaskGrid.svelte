<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import TaskCard from './TaskCard.svelte';
</script>

<div id="phases">
  {#if dashboard.loaded}
    <div class="task-grid">
      {#each dashboard.filtered as task (task.id)}
        <TaskCard {task} />
      {/each}
      {#if dashboard.filtered.length === 0}
        <div style="color:var(--text-muted);padding:12px;font-size:14px">No tasks match current filters</div>
      {/if}
    </div>
  {/if}
</div>
