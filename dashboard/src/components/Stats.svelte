<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import { computeStats } from '../lib/stats';
  import { typeStyle } from '../lib/theme';
  import Timeline from './Timeline.svelte';

  const stats = $derived(computeStats(dashboard.tasks));
</script>

<div class="stats" id="stats">
  {#if dashboard.loaded}
    {@render card(stats.total, 'var(--text)', 'Total')}
    {@render card(stats.done, 'var(--green)', 'Done')}
    {@render card(stats.inProgress, 'var(--accent)', 'In Progress')}
    {@render card(stats.todo, 'var(--text-muted)', 'Todo')}
    {#if stats.blocked > 0}
      {@render card(stats.blocked, 'var(--red)', 'Blocked')}
    {/if}
    {#each stats.typeCounts as [type, count] (type)}
      {@render card(count, typeStyle(type).color, type)}
    {/each}
    <div class="stat-card" style="flex-grow:1">
      <div class="label" style="margin-bottom:6px">Progress</div>
      <div class="number" style="color:var(--green);font-size:24px">{stats.pct}%</div>
      <div class="progress-bar">
        <div
          class="progress-fill"
          style="width:{stats.pct}%;background:linear-gradient(90deg,var(--green),var(--cyan))"
        ></div>
      </div>
    </div>
    <Timeline tasks={dashboard.tasks} />
  {/if}
</div>

{#snippet card(value: number, color: string, label: string)}
  <div class="stat-card">
    <div class="number" style="color:{color}">{value}</div>
    <div class="label">{label}</div>
  </div>
{/snippet}
