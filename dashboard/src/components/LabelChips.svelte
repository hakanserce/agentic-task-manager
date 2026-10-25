<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import type { Task } from '../lib/types';
  import { labelsOf, labelText } from '../lib/vocab';

  // A task's labels as small neutral chips, in meta.labels' order (D-2.4); nothing when it has none
  let { task }: { task: Task } = $props();
  const labels = $derived(labelsOf(dashboard.vocab, task));
</script>

{#if labels.length}
  <span class="label-chips"
    >{#each labels as label (label)}<span class="label-chip" data-label={label} title="Label: {label}"
        >{labelText(dashboard.vocab, label)}</span
      >{/each}</span
  >
{/if}
