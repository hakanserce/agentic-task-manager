<script lang="ts">
  // The title bar's "N need(s) you" chip (D-3.3): it takes you to the task. One task opens its details; several open a
  // list of them under the chip (a menu: the arrows, Home and End move, Enter opens, Escape or a click outside closes,
  // and focus goes back to the chip). It sits in the subtitle's <p>, so it is built from phrasing elements only.
  import { tick } from 'svelte';
  import { dashboard } from '../lib/state.svelte';
  import type { Task } from '../lib/types';
  import { kindOf } from '../lib/vocab';
  import { needingUser } from '../lib/waiting';

  const needYou = $derived(needingUser(dashboard.tasks, dashboard.vocab));
  let open = $state(false);
  let root = $state<HTMLElement>();
  let chip = $state<HTMLButtonElement>();
  let list = $state<HTMLElement>();

  const reason = (t: Task) => (kindOf(dashboard.vocab, t.status) === 'review' ? 'in review' : 'blocked on a question');
  const rows = () => [...(list?.querySelectorAll<HTMLButtonElement>('.needs-you-row') ?? [])];

  async function onChip() {
    if (needYou.length === 1) {
      dashboard.showDetail(needYou[0].id);
      return;
    }
    if (open) {
      close();
      return;
    }
    open = true;
    await tick();
    rows()[0]?.focus();
  }

  function close(refocus = true) {
    open = false;
    if (refocus) chip?.focus();
  }

  function choose(id: string) {
    close();
    dashboard.showDetail(id);
  }

  function onKey(e: KeyboardEvent) {
    const all = rows();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      all[Math.max(0, Math.min(all.length - 1, to))]?.focus();
    };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(all.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  function onWindowClick(e: MouseEvent) {
    if (open && root && !root.contains(e.target as Node)) close(false);
  }

  // The list closes when it has nothing left to list (the tasks were answered meanwhile)
  $effect(() => {
    if (open && needYou.length < 2) open = false;
  });
</script>

<svelte:window onclick={onWindowClick} />

{#if needYou.length}
  <span class="menu-anchor needs-you" bind:this={root}>
    <button
      class="attention-chip"
      id="attention-count"
      bind:this={chip}
      aria-haspopup={needYou.length > 1 ? 'menu' : undefined}
      aria-expanded={needYou.length > 1 ? open : undefined}
      title={needYou.length === 1 ? `Open ${needYou[0].id} ${needYou[0].name}` : 'Show the tasks that need you'}
      onclick={onChip}>{needYou.length} need{needYou.length === 1 ? 's' : ''} you</button
    >
    {#if open}
      <span
        class="menu needs-you-menu"
        id="needs-you-menu"
        role="menu"
        aria-label="Tasks that need you"
        tabindex="-1"
        bind:this={list}
        onkeydown={onKey}
      >
        {#each needYou as task (task.id)}
          <button class="needs-you-row" role="menuitem" data-id={task.id} onclick={() => choose(task.id)}>
            <span class="needs-you-id">{task.id}</span>
            <span class="needs-you-name">{task.name}</span>
            <span class="needs-you-reason">{reason(task)}</span>
          </button>
        {/each}
      </span>
    {/if}
  </span>
{/if}
