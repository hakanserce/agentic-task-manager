<script lang="ts">
  import { computeTimeline, formatDate, formatDateTime } from '../lib/timeline';
  import type { Task } from '../lib/types';

  let { tasks }: { tasks: Task[] } = $props();
  const timeline = $derived(computeTimeline(tasks));
</script>

{#if timeline}
  <div class="timeline-card">
    <div class="label">Activity</div>
    <div class="timeline-bars">
      {#each timeline.buckets as bucket, i (i)}
        <div class="timeline-bar" style="height:{bucket.height}px">
          {#if bucket.completions.length > 0}
            <div class="timeline-tooltip">
              <strong>{bucket.completions.length} completed</strong><br />
              {formatDateTime(bucket.start)} — {formatDateTime(bucket.end)}
              {#each bucket.completions as c (c.id)}<br />{c.id}: {c.name}{/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    <div class="timeline-range"><span>{formatDate(timeline.minT)}</span><span>{formatDate(timeline.maxT)}</span></div>
  </div>
{/if}
