<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import TaskCard from './TaskCard.svelte';
</script>

<div id="phases">
  {#if dashboard.loaded}
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
      <h2 style="font-size:18px;font-weight:600">Tasks</h2>
      <span class="phase-count">{dashboard.filtered.length} of {dashboard.tasks.length} shown</span>
    </div>
    <div class="task-grid">
      {#each dashboard.filtered as task (task.id)}
        <TaskCard {task} />
      {/each}
      {#if dashboard.filtered.length === 0}
        <div style="color:var(--text-muted);padding:12px;font-size:14px">No tasks match current filters</div>
      {/if}
    </div>
  {:else if dashboard.loadError !== null}
    <div style="background:var(--surface);border:1px solid var(--red);border-radius:8px;padding:24px;color:var(--red)">
      <strong>Failed to load tasks.json</strong><br />
      <span style="color:var(--text-muted)"
        >{dashboard.loadError}<br /><br />The dashboard must be served over HTTP. Start a local server:<br /><code
          style="color:var(--text)">python3 -m http.server 8000</code
        ><br />then open <code style="color:var(--accent)">http://localhost:8000/tasks-dashboard.html</code></span
      >
    </div>
  {/if}
</div>
