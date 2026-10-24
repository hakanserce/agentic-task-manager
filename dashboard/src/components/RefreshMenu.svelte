<script lang="ts">
  import { dashboard } from '../lib/state.svelte';
  import Icon from './Icon.svelte';

  // Compact: the reload button shows the auto-refresh state; the menu holds the toggle and the interval.
  let open = $state(false);
  let root: HTMLElement;

  const lastLoaded = $derived(
    new Date(dashboard.loadedAt).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );
  const status = $derived(dashboard.autoRefresh ? `every ${dashboard.autoRefreshSeconds} s` : 'off');

  // Like the legacy dashboard, the interval only applies on "change" (blur/enter), not on every keystroke
  function onIntervalChange(e: Event) {
    dashboard.setAutoRefreshSeconds(parseInt((e.currentTarget as HTMLInputElement).value) || 5);
  }

  function onWindowClick(e: MouseEvent) {
    if (open && !root.contains(e.target as Node)) open = false;
  }

  $effect(() => {
    if (!dashboard.autoRefresh) return;
    const timer = setInterval(() => dashboard.reload(), dashboard.autoRefreshSeconds * 1000);
    return () => clearInterval(timer);
  });
</script>

<svelte:window onclick={onWindowClick} onkeydown={(e) => e.key === 'Escape' && (open = false)} />

<div class="menu-anchor refresh" bind:this={root}>
  <div class="menu-trigger split">
    <button
      class="reload-btn"
      class:spinning={dashboard.reloading}
      id="reload-btn"
      title="Reload tasks.json · auto-refresh {status} · last loaded {lastLoaded}"
      aria-label="Reload tasks.json"
      onclick={() => dashboard.reload()}
    >
      <Icon name="refresh-cw" />
      <span class="refresh-state" class:off={!dashboard.autoRefresh}
        >{#if dashboard.autoRefresh}{dashboard.autoRefreshSeconds}s{:else}<Icon name="pause" size={12} />{/if}</span
      >
    </button>
    <button
      class="menu-chevron"
      id="refresh-menu-btn"
      aria-haspopup="true"
      aria-expanded={open}
      aria-label="Auto-refresh settings"
      onclick={() => (open = !open)}><Icon name="chevron-down" size={14} /></button
    >
  </div>
  {#if open}
    <div class="menu" id="refresh-menu" role="dialog" aria-label="Auto-refresh">
      <label class="auto-refresh-toggle" title="Auto-refresh tasks.json"
        ><input
          type="checkbox"
          id="auto-refresh-check"
          checked={dashboard.autoRefresh}
          onchange={(e) => dashboard.setAutoRefresh(e.currentTarget.checked)}
        /><span class="toggle-track"></span> Auto-refresh</label
      >
      <label class="refresh-interval"
        >Every <input
          type="number"
          class="auto-refresh-interval"
          id="auto-refresh-interval"
          value={dashboard.autoRefreshSeconds}
          min="1"
          max="300"
          title="Interval in seconds"
          onchange={onIntervalChange}
        /> s</label
      >
      <div class="menu-note" id="last-loaded">Last loaded {lastLoaded}</div>
    </div>
  {/if}
</div>
