<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import { priorityStyle } from '../lib/theme';
  import type { Task } from '../lib/types';
  import { priorityLabel, priorityOf, priorityRank } from '../lib/vocab';

  // The task's priority, or the project's default for a task without one (shown like any other)
  let { task }: { task: Task } = $props();
  const id = $derived(priorityOf(dashboard.vocab, task));
  const style = $derived(priorityStyle(priorityRank(dashboard.vocab, id)));
</script>

<span
  class="badge priority-badge"
  data-priority={id}
  style="background:{style.bg};color:{style.color}"
  title="{id} {priorityLabel(dashboard.vocab, id)} priority{task.priority === id ? '' : ' (the default)'}">{id}</span
>
